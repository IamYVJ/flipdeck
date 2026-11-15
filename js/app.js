// Routing + UI. Hash routes: #/  #/deck/<id>  #/study/<id>   (id "tmp" = read-only file)
import * as store from './store.js';
import { toJSON, toMarkdown, parseAny, fileName, cleanName, FormatError } from './formats.js';
import { Session, filterByTag, tagCounts } from './study.js';

const $ = (s) => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const enc = encodeURIComponent;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmt = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

// ---------- tiny DOM helpers (all user text goes through textContent / append) ----------
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter((x) => x != null && x !== false));
  return e;
}
const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter((x) => x != null && x !== false));
const PATHS ={ up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6' };
function icon(n) {
  const s = document.createElementNS(NS, 'svg');
  const a = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
  for (const k in a) s.setAttribute(k, a[k]);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', PATHS[n]);
  s.append(p);
  return s;
}
const btn = (label, onclick, o = {}) =>
  h('button', { type: 'button', class: 'btn ' + (o.cls || ''), 'aria-label': o.aria, 'aria-pressed': o.pressed, disabled: o.disabled, onclick }, label);

// Tiny markdown subset: **bold**, *italic*, `code`, line breaks. Everything else stays text.
function inline(t, el) {
  const re = /`([^`\n]+)`|\*\*(\S(?:[^\n]*?\S)?)\*\*|\*(\S(?:[^*\n]*?\S)?)\*/g;
  let i = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > i) el.append(t.slice(i, m.index));
    if (m[1] != null) el.append(h('code', null, m[1]));
    else if (m[2] != null) { const s = h('strong'); inline(m[2], s); el.append(s); }
    else el.append(h('em', null, m[3]));
    i = re.lastIndex;
  }
  if (i < t.length) el.append(t.slice(i));
}
function md(text, el) {
  String(text).split('\n').forEach((l, k) => { if (k) el.append(h('br')); inline(l, el); });
  return el;
}

const say = (m) => { const l = $('#live'); l.textContent = ''; setTimeout(() => { l.textContent = m; }, 30); };

const notice = $('#notice');
const setNotice = (...n) => put(notice, n);
const dismiss = () => btn('Dismiss', () => setNotice(), { cls: 'quiet' });
function flash(msg) {
  setNotice(h('p', { class: 'note row', role: 'status' }, h('span', { class: 'grow' }, msg), dismiss()));
}
function errorNote(title, lines) {
  return h('div', { class: 'note warn', role: 'alert' }, h('h2', null, title), lines.map((l) => h('p', { class: 'err' }, l)), dismiss());
}

function confirmable(label, ask, onYes, aria) {
  const box = h('span', { class: 'inl' });
  const draw = () => box.replaceChildren(btn(label, () => {
    const no = btn('Cancel', () => { draw(); box.firstChild.focus(); });
    box.replaceChildren(h('span', { class: 'muted' }, ask), btn('Delete', onYes, { cls: 'primary' }), no);
    no.focus();
  }, { cls: 'quiet', aria }));
  draw();
  return box;
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

let uidN = 0;
function exportPanel(getDecks, base, label = 'Export') {
  const id = 'lay' + uidN++;
  const sel = h('select', { id, onchange: () => store.setSetting('layout', sel.value) },
    h('option', { value: 'list' }, 'List: front | back'), h('option', { value: 'cards' }, 'Cut-out cards (duplex)'));
  sel.value = store.settings.layout;
  const dl = (ext, fn, type) => () => {
    const f = fileName(base, ext);
    download(f, fn(getDecks()), type);
    say(`Downloaded ${f}`);
  };
  return h('details', { class: 'export' }, h('summary', null, label),
    h('div', { class: 'row' },
      btn('JSON', dl('json', toJSON, 'application/json')),
      btn('Markdown', dl('md', toMarkdown, 'text/markdown;charset=utf-8')),
      h('span', { class: 'inl' }, h('label', { for: id }, 'PDF layout'), sel,
        btn('Save as PDF', () => printDecks(getDecks(), sel.value, base)))));
}

// ---------- print ----------
function printDecks(decks, layout, base) {
  if (!decks.some((d) => d.cards.length)) return say('Nothing to print: no cards yet.');
  const cell = (c, k) => h('div', { class: 'pc' + (c ? '' : ' blank') }, c ? md(c[k], h('div')) : null);
  const list = (d) => h('section', { class: 'pdeck' }, h('h1', null, d.name),
    h('table', { class: 'plist' },
      h('thead', null, h('tr', null, h('th', null, 'Front'), h('th', null, 'Back'))),
      h('tbody', null, d.cards.map((c) => h('tr', null,
        h('td', null, md(c.front, h('div')), c.tags.length ? h('div', { class: 't' }, c.tags.join(', ')) : null),
        h('td', null, md(c.back, h('div'))))))));
  const cut = (d) => {
    const out = [];
    for (let i = 0; i < d.cards.length; i += 8) {
      const rows = [];
      for (let r = i; r < Math.min(i + 8, d.cards.length); r += 2) rows.push([d.cards[r], d.cards[r + 1] || null]);
      out.push(h('section', { class: 'sheet' }, rows.flat().map((c) => cell(c, 'front'))));
      out.push(h('section', { class: 'sheet' }, rows.flatMap(([a, b]) => [b, a]).map((c) => cell(c, 'back'))));
    }
    return out;
  };
  $('#print').replaceChildren(...decks.flatMap((d) => (layout === 'cards' ? cut(d) : [list(d)])));
  const prev = document.title;
  document.title = fileName(base, 'pdf').slice(0, -4);
  window.print();
  document.title = prev;
}

let tmpSrc = null; // decks opened read-only
let skipClear = false;

function go(hash, keepNotice) {
  if (location.hash === hash || (hash === '#/' && !location.hash)) render();
  else { skipClear = !!keepNotice; location.hash = hash; }
}

async function ingest(files, mode) {
  const errs = [], decks = [];
  for (const f of files) {
    try {
      if (f.size > 5e6) throw new FormatError('File is larger than 5 MB.');
      decks.push(...parseAny(await f.text(), f.name));
    } catch (e) {
      errs.push(`${f.name}: ${e instanceof FormatError ? e.message : 'Could not read this file.'}`);
    }
  }
  const bad = errs.length ? errorNote(errs.length > 1 ? 'Some files could not be imported' : 'Could not import', errs) : null;
  if (!decks.length) return setNotice(bad);
  if (mode === 'read') { setNotice(bad); return openTmp(decks); }
  setNotice(bad, importPanel(decks));
  say(`Ready to import ${plural(decks.length, 'deck')}`);
}

function openTmp(decks) {
  tmpSrc = decks;
  go('#/study/tmp', true);
}

function importPanel(decks) {
  const modes = decks.map(() => 'merge');
  const total = decks.reduce((n, d) => n + d.cards.length, 0);
  const rows = decks.map((d, i) => {
    const dup = store.findByName(d.name);
    const sel = dup && h('select', { 'aria-label': `If “${d.name}” already exists`, onchange: () => { modes[i] = sel.value; } },
      h('option', { value: 'merge' }, 'Merge (skip duplicates)'), h('option', { value: 'replace' }, 'Replace existing'), h('option', { value: 'copy' }, 'Import as copy'));
    return h('li', null, h('span', null, d.name), h('span', { class: 'muted' }, plural(d.cards.length, 'card') + (dup ? ' · name exists' : '')), sel);
  });
  const run = () => {
    try {
      const s = store.importDecks(decks, modes);
      const parts = [['added', s.added], ['merged', s.merged], ['replaced', s.replaced]].filter((p) => p[1]).map((p) => `${plural(p[1], 'deck')} ${p[0]}`);
      go('#/', true);
      flash(`Imported: ${parts.join(', ')} (${plural(s.cards, 'card')} added)`);
    } catch (e) {
      setNotice(errorNote('Import failed, nothing was changed', [String(e.message || e)]));
    }
  };
  return h('section', { class: 'note panel', 'aria-label': 'Import' },
    h('h2', null, `Import ${plural(decks.length, 'deck')} · ${plural(total, 'card')}`), h('ul', null, rows),
    h('div', { class: 'row' }, btn('Import', run, { cls: 'primary' }),
      btn('Study without saving', () => { setNotice(); openTmp(decks); }), btn('Cancel', () => setNotice(), { cls: 'quiet' })));
}

// ---------- views ----------
function homeView() {
  const decks = store.decks();
  const nameIn = h('input', { id: 'nd', placeholder: 'e.g. Spanish Basics', maxlength: 80, autocomplete: 'off' });
  const form = h('form', {
    class: 'new-deck',
    onsubmit: (e) => {
      e.preventDefault();
      if (!cleanName(nameIn.value)) return nameIn.focus();
      go('#/deck/' + enc(store.createDeck(nameIn.value).id));
    },
  }, h('div', null, h('label', { for: 'nd' }, 'New deck'), nameIn), h('button', { class: 'btn primary', type: 'submit' }, 'Create'));

  const row = (d) => {
    const li = h('li');
    const draw = () => put(li,
      h('a', { class: 'deck-name', href: '#/deck/' + enc(d.id) }, d.name),
      h('div', { class: 'deck-meta' }, `${plural(d.cards.length, 'card')} · Edited ${fmt(d.updatedAt)}`),
      d.sample && h('p', { class: 'hint' }, 'A sample to look around with. ',
        btn('Remove sample', () => { store.deleteDeck(d.id); render(); say('Sample removed'); }, { cls: 'quiet' })),
      h('div', { class: 'acts' },
        d.cards.length ? h('a', { class: 'btn quiet', href: '#/study/' + enc(d.id), 'aria-label': `Study ${d.name}` }, 'Study') : null,
        btn('Rename', rename, { cls: 'quiet', aria: `Rename ${d.name}` }),
        btn('Duplicate', () => { const c = store.duplicateDeck(d.id); render(); say(`Created ${c.name}`); }, { cls: 'quiet', aria: `Duplicate ${d.name}` }),
        confirmable('Delete', `Delete “${d.name}”?`, () => { store.deleteDeck(d.id); render(); say('Deck deleted'); }, `Delete ${d.name}`)));
    const rename = () => {
      const inp = h('input', { value: d.name, 'aria-label': 'Deck name', maxlength: 80 });
      li.replaceChildren(h('form', {
        class: 'rename',
        onsubmit: (e) => { e.preventDefault(); if (!cleanName(inp.value)) return inp.focus(); store.renameDeck(d.id, inp.value); render(); },
        onkeydown: (e) => { if (e.key === 'Escape') { draw(); li.querySelector('.acts button').focus(); } },
      }, inp, h('button', { class: 'btn primary', type: 'submit' }, 'Save'), btn('Cancel', draw)));
      inp.focus();
      inp.select();
    };
    draw();
    return li;
  };

  return {
    title: 'Decks',
    el: [h('h1', null, 'Decks'), form,
      decks.length ? h('ul', { class: 'decks' }, decks.map(row)) : h('p', { class: 'empty' }, 'No decks yet. Create one above, or import a .json or .md file.'),
      decks.length ? exportPanel(() => store.decks(), 'all', 'Export all decks') : null],
  };
}

let formN = 0;
function cardForm({ card, label, onSave, onCancel }) {
  const n = formN++;
  const front = h('textarea', { id: `cf${n}`, rows: 2, value: card ? card.front : '' });
  const back = h('textarea', { id: `cb${n}`, rows: 3, value: card ? card.back : '' });
  const tags = h('input', { id: `ct${n}`, placeholder: 'comma, separated', autocomplete: 'off', value: card ? card.tags.join(', ') : '' });
  const err = h('p', { class: 'err', role: 'alert', hidden: true }, 'Front can’t be empty.');
  const submit = () => {
    err.hidden = !!front.value.trim();
    if (err.hidden) onSave({ front: front.value, back: back.value, tags: tags.value });
    else front.focus();
  };
  const form = h('form', {
    class: 'form', novalidate: true,
    onsubmit: (e) => { e.preventDefault(); submit(); },
    onkeydown: (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
      else if (e.key === 'Escape' && onCancel) onCancel();
    },
  },
  h('div', null, h('label', { for: `cf${n}` }, 'Front'), front), err,
  h('div', null, h('label', { for: `cb${n}` }, 'Back'), back),
  h('div', null, h('label', { for: `ct${n}` }, 'Tags (optional)'), tags),
  h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, label), onCancel ? btn('Cancel', onCancel) : null,
    h('span', { class: 'hint' }, 'Ctrl/⌘ + Enter saves')));
  return { form, front };
}

function deckView(d) {
  const meta = h('p', { class: 'muted' });
  const study = h('a', { class: 'btn primary', href: '#/study/' + enc(d.id) }, 'Study');
  const list = h('ul', { class: 'cards' });

  const focusRow = (id, key) => {
    const li = [...list.children].find((x) => x.dataset.id === id);
    const b = li && (li.querySelector(`[data-k="${key}"]:not([disabled])`) || li.querySelector('[data-k]:not([disabled])'));
    if (b) b.focus();
  };
  const refresh = () => {
    meta.textContent = `${plural(d.cards.length, 'card')} · Edited ${fmt(d.updatedAt)}`;
    study.hidden = !d.cards.length;
    list.replaceChildren(...(d.cards.length ? d.cards.map(cardRow) : [h('li', { class: 'empty' }, 'No cards yet. Add the first one above.')]));
  };
  const cardRow = (c, i) => {
    const li = h('li', { 'data-id': c.id });
    const tag = (b, k) => { b.dataset.k = k; return b; };
    const move = (delta, k) => () => { store.moveCard(d.id, c.id, delta); refresh(); focusRow(c.id, k); say(`Moved to position ${i + 1 + delta}`); };
    const view = () => put(li,
      md(c.front, h('div', { class: 'cfront' })), md(c.back, h('div', { class: 'cback' })),
      c.tags.length ? h('div', { class: 'tags' }, c.tags.map((t) => h('span', null, t))) : null,
      h('div', { class: 'acts' },
        tag(btn(icon('up'), move(-1, 'up'), { cls: 'quiet icon', aria: `Move card ${i + 1} up`, disabled: i === 0 }), 'up'),
        tag(btn(icon('down'), move(1, 'down'), { cls: 'quiet icon', aria: `Move card ${i + 1} down`, disabled: i === d.cards.length - 1 }), 'down'),
        tag(btn('Edit', edit, { cls: 'quiet', aria: `Edit card ${i + 1}` }), 'edit'),
        confirmable('Delete', 'Delete this card?', () => { store.deleteCard(d.id, c.id); refresh(); say('Card deleted'); }, `Delete card ${i + 1}`)));
    const edit = () => {
      const f = cardForm({
        card: c, label: 'Save changes',
        onSave: (v) => { store.updateCard(d.id, c.id, v); refresh(); focusRow(c.id, 'edit'); say('Card saved'); },
        onCancel: () => { view(); focusRow(c.id, 'edit'); },
      });
      li.replaceChildren(f.form);
      f.front.focus();
    };
    view();
    return li;
  };

  const add = cardForm({
    label: 'Add card',
    onSave: (v) => { store.addCard(d.id, v); add.form.reset(); add.front.focus(); refresh(); say('Card added'); },
  });
  refresh();
  return {
    title: d.name,
    el: [h('div', { class: 'head' }, h('a', { class: 'crumb', href: '#/' }, '← All decks'), h('h1', null, d.name), meta,
      h('div', { class: 'row' }, study, exportPanel(() => [d], d.name))),
    h('section', { 'aria-label': 'Add a card' }, add.form),
    h('section', { 'aria-label': 'Cards' }, list)],
  };
}

function studyView(deck, ro) {
  const back = ro ? '#/' : '#/deck/' + enc(deck.id);
  const tags = tagCounts(deck.cards);
  const sess = new Session(deck.cards, store.settings.shuffle);
  let tag = '', flipped = false, cardEl = null, first = true;

  const prog = h('span', { class: 'progress', 'aria-label': 'Progress' });
  const stage = h('div', { class: 'stage' });
  const bar = h('div', { class: 'actions' });
  const shuf = btn('Shuffle', () => {
    store.setSetting('shuffle', !sess.shuffle);
    shuf.setAttribute('aria-pressed', String(store.settings.shuffle));
    restart();
  }, { pressed: String(sess.shuffle) });
  const sel = tags.length ? h('select', { 'aria-label': 'Filter by tag', onchange: () => { tag = sel.value; restart(); } },
    h('option', { value: '' }, 'All cards'), tags.map(([t, n]) => h('option', { value: t }, `${t} (${n})`))) : null;

  const restart = () => start(filterByTag(deck.cards, tag), store.settings.shuffle);
  const start = (cards, shuffle) => { sess.start(cards, shuffle); draw(); };
  const step = (d) => { d > 0 ? sess.next() : sess.prev(); draw(); };
  const mark = (v) => { sess.mark(v); draw(); };

  const flip = () => {
    if (!cardEl) return;
    flipped = !flipped;
    cardEl.classList.toggle('flipped', flipped);
    cardEl.querySelector('.front').setAttribute('aria-hidden', String(flipped));
    cardEl.querySelector('.back').setAttribute('aria-hidden', String(!flipped));
    say((flipped ? 'Back: ' : 'Front: ') + (flipped ? sess.card.back || 'empty' : sess.card.front));
  };

  function draw() {
    flipped = false;
    cardEl = null;
    const n = sess.total;
    prog.textContent = sess.done ? `${n} / ${n}` : `${sess.i + 1} / ${n}`;
    bar.replaceChildren();
    if (!n) {
      prog.textContent = '';
      stage.replaceChildren(h('p', { class: 'empty' }, tag ? 'No cards with this tag.' : 'This deck has no cards yet.'));
      return;
    }
    if (sess.done) {
      const s = sess.summary();
      stage.replaceChildren(h('div', { class: 'summary' },
        h('h2', null, 'Round complete'),
        h('p', { class: 'muted' }, `${s.got} got it · ${s.again} again` + (s.skipped ? ` · ${s.skipped} unmarked` : '') + ` · ${s.total} cards`),
        h('div', { class: 'row' },
          s.again ? btn(`Re-study ${plural(s.again, 'Again card')}`, () => start(sess.againCards(), sess.shuffle), { cls: 'primary' }) : null,
          btn('Study all again', restart, { cls: s.again ? '' : 'primary' }),
          ro ? btn('Save to library', () => { setNotice(importPanel(tmpSrc)); scrollTo(0, 0); }) : null,
          h('a', { class: 'btn', href: back }, ro ? 'Done' : 'Back to deck'))));
      say(`Round complete. ${s.got} got it, ${s.again} again.`);
      return;
    }
    const c = sess.card;
    const face = (side, text) => h('span', { class: 'face ' + side, 'data-l': side === 'front' ? 'Front' : 'Back', 'aria-hidden': side === 'back' ? 'true' : null },
      md(text || '—', h('span', { class: 'txt' })));
    cardEl = h('button', { type: 'button', class: 'card', onclick: flip },
      h('span', { class: 'inner' }, face('front', c.front), face('back', c.back)));
    stage.replaceChildren(cardEl);
    bar.replaceChildren(
      btn(icon('left'), () => step(-1), { cls: 'icon', aria: 'Previous card', disabled: sess.i === 0 }),
      btn('Again', () => mark('again'), { aria: 'Mark as again' }),
      btn('Got it', () => mark('got'), { cls: 'primary', aria: 'Mark as got it' }),
      btn(icon('right'), () => step(1), { cls: 'icon', aria: 'Next card' }));
    if (!first) { cardEl.focus({ preventScroll: true }); say(`Card ${sess.i + 1} of ${n}. ${c.front}`); }
    first = false;
  }

  const onKey = (e) => {
    const t = e.target;
    if (e.ctrlKey || e.metaKey || e.altKey || (t.closest && t.closest('input,select,textarea'))) return;
    const k = e.key;
    if (k === 'ArrowRight') step(1);
    else if (k === 'ArrowLeft') step(-1);
    else if ((k === ' ' || k === 'Enter') && !(t.closest && t.closest('button,a,summary'))) { e.preventDefault(); flip(); }
    else if ((k === 'g' || k === 'G') && cardEl) mark('got');
    else if ((k === 'a' || k === 'A') && cardEl) mark('again');
    else return;
    if (k.startsWith('Arrow')) e.preventDefault();
  };
  let x0 = 0, y0 = 0;
  stage.addEventListener('touchstart', (e) => { x0 = e.changedTouches[0].clientX; y0 = e.changedTouches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (!cardEl) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
  addEventListener('keydown', onKey);

  draw();
  return {
    title: 'Study ' + deck.name, bar: true, off: () => removeEventListener('keydown', onKey),
    el: [h('div', { class: 'study-top' }, h('a', { class: 'crumb', href: back }, ro ? '← Close' : '← ' + deck.name), prog),
      ro ? h('p', { class: 'hint' }, `Read only: “${deck.name}” is not saved to your library.`) : null,
      h('div', { class: 'study-opts' }, shuf, sel),
      stage, h('p', { class: 'keys' }, 'Space flips · ← → move · G got it · A again'), bar],
  };
}

// ---------- router ----------
let off = null, lastHash = null;

function render() {
  if (off) off();
  off = null;
  const main = $('#main');
  let view = '', id = '';
  try {
    [view, id = ''] = location.hash.slice(2).split('/');
    id = decodeURIComponent(id);
  } catch { view = '?'; }
  let v = null;
  if (view === 'deck' && store.getDeck(id)) v = deckView(store.getDeck(id));
  else if (view === 'study') {
    const d = id === 'tmp'
      ? tmpSrc && { name: tmpSrc.length > 1 ? `${tmpSrc[0].name} + ${tmpSrc.length - 1} more` : tmpSrc[0].name, cards: tmpSrc.flatMap((x) => x.cards) }
      : store.getDeck(id);
    if (d) v = studyView(d, id === 'tmp');
  }
  if (!v) {
    if (view) return void location.replace('#/');
    v = homeView();
  }
  off = v.off || null;
  main.classList.toggle('has-bar', !!v.bar);
  put(main,
    !store.status.ok && h('p', { class: 'note warn', role: 'status' }, 'Your browser is blocking storage, so changes will be lost when you close this tab. Use Export to keep your decks.'),
    v.el);
  document.title = v.title + ' · flipdeck';
  if (lastHash !== location.hash) scrollTo(0, 0);
  lastHash = location.hash;
  main.focus({ preventScroll: true });
}

addEventListener('hashchange', () => {
  if (skipClear) skipClear = false; else setNotice();
  render();
});

// ---------- file picker + drag and drop ----------
const fileIn = $('#file');
let fileMode = 'import';
$('#import').addEventListener('click', () => { fileMode = 'import'; fileIn.click(); });
$('#open-ro').addEventListener('click', () => { fileMode = 'read'; fileIn.click(); });
fileIn.addEventListener('change', () => {
  const files = [...fileIn.files];
  fileIn.value = '';
  if (files.length) ingest(files, fileMode);
});

let drag = 0;
const drop = $('#drop');
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
addEventListener('dragenter', (e) => { if (hasFiles(e)) { e.preventDefault(); drag++; drop.hidden = false; } });
addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', (e) => { if (hasFiles(e) && --drag <= 0) { drag = 0; drop.hidden = true; } });
addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  drag = 0;
  drop.hidden = true;
  ingest([...e.dataTransfer.files], 'import');
});

store.load();
render();
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// "N visitors": GoatCounter read-back for this path; stays hidden if blocked, offline or no data yet.
const gc = $('script[data-goatcounter]');
if (gc) {
  fetch(`${gc.dataset.goatcounter.replace(/\/count$/, '')}/counter/${enc(location.pathname)}.json?start=2026-01-01`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d) => { if (d && d.count != null) { $('#visitor-count').textContent = d.count; $('#visitors').hidden = false; } })
    .catch(() => {});
}
