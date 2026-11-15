// JSON + Markdown serialise/parse. Pure functions, no DOM, no storage.

export class FormatError extends Error {
  constructor(msg, line) {
    super(line ? `Line ${line}: ${msg}` : msg);
    this.line = line || null;
  }
}

export const uid = () => {
  try { return crypto.randomUUID(); } catch { /* insecure context */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
};

export const iso = () => new Date().toISOString();
export const eol = (s) => String(s).replace(/\r\n?/g, '\n');
export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const cleanText = (s) => eol(s ?? '').trim();

export function cleanTags(t) {
  const out = [];
  for (const x of [].concat(t ?? [])) {
    for (const s of String(x).split(',')) {
      const v = s.replace(/\s+/g, ' ').trim();
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

export const slug = (s) =>
  String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';

export function fileName(base, ext, d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `flipdeck-${slug(base)}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`;
}

const validDate = (s) => typeof s === 'string' && !isNaN(Date.parse(s));

// ---------- JSON ----------

export function toJSON(decks) {
  return JSON.stringify({
    app: 'flipdeck', version: 1, exportedAt: iso(),
    decks: decks.map((d) => ({
      id: d.id, name: d.name, createdAt: d.createdAt, updatedAt: d.updatedAt,
      cards: d.cards.map((c) => ({
        id: c.id, front: c.front, back: c.back, tags: c.tags || [],
        createdAt: c.createdAt, updatedAt: c.updatedAt,
      })),
    })),
  }, null, 2);
}

export function fromJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new FormatError(`Not valid JSON (${e.message})`); }
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(data)) throw new FormatError('Top level must be an object like {"app":"flipdeck","version":1,"decks":[...]}');
  if (data.app !== 'flipdeck') throw new FormatError('Not a flipdeck file: "app" must be "flipdeck"');
  if (!Number.isInteger(data.version) || data.version < 1) throw new FormatError('"version" must be a positive integer');
  if (data.version > 1) throw new FormatError(`File version ${data.version} is newer than this app supports (1)`);
  if (!Array.isArray(data.decks)) throw new FormatError('"decks" must be an array');
  if (!data.decks.length) throw new FormatError('The file contains no decks');
  const t = iso();
  return data.decks.map((d, i) => {
    const p = `decks[${i}]`;
    if (!isObj(d)) throw new FormatError(`${p} must be an object`);
    const name = typeof d.name === 'string' ? cleanName(d.name) : '';
    if (!name) throw new FormatError(`${p}.name must be a non-empty string`);
    if (!Array.isArray(d.cards)) throw new FormatError(`${p}.cards must be an array`);
    const seen = new Set();
    const cards = d.cards.map((c, j) => {
      const q = `${p}.cards[${j}]`;
      if (!isObj(c)) throw new FormatError(`${q} must be an object`);
      if (typeof c.front !== 'string' || !c.front.trim()) throw new FormatError(`${q}.front must be a non-empty string`);
      if (c.back != null && typeof c.back !== 'string') throw new FormatError(`${q}.back must be a string`);
      if (c.tags != null && (!Array.isArray(c.tags) || c.tags.some((x) => typeof x !== 'string'))) {
        throw new FormatError(`${q}.tags must be an array of strings`);
      }
      let id = typeof c.id === 'string' && c.id && !seen.has(c.id) ? c.id : uid();
      seen.add(id);
      return {
        id, front: cleanText(c.front), back: cleanText(c.back), tags: cleanTags(c.tags),
        createdAt: validDate(c.createdAt) ? c.createdAt : t,
        updatedAt: validDate(c.updatedAt) ? c.updatedAt : t,
      };
    });
    return {
      id: typeof d.id === 'string' && d.id ? d.id : uid(), name, cards,
      createdAt: validDate(d.createdAt) ? d.createdAt : t,
      updatedAt: validDate(d.updatedAt) ? d.updatedAt : t,
    };
  });
}

// ---------- Markdown ----------
// Lines inside a back that would be read as structure ("## ", "---", and "tags:" on
// the last line) get one extra leading backslash; the parser removes one.

const E0 = /^\\*(?:## |---\s*$)/;
const E1 = /^\\*(?:## |---\s*$|tags:)/i;
const U0 = /^\\(\\*(?:## |---\s*$))/;
const U1 = /^\\(\\*(?:## |---\s*$|tags:))/i;

const encFront = (s) => eol(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
const decFront = (s) => s.replace(/\\(\\|n)/g, (_, c) => (c === 'n' ? '\n' : '\\'));
const trimBlank = (a) => {
  let s = 0, e = a.length;
  while (s < e && !a[s].trim()) s++;
  while (e > s && !a[e - 1].trim()) e--;
  return a.slice(s, e);
};

export function toMarkdown(decks) {
  return decks.map((d) => {
    let out = `---\ndeck: ${cleanName(d.name)}\n---\n`;
    for (const c of d.cards) {
      out += `\n## ${encFront(c.front)}\n`;
      const lines = trimBlank(eol(c.back || '').split('\n'));
      lines.forEach((l, i) => {
        out += ((i === lines.length - 1 ? E1 : E0).test(l) ? '\\' + l : l) + '\n';
      });
      const tags = cleanTags(c.tags);
      if (tags.length) out += `tags: ${tags.join(', ')}\n`;
    }
    return out;
  }).join('\n');
}

export function fromMarkdown(text, fallbackName = 'Imported deck') {
  const lines = eol(text).replace(/^﻿/, '').split('\n');
  const decks = [];
  let deck = null, card = null, buf = [];
  const t = iso();
  const newDeck = (name) => {
    deck = { id: uid(), name, cards: [], createdAt: t, updatedAt: t };
    decks.push(deck);
  };
  const flush = () => {
    if (!card) return;
    let b = trimBlank(buf), tags = [];
    const m = b.length && /^tags:\s*(.*)$/i.exec(b[b.length - 1]);
    if (m) { tags = cleanTags(m[1]); b = trimBlank(b.slice(0, -1)); }
    const back = b.map((l, i) => l.replace(i === b.length - 1 ? U1 : U0, '$1')).join('\n');
    deck.cards.push({ id: uid(), front: card, back, tags, createdAt: t, updatedAt: t });
    card = null;
  };
  const short = (s) => (s.length > 40 ? s.slice(0, 40) + '…' : s);

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (/^---\s*$/.test(L) && /^deck\s*:/i.test(lines[i + 1] || '')) {
      flush();
      let j = i + 1, name = '';
      for (; j < lines.length && !/^---\s*$/.test(lines[j]); j++) {
        if (!lines[j].trim()) continue;
        if (/^## /.test(lines[j])) { j = lines.length; break; }
        const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[j]);
        if (!m) throw new FormatError(`expected "key: value" in front matter, found "${short(lines[j])}"`, j + 1);
        if (m[1].toLowerCase() === 'deck') name = cleanName(m[2]);
      }
      if (j >= lines.length) throw new FormatError('front matter opened here is never closed with "---"', i + 1);
      if (!name) throw new FormatError('"deck:" needs a name', i + 2);
      newDeck(name);
      i = j;
      continue;
    }
    const h = /^## (.*)$/.exec(L);
    if (h) {
      flush();
      if (!deck) newDeck(cleanName(fallbackName) || 'Imported deck');
      const front = decFront(h[1]).trim();
      if (!front) throw new FormatError('card heading "##" has no front text', i + 1);
      card = front;
      buf = [];
    } else if (card !== null) buf.push(L);
    else if (L.trim()) {
      throw new FormatError(deck
        ? 'text before the first "## " card heading'
        : 'expected front matter ("---", "deck: Name", "---") or a "## " card heading', i + 1);
    }
  }
  flush();
  if (!decks.length) throw new FormatError('No decks or cards found');
  if (decks.every((d) => !d.cards.length)) throw new FormatError('No "## " card headings found');
  return decks;
}

export function parseAny(text, filename = '') {
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  if (/\.json$/i.test(filename)) return fromJSON(text);
  if (/\.(md|markdown|txt)$/i.test(filename)) return fromMarkdown(text, base);
  if (filename) throw new FormatError('Unsupported file type: use .json or .md');
  return text.trimStart().startsWith('{') ? fromJSON(text) : fromMarkdown(text, base);
}
