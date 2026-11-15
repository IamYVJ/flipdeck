// localStorage persistence + deck/card operations. Every storage access is try/catch'd.
import { uid, iso, cleanName, cleanText, cleanTags } from './formats.js';

const KEY = 'flipdeck:v1';
const BACKUP = 'flipdeck:backup';
const DEFAULTS = { shuffle: false, layout: 'list' };

const S = { version: 1, seeded: false, settings: { ...DEFAULTS }, decks: [] };
export const status = { ok: true };
export const settings = S.settings;
export const decks = () => S.decks;
export const getDeck = (id) => S.decks.find((d) => d.id === id);
export const findByName = (name, list = S.decks) =>
  list.find((d) => d.name.toLowerCase() === cleanName(name).toLowerCase());

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); status.ok = true; } catch { status.ok = false; }
  return status.ok;
}

// Bring any stored shape up to the current version, or return null.
function migrate(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.decks)) return null;
  const v = Number.isInteger(d.version) ? d.version : 1;
  if (v > 1) return null; // newer app wrote it: leave it alone
  const t = iso();
  return {
    version: 1, seeded: !!d.seeded,
    settings: { ...DEFAULTS, ...(d.settings && typeof d.settings === 'object' ? d.settings : {}) },
    decks: d.decks.filter((x) => x && typeof x.name === 'string' && Array.isArray(x.cards)).map((x) => ({
      id: String(x.id || uid()), name: cleanName(x.name) || 'Untitled deck', sample: !!x.sample,
      createdAt: x.createdAt || t, updatedAt: x.updatedAt || t,
      cards: x.cards.filter((c) => c && typeof c.front === 'string').map((c) => ({
        id: String(c.id || uid()), front: c.front, back: String(c.back ?? ''), tags: cleanTags(c.tags),
        createdAt: c.createdAt || t, updatedAt: c.updatedAt || t,
      })),
    })),
  };
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { status.ok = false; }
  if (raw != null) {
    let m = null;
    try { m = migrate(JSON.parse(raw)); } catch { /* corrupt */ }
    if (m) Object.assign(S, m, { settings: Object.assign(S.settings, m.settings) });
    else { try { localStorage.setItem(BACKUP, raw); } catch { /* ignore */ } } // keep what we couldn't read
  }
  if (!S.seeded && !S.decks.length) seed();
  return S;
}

const stamp = (d) => { d.updatedAt = iso(); delete d.sample; save(); };
const newCard = (f) => {
  const t = iso();
  return { id: uid(), front: cleanText(f.front), back: cleanText(f.back), tags: cleanTags(f.tags), createdAt: t, updatedAt: t };
};

function seed() {
  const t = iso();
  const c = (front, back, tags) => newCard({ front, back, tags });
  S.decks.push({
    id: uid(), name: 'Welcome to flipdeck', sample: true, createdAt: t, updatedAt: t,
    cards: [
      c('Tap, click or press Space to flip this card', 'Arrow keys, buttons or a swipe move on.', ['basics']),
      c('How do I mark what I know?', 'Press **Got it** or **Again** (G / A). At the end, re-study just the Again cards.', ['basics']),
      c('Which formatting works?', '**bold**, *italic* and `code`.\nLine breaks are kept too.', ['formatting']),
      c('Where is my data stored?', 'Only in this browser; nothing is uploaded. **Export** keeps a copy.', ['privacy']),
      c('How do I add my own cards?', 'Create a deck, then fill in Front and Back. Ctrl+Enter saves and keeps the form ready for the next card.', ['basics']),
    ],
  });
  S.seeded = true;
  save();
}

export function setSetting(k, v) { S.settings[k] = v; save(); }

export function createDeck(name) {
  const t = iso();
  const d = { id: uid(), name: cleanName(name) || 'Untitled deck', createdAt: t, updatedAt: t, cards: [] };
  S.decks.push(d);
  save();
  return d;
}
export function renameDeck(id, name) {
  const d = getDeck(id), n = cleanName(name);
  if (d && n) { d.name = n; stamp(d); }
}
export function deleteDeck(id) {
  S.decks = S.decks.filter((d) => d.id !== id);
  save();
}

const uniqueName = (name, list) => {
  if (!findByName(name, list)) return name;
  for (let n = 1; ; n++) {
    const cand = `${name} (copy${n > 1 ? ' ' + n : ''})`;
    if (!findByName(cand, list)) return cand;
  }
};
const cloneDeck = (d, name) => {
  const t = iso();
  return {
    id: uid(), name, createdAt: t, updatedAt: t,
    cards: d.cards.map((c) => ({ ...c, id: uid(), tags: [...c.tags] })),
  };
};
export function duplicateDeck(id) {
  const d = getDeck(id);
  if (!d) return null;
  const c = cloneDeck(d, uniqueName(d.name, S.decks));
  S.decks.splice(S.decks.indexOf(d) + 1, 0, c);
  save();
  return c;
}

export function addCard(deckId, f) {
  const d = getDeck(deckId), c = newCard(f);
  if (d) { d.cards.push(c); stamp(d); }
  return c;
}
export function updateCard(deckId, cardId, f) {
  const d = getDeck(deckId), c = d && d.cards.find((x) => x.id === cardId);
  if (!c) return;
  Object.assign(c, { front: cleanText(f.front), back: cleanText(f.back), tags: cleanTags(f.tags), updatedAt: iso() });
  stamp(d);
}
export function deleteCard(deckId, cardId) {
  const d = getDeck(deckId);
  if (d) { d.cards = d.cards.filter((c) => c.id !== cardId); stamp(d); }
}
export function moveCard(deckId, cardId, delta) {
  const d = getDeck(deckId);
  if (!d) return;
  const i = d.cards.findIndex((c) => c.id === cardId), j = i + delta;
  if (i < 0 || j < 0 || j >= d.cards.length) return;
  [d.cards[i], d.cards[j]] = [d.cards[j], d.cards[i]];
  stamp(d);
}

const dupKey = (c) => c.front + '\u0000' + c.back;

// modes[i] ("merge"|"replace"|"copy") applies only when the name already exists.
// Built on a copy and swapped in, so a failure never half-updates the library.
export function importDecks(incoming, modes = []) {
  const next = S.decks.map((d) => ({ ...d, cards: [...d.cards] }));
  const sum = { added: 0, merged: 0, replaced: 0, cards: 0 };
  incoming.forEach((inc, i) => {
    const ex = findByName(inc.name, next), t = iso();
    const fresh = (cards) => cards.map((c) => ({ ...c, tags: [...c.tags] }));
    if (!ex || modes[i] === 'copy') {
      const id = next.some((d) => d.id === inc.id) ? uid() : inc.id;
      next.push({ ...inc, id, name: ex ? uniqueName(inc.name, next) : inc.name, cards: fresh(inc.cards) });
      sum.added++; sum.cards += inc.cards.length;
    } else if (modes[i] === 'replace') {
      Object.assign(ex, { name: inc.name, cards: fresh(inc.cards), updatedAt: t });
      delete ex.sample;
      sum.replaced++; sum.cards += inc.cards.length;
    } else {
      const keys = new Set(ex.cards.map(dupKey));
      for (const c of inc.cards) {
        if (keys.has(dupKey(c))) continue;
        keys.add(dupKey(c));
        ex.cards.push({ ...c, id: ex.cards.some((x) => x.id === c.id) ? uid() : c.id, tags: [...c.tags] });
        sum.cards++;
      }
      ex.updatedAt = t; delete ex.sample;
      sum.merged++;
    }
  });
  S.decks = next;
  save();
  return sum;
}
