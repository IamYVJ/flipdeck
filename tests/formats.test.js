// Tests for js/formats.js, run by formats.test.html.
export function run(F) {
  const res = [];
  const test = (name, fn) => { try { fn(); res.push({ name, ok: true }); } catch (e) { res.push({ name, ok: false, err: e.message }); } };
  const eq = (a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`got ${x}\n  want ${y}`); };
  const bad = (fn, re, line) => {
    try { fn(); } catch (e) {
      if (!(e instanceof F.FormatError)) throw e;
      if (!re.test(e.message)) throw new Error('message: ' + e.message);
      if (line !== undefined && e.line !== line) throw new Error(`line ${e.line}, want ${line}`);
      return;
    }
    throw new Error('did not throw');
  };
  const t = '2024-01-01T00:00:00.000Z';
  const card = (front, back = '', tags = []) => ({ id: F.uid(), front, back, tags, createdAt: t, updatedAt: t });
  const deck = (name, ...cards) => ({ id: F.uid(), name, cards, createdAt: t, updatedAt: t });
  const shape = (ds) => ds.map((d) => [d.name, d.cards.map((c) => [c.front, c.back, c.tags])]);
  const both = (name, ...ds) => {
    test(name + ' [md]', () => eq(shape(F.fromMarkdown(F.toMarkdown(ds))), shape(ds)));
    test(name + ' [json]', () => eq(shape(F.fromJSON(F.toJSON(ds))), shape(ds)));
  };
  const J = (decks) => JSON.stringify({ app: 'flipdeck', version: 1, decks });

  both('basic + tags', deck('Spanish Basics', card('Hola', 'Hello', ['greetings']), card('¿Cómo estás?', 'How are you?\n(multi-line backs are fine)')));
  both('empty back', deck('D', card('Only front'), card('Tags only', '', ['a', 'b'])));
  both('unicode', deck('日本語 ✓ Ünï', card('猫 🐈', 'cat — «chat»', ['日本', 'émoji'])));
  both('multi-line back, blank lines, indent', deck('D', card('Q', 'one\n\nthree\n    indented')));
  both('multi-line front', deck('D', card('line one\nline two', 'b')));
  both('backslashes in front', deck('D', card('C:\\new\\table \\\\ \\n', 'b')));
  both('"## " inside back', deck('D', card('Q', '## not a card\nmore\n\\## escaped\n\\\\## twice')));
  both('"##x", "###" and mid-line ##', deck('D', card('Q', '##tag\n### sub\ntext ## mid')));
  both('"## " inside front', deck('D', card('## odd', 'x')));
  both('--- and fake front matter in back', deck('D', card('Q', 'above\n---\ndeck: Fake\n---\nbelow')));
  both('back ends in tags: line (no tags)', deck('D', card('Q', 'x\ntags: sneaky')));
  both('back ends in tags: line (with tags)', deck('D', card('Q', 'x\nTags: sneaky', ['real'])));
  both('multiple decks', deck('One', card('a', 'b')), deck('Two', card('c', 'd', ['t']), card('e', 'f')), deck('Empty'));

  test('json keeps ids and dates', () => {
    const d = deck('X', card('a', 'b')), r = F.fromJSON(F.toJSON([d]))[0];
    eq([r.id, r.cards[0].id, r.createdAt], [d.id, d.cards[0].id, t]);
  });
  test('json schema fields', () => {
    const o = JSON.parse(F.toJSON([deck('X', card('a', 'b', ['t']))]));
    eq([o.app, o.version, typeof o.exportedAt, Object.keys(o.decks[0].cards[0])], ['flipdeck', 1, 'string', ['id', 'front', 'back', 'tags', 'createdAt', 'updatedAt']]);
  });
  test('json duplicate card ids regenerated, missing back = ""', () => {
    const c = F.fromJSON(J([{ name: 'D', cards: [{ id: 'x', front: 'a' }, { id: 'x', front: 'b' }] }]))[0].cards;
    eq([c[0].id !== c[1].id, c[0].back], [true, '']);
  });
  test('md: spec example', () => {
    const s = '---\ndeck: Spanish Basics\n---\n\n## Hola\nHello\ntags: greetings\n\n## ¿Cómo estás?\nHow are you?\n(multi-line backs are fine)\n';
    eq(shape(F.fromMarkdown(s)), [['Spanish Basics', [['Hola', 'Hello', ['greetings']], ['¿Cómo estás?', 'How are you?\n(multi-line backs are fine)', []]]]]);
  });
  test('md: CRLF, BOM, blank line before tags', () =>
    eq(shape(F.fromMarkdown('\uFEFF---\r\ndeck: D\r\n---\r\n\r\n## Q\r\nA\r\n\r\ntags: x, y\r\n')), [['D', [['Q', 'A', ['x', 'y']]]]]));
  test('md: no front matter uses file name', () => eq(F.parseAny('## Q\nA', 'my notes.md')[0].name, 'my notes'));
  test('md: plain --- rule in a back kept', () => eq(F.fromMarkdown('## Q\na\n---\nb')[0].cards[0].back, 'a\n---\nb'));
  test('md: unknown front matter keys ignored', () => eq(F.fromMarkdown('---\ndeck: D\nauthor: me\n---\n## Q\nA')[0].name, 'D'));

  const bc = (cards) => J([{ name: 'D', cards }]);
  test('err: invalid json', () => bad(() => F.fromJSON('{nope'), /Not valid JSON/));
  test('err: wrong app', () => bad(() => F.fromJSON('{"app":"x","version":1,"decks":[]}'), /Not a flipdeck file/));
  test('err: future version', () => bad(() => F.fromJSON('{"app":"flipdeck","version":9,"decks":[{}]}'), /newer/));
  test('err: no decks', () => bad(() => F.fromJSON(J([])), /no decks/));
  test('err: bad card names its path', () => bad(() => F.fromJSON(bc([{ front: 'a' }, { front: 5 }])), /decks\[0\]\.cards\[1\]\.front/));
  test('err: bad tags', () => bad(() => F.fromJSON(bc([{ front: 'a', tags: [1] }])), /tags/));
  test('err: md prose first (line 3)', () => bad(() => F.fromMarkdown('\n\nhello\n## Q'), /expected front matter/, 3));
  test('err: md unclosed front matter', () => bad(() => F.fromMarkdown('\n---\ndeck: D\n## Q'), /never closed/, 2));
  test('err: md bad front matter line', () => bad(() => F.fromMarkdown('---\ndeck: D\noops\n---\n## Q'), /key: value/, 3));
  test('err: md empty deck name', () => bad(() => F.fromMarkdown('---\ndeck:\n---\n## Q'), /needs a name/, 2));
  test('err: md text before first card', () => bad(() => F.fromMarkdown('---\ndeck: D\n---\nstray\n## Q'), /before the first/, 4));
  test('err: md empty front', () => bad(() => F.fromMarkdown('---\ndeck: D\n---\n## Q\na\n## \nb'), /no front/, 6));
  test('err: md deck with no cards', () => bad(() => F.fromMarkdown('---\ndeck: D\n---\n'), /No "## "/));
  test('err: unsupported extension', () => bad(() => F.parseAny('x', 'a.pdf'), /Unsupported/));

  test('slug + fileName', () => eq([F.slug('Café Ñandú!'), F.slug('日本語'), F.fileName('Spanish Basics', 'json', new Date(2024, 2, 5))], ['cafe-nandu', 'deck', 'flipdeck-spanish-basics-2024-03-05.json']));
  return res;
}
