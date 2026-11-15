// Study session logic. No DOM.

export function shuffled(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export const filterByTag = (cards, tag) => (tag ? cards.filter((c) => c.tags.includes(tag)) : cards);

export function tagCounts(cards) {
  const m = new Map();
  for (const c of cards) for (const t of c.tags) m.set(t, (m.get(t) || 0) + 1);
  return [...m].sort((a, b) => a[0].localeCompare(b[0]));
}

export class Session {
  constructor(cards, shuffle = false) { this.start(cards, shuffle); }

  start(cards, shuffle = this.shuffle) {
    this.shuffle = shuffle;
    this.queue = shuffle ? shuffled(cards) : cards.slice();
    this.i = 0;
    this.marks = new Map(); // card id -> 'got' | 'again'
  }

  get total() { return this.queue.length; }
  get done() { return this.i >= this.queue.length; }
  get card() { return this.queue[this.i]; }
  next() { if (this.i < this.queue.length) this.i++; }
  prev() { if (this.i > 0) this.i--; }

  mark(v) {
    if (this.done) return;
    this.marks.set(this.card.id, v);
    this.next();
  }

  summary() {
    let got = 0, again = 0;
    for (const v of this.marks.values()) v === 'got' ? got++ : again++;
    return { got, again, skipped: this.total - got - again, total: this.total };
  }

  againCards() { return this.queue.filter((c) => this.marks.get(c.id) === 'again'); }
}
