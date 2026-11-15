# flipdeck

**Live: <https://iamyvj.github.io/flipdeck/>**

A small, private flashcard app. Create decks, study them, and save or load them as files. It runs entirely in your browser: no backend, no accounts, no build step, no network requests.

- Plain HTML, CSS and vanilla JS (ES modules). No dependencies.
- Decks live in `localStorage`. Nothing is uploaded anywhere.
- Works offline after the first load (a tiny service worker caches the app).
- Export to **JSON**, **Markdown** or **PDF** (print stylesheet). Import `.json` and `.md` by button or drag and drop.

## Using it

| Task | How |
| --- | --- |
| New deck | Type a name on the home page and press **Create** |
| Add cards | Open a deck, fill in Front / Back / Tags. **Ctrl or ⌘ + Enter** saves and refocuses Front for fast entry |
| Reorder cards | Up / down arrow buttons on each card |
| Study | **Study** on a deck. Space / Enter / tap flips, ← → or swipe moves, **G** / **A** (or the buttons) mark Got it / Again |
| Re-study misses | At the end of a round choose **Re-study N Again cards** |
| Export | **Export** on a deck, or **Export all decks** on the home page |
| PDF | Export → pick a layout → **Save as PDF**, then choose "Save as PDF" as the destination in the print dialog |
| Import | **Import** or drop a file anywhere on the page |
| Study a file without saving it | **Open file** (header), or **Study without saving** in the import panel |

Card text supports `**bold**`, `*italic*`, `` `code` `` and line breaks. Everything else is shown as plain text.

### PDF layouts

- **List**: front and back side by side, one row per card.
- **Cut-out cards**: 8 cards per sheet (2 × 4) with dashed cut lines, then a sheet of backs mirrored left-to-right. Print double-sided with **flip on long edge** and each back lines up behind its front.

## File formats

### JSON (`version` 1)

```json
{
  "app": "flipdeck",
  "version": 1,
  "exportedAt": "2026-01-01T12:00:00.000Z",
  "decks": [
    {
      "id": "uuid",
      "name": "Spanish Basics",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601",
      "cards": [
        { "id": "uuid", "front": "Hola", "back": "Hello", "tags": ["greetings"], "createdAt": "ISO-8601", "updatedAt": "ISO-8601" }
      ]
    }
  ]
}
```

### Markdown

```markdown
---
deck: Spanish Basics
---

## Hola
Hello
tags: greetings

## ¿Cómo estás?
How are you?
(multi-line backs are fine)
```

- Front matter with `deck:` starts a deck. Several decks can follow one another in one file, each with its own front matter.
- Each `## ` heading is a card front; everything up to the next `## ` is the back.
- An optional final line `tags: a, b` sets tags.
- Escaping, so that export → import returns identical cards: a back line that starts with `## ` or `---` gets one extra leading backslash (`\## `), and so does a final back line starting with `tags:`. The importer removes one backslash. In a front (which is a single heading line), a newline is written `\n` and a backslash `\\`.
- A file with no front matter is accepted; the file name becomes the deck name.
- Errors report the line number, for example `Line 4: text before the first "## " card heading`.

### Importing a deck whose name already exists

You choose per deck: **Merge** (adds cards, skipping exact front+back duplicates), **Replace** (swaps the cards of the existing deck) or **Import as copy** (adds `Name (copy)`). A malformed file is rejected as a whole and never changes your library.

## Layout

```
index.html          page shell
styles.css          theme variables (top of file) + screen styles
print.css           print / PDF styles
sw.js               offline cache
js/app.js           routing + UI
js/store.js         localStorage, schema migration, deck/card operations
js/formats.js       JSON + Markdown serialise/parse (no DOM)
js/study.js         study session logic (no DOM)
tests/              format tests + manual checklist (tests/README.md)
```

## License

See `LICENSE`.
