# flipdeck tests

## Automated

Open `tests/formats.test.html` through a local static server (ES modules do not load from `file://`). It runs the JSON and Markdown round-trip and error-case tests and prints PASS / FAIL for each.

## Manual test checklist

Run through these on each target: **desktop** (Chrome/Edge, Firefox, Safari), **iOS Safari**, **Android Chrome**. Use a private window once to check the storage-blocked warning.

**Decks and cards**
- [ ] First run shows the sample deck; "Remove sample" and normal Delete both remove it, and it does not come back after a reload
- [ ] Create, rename (Enter saves, Esc cancels), duplicate and delete a deck; delete asks inline, never a browser dialog
- [ ] Add cards with Ctrl/⌘ + Enter: the form clears and Front is focused again
- [ ] Edit, reorder (up/down) and delete a card; an empty Front shows an error
- [ ] `**bold**`, `*italic*`, `` `code` `` and line breaks render; typing `<b>x</b>` shows the literal text

**Study**
- [ ] Tap/click, Space and Enter flip the card (about 0.3 s; instant with "reduce motion" on)
- [ ] ← → keys, the buttons and a swipe left/right move between cards; swiping does not flip
- [ ] G / A and the Got it / Again buttons mark and advance; progress reads "n / total"
- [ ] End summary shows the counts; "Re-study Again cards" only shows those cards
- [ ] Shuffle toggle and tag filter restart the round
- [ ] Phone: the action bar sits at the bottom, nothing scrolls sideways at 320 px, buttons are easy to hit

**Export / import**
- [ ] Download JSON and Markdown; file names look like `flipdeck-<deck>-YYYY-MM-DD.json`
- [ ] Import the same files back: "Import as copy" gives identical cards; "Merge" adds nothing new; "Replace" swaps the cards
- [ ] Drag a `.md` and a `.json` onto the page (desktop): the drop overlay appears and the import panel opens
- [ ] A broken file (e.g. text before the first `## `, or JSON missing `"app"`) shows a clear error with a line number or path and changes nothing
- [ ] "Open file" / "Study without saving" studies the file and leaves the library unchanged

**Print / PDF** (use the browser's print preview)
- [ ] List layout: front and back side by side, header row repeats, no app chrome, rows do not split across pages
- [ ] Cut-out layout: 2 × 4 cards per sheet with dashed lines, then a mirrored sheet of backs; with duplex "flip on long edge" each back sits behind its front
- [ ] Works on both A4 and Letter; dark mode still prints black on white

**Offline and accessibility**
- [ ] After one load, switch the network off and reload: the app still opens with your decks
- [ ] Tab through everything with the keyboard; focus is always visible; screen reader announces flips, imports and errors
- [ ] Check both light and dark themes

