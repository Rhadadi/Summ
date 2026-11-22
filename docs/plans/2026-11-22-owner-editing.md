# Inkling (Summ): implementation plan for nine owner requests

Repo root: `/Users/rhd/Projects/book_summary/Summ`.

## 0. Ground rules for the implementer

- **Branch.** The checkout is on `codex/booksumm-server-deployment`, not `main`. It is 86 commits ahead of `main`, and `main` has not moved since Nov 7. Branch from the current branch. Do not touch `main`, and leave the untracked `design/` folder alone. Commit only when the user asks.
- **Interpretation.** The "workstation page" is the published reading page `#/b/:slug/read`: `PublishedBook` in `mode="read"`, which renders `ReaderPage`. "Edit book" is `PublishedEditor` at `#/edit/:id`. The local device reader `#/read/:id` is out of scope.
- **Code style.** The code is dense, one statement per line where possible, with comments that explain why. Match it.
- **Translations.** Strings go through `tr(lang, englishText)`, with Persian in the `fa` object of `/Users/rhd/Projects/book_summary/Summ/src/i18n.ts`. Every new visible string must use `L(...)` and get a `fa` entry, including owner-only screens. Build interpolated text by concatenation, as the existing code does.
- **Modules used by node tests.** Runtime imports need the `.ts` extension (type-only imports may omit it). No JSX, MUI, `import.meta.env` or `enum` in these modules. Put pure logic in small modules like `/Users/rhd/Projects/book_summary/Summ/src/structured-import.ts`.
- **Validation commands:** `npm test`, `npm run build` (which runs `tsc --noEmit`), and `python3 -m unittest discover -s tests -p 'test_*.py'`.
- **Local QA.** Run the dev servers as described in the README. In a local dev database only, never production, make your test user an editor (`UPDATE users SET role='editor' …` in `data/summ.db`). Editors may change books they published (`own_or_owner`). Publish a test book through Summary ZIP. Test at 390 px and at 1440 px, in both Persian and English.

---

## 1. Findings

### 1.1 Editing on the reading page
- **The reader shows plain text.** `/Users/rhd/Projects/book_summary/Summ/src/ReaderPage.tsx` lines 68–71 render `{x.text}`; line 118 renders takeaways; line 113 renders the chapter title (h1). `PublishedBook` passes `readOnly` and no-op handlers (`/Users/rhd/Projects/book_summary/Summ/src/PublishedBook.tsx` lines 54–56). App gives it no role or edit information (`/Users/rhd/Projects/book_summary/Summ/src/App.tsx` line 184).
- **Editing only exists in the editor.** `/Users/rhd/Projects/book_summary/Summ/src/PublishedEditor.tsx` uses plain multiline fields (lines 45–54). The Chapters tab (lines 110–114) stacks every chapter on one long page, which is why finding a sentence is hard.
- **Bold cannot be stored today.** `PubPara` is `{heading?, text, pages?, chapters?, quote?, table?, image?}` (`/Users/rhd/Projects/book_summary/Summ/src/types.ts` line 30). The Markdown importer's `inline()` strips bold, italic, links and code (`/Users/rhd/Projects/book_summary/Summ/src/structured-import.ts` lines 19–21) and turns bullets into separate paragraphs (lines 55–56). What the model supports: one heading level per paragraph, quote, table, image with a caption, and the overview's takeaway list. It has no lists or links.
- **Saves overwrite silently.** Every save posts the whole document (`/Users/rhd/Projects/book_summary/Summ/src/api.ts` line 53 → `/Users/rhd/Projects/book_summary/Summ/server/app.py` lines 490–492 → `/Users/rhd/Projects/book_summary/Summ/server/library.py` lines 101–113). It is an `UPDATE` with no version check, so the last save wins.
- **Edits must use the raw document.** `adaptPublished` strips "(p. 12)"-style references from the displayed text (`/Users/rhd/Projects/book_summary/Summ/src/published.ts` line 15). If the editor edited the adapted text, those references would be lost on save.
- **The text feeds other outputs.** Narration (`library.py` line 161, `_say`), home blurbs (`library.py` lines 72–83) and emails (`/Users/rhd/Projects/book_summary/Summ/server/mailing.py` lines 118 and 126) all use it, so any formatting markers must be stripped there.

### 1.2 Homepage list missing books (bug)
- **Root cause:** `/Users/rhd/Projects/book_summary/Summ/src/HomePage.tsx` line 36 builds slides from `books_.slice(0,12)`, but the shelf below (line 41) renders only `books_.slice(0,8)`. Books 9–12 in the home order appear in the slider only; books after 12 appear in neither. Commit `62f202f` removed the "See all" link, so nothing on the page leads to the rest. شکل‌گیری آیین‌های اسلامی is almost certainly at index 8–11. Confirm with a read-only request: `curl -s https://booksumm.duckdns.org/api/home` and `/api/library`.
- **Second cause:** `homeBooks()` (`/Users/rhd/Projects/book_summary/Summ/src/bookBackdrop.ts` lines 7–10) also drops books whose slide is unticked in HomeEditor. The editor describes that tick as "which books slide" (`/Users/rhd/Projects/book_summary/Summ/src/HomeEditor.tsx` line 27), yet it also removes the book from the shelf.
- Unlisted books are excluded on purpose (`library.py` line 120). That is correct.

### 1.3 Background image framing
- **What is stored.** One background per book; there are no per-chapter backgrounds. It lives in `data/art/<id>.json` (`/Users/rhd/Projects/book_summary/Summ/server/artwork.py` lines 50–80) as mode, fit, caption and credit. There is no framing data.
- **Fixed positions.** `bookBackdrop` hard-codes `'50% 40%'` (`bookBackdrop.ts` line 14).
- **The home slider ignores position.** `/Users/rhd/Projects/book_summary/Summ/src/MuseumHero.tsx` line 61 sets no style, so the browser uses 50% 50%. BookDetail (`/Users/rhd/Projects/book_summary/Summ/src/BookDetail.tsx` line 97) and the chapter header (`ReaderPage.tsx` line 112) do set `objectPosition`.
- **CSS would block a zoom style.** `/Users/rhd/Projects/book_summary/Summ/src/styles.css` line 542 has `.m-art{…transform:none!important;animation:none!important}` and lines 566–568 force `object-fit`. An inline zoom transform would lose to these rules.
- **Three frames with different shapes.** The home slider is wide on desktop but tall on phones (≤899 px, `styles.css` line 338). The book intro is `.curated-intro-art`. The chapter header is a wide strip (`/Users/rhd/Projects/book_summary/Summ/src/curated.css` lines 39 and 44).
- **Text colour can be misjudged.** The slider picks text colour from the centre of the picture (`MuseumHero.tsx` line 25), which will be wrong once the picture is reframed.
- **Current controls.** Only "Fill" or "Whole picture" and the choice of source (`PublishedEditor.tsx` line 105).

### 1.4 Listen button shows without audio (bug)
- **Book page:** the published book page always shows Listen (`BookDetail.tsx` line 103). With no audio, clicking it only shows a toast (`PublishedBook.tsx` line 46).
- **Reader:** the chapter header shows Listen whenever the chapter has a summary (`ReaderPage.tsx` lines 113 and 125), whether or not audio exists.
- **Listening library:** `#/library/listen` shows Listen on every card (`/Users/rhd/Projects/book_summary/Summ/src/PublicLibrary.tsx` line 18).
- **The data is there.** `narrationStatus` is already fetched (`PublishedBook.tsx` line 26) but only used on click. The book list carries no audio information (`library.py` lines 95–99).
- **Regenerating removes the audio first.** `INSERT OR REPLACE … tracks='[]'` (`library.py` line 189) and deleting the old files before the new ones exist (line 194) mean a book has no audio while it is being regenerated.

### 1.5 Adding audio after publishing
- **Audio can only start at publish time.** It is started from `/Users/rhd/Projects/book_summary/Summ/src/PublishDialog.tsx` (lines 64 and 114–118) and `/Users/rhd/Projects/book_summary/Summ/src/NewBookWizard.tsx` (lines 130–131). The wizard's failure message says "Start it later from the book page", but no such control exists. PublishedEditor has no audio tab (line 88).
- **The server request is minimal.** It accepts only language, type and engine (`app.py` lines 624–632).
- **ElevenLabs:** the voice ID comes only from Account (`/Users/rhd/Projects/book_summary/Summ/src/AccountDialog.tsx` line 92). The voice settings are fixed (`/Users/rhd/Projects/book_summary/Summ/server/audio.py` line 12) and the model comes from an environment variable (line 9). There is no speed setting.
- **Offline voice (Piper):** no speed setting (`audio.py` lines 26–33).
- **No control over a run.** Narration covers the whole book every time. There is no delete, cancel, server-side estimate or per-chapter update. There is also a stray schema change inside `start_narration` (`library.py` lines 187–188).

### 1.6 and 1.7 "Back to editing" and "View as visitor" go home (bug)
- **Root cause:** `App.tsx` line 185 runs `onToggleVisitor={()=>{setAsVisitor(v=>!v);navigate('/');}}`. Both directions always navigate to `/`.
- **The switch is missing where the owner reads.** It exists only inside Shell (`/Users/rhd/Projects/book_summary/Summ/src/Shell.tsx` lines 41, 56 and 70). Both readers render outside Shell (`App.tsx` lines 183–184).
- **Some routes do not exist for visitors.** `#/edit/:id` requires edit rights (`App.tsx` line 177); without them it falls through to the homepage while the URL stays `#/edit/...`.
- **No chapter deep links.** The chapter position is kept only in localStorage (`published.ts` lines 34–35). The editor URL has no tab or chapter.
- **The visitor state is lost on reload.** `asVisitor` is in-memory only (`App.tsx` line 35). The visitor bar text is English only (`Shell.tsx` line 70).
- **Scroll position already works.** It is saved per book and chapter (`/Users/rhd/Projects/book_summary/Summ/src/reading.ts` lines 46–48; `ReaderPage.tsx` lines 32–41). If the switch stays on the same route, the page does not remount and the scroll position is kept.

### 1.8 "دیگران چه می‌گویند" (What others say) section
- **Where it is:** `BookDetail.tsx` lines 176–185, rendered by `/Users/rhd/Projects/book_summary/Summ/src/ReviewSection.tsx` (whole file).
- **The data is already structured.** The `Review` model in `/Users/rhd/Projects/book_summary/Summ/server/reviews.py` lines 48–58 has verdict, ratings, critics (publication, reviewer, date, headline and its translation, stance, excerpt, translation, summary, url, verified), readers, pros, cons, themes, awards, impact, legacy quotes and sources. No parsing is needed.
- **Why it looks disorganized:** `ReviewSection.tsx` lines 20–53 show everything at once in one stack, with no lead line and no "show more":
  - a score board, then the verdict and themes;
  - up to 8 critic cards. In Persian each card has the headline, the English excerpt, the Persian translation and a Persian summary, so the same review appears three times;
  - up to 6 reader cards and up to 8 + 8 praise and criticism points;
  - awards, then the related-books shelf nested inside the reception;
  - a "Read more" row that repeats links already on the cards (`/Users/rhd/Projects/book_summary/Summ/src/review-links.ts` line 10).
- **Not suited to Persian.** Dates are raw English strings, and publication names are upper-case and letter-spaced (`styles.css` line 438).
- **Empty heading bug.** BookDetail always renders the section and its heading (line 176), even when there is nothing to show.

### 1.9 "اگر این کتاب را دوست داشتید" (If you liked this book) not showing (bug)
- **Main root cause:** `ReviewSection.tsx` line 47 has `.filter(b=>lang!=='fa'||!!relatedInPersian(b.title))`. On Persian pages it keeps only titles found in a hard-coded list of 13 books (`/Users/rhd/Projects/book_summary/Summ/src/persian-display.ts` lines 31–46). The server returns English titles (the suggestion prompt asks for them, `reviews.py` line 233), so nearly every Persian book ends up with an empty shelf. The outer check uses the unfiltered length, so the result is either an empty heading or nothing.
- **Ratings are ignored.** They are fetched (`/Users/rhd/Projects/book_summary/Summ/server/related.py` line 23) but never used: sorting ignores them (line 68) and the cards never show them.
- **Subject matching was never built.** The "same subjects" search is described in the docstring, but `_subjects` is unused (lines 11–17) and so is the `categories` argument (line 27).
- **Few results without a Gemini key.** Suggestions need the owner's Gemini key (`app.py` lines 538–539). Without it, only up to 2 same-author books remain, and those are filtered out in Persian.
- **Books in this library are never suggested.**
- **Old lists stick.** Non-empty results are cached for 14 days (`related.py` line 76) and there is no refresh.

---

## 2. Design

### 2.1 Editing on the reading page

**Formatting model: markers inside `text`.** Keep `PubPara` as it is and allow a small inline syntax inside `text`:
- `**…**` means bold and `*…*` means italic. `\*` is a literal asterisk and `\\` a literal backslash.
- Markers follow the same rules the importer uses when it strips them. An opening marker comes at the start or after a space or opening punctuation ( `(`, `«`, `"`, `“` ) and is followed by a non-space. A closing marker is preceded by a non-space and followed by the end, a space or punctuation. Anything else is a literal asterisk.
- Because of those rules, existing documents contain no accidental markers. Verify this once, read-only, by scanning the production documents for `*`.
- Bold and italic may nest. Headings stay plain.

Why markers rather than stored offsets: the server schema does not change, the old editor keeps working (the owner can even type `**…**`), the change is lossless and easy to diff, and the page-reference stripping is unaffected.

The cost is that plain-text consumers must strip markers:
- Server: `_say` (narration), `_blurb`, and in mailing `_takeaways` and `_blurb_for`.
- Narration change-detection hashes use the stripped text, so a formatting-only edit never makes audio out of date.

**Headings, lists and links.**
- Headings: a single level, which is the paragraph's `heading` (h2).
- Lists and links: not supported by the model, so they are left out. Adding a `list` field is a future schema change; do not add it now.

**New pure module `/Users/rhd/Projects/book_summary/Summ/src/inline.ts`:**
```ts
export type Span={text:string;b?:true;i?:true};
parseInline(s:string):Span[]; serializeInline(sp:Span[]):string; plainInline(s:string):string;
toggleMark(sp,start,end,m:'b'|'i'):Span[]; clearMarks(sp,start,end):Span[]; hasMark(sp,start,end,m):boolean;
splitSpans(sp,at):[Span[],Span[]]; concatSpans(a,b):Span[]; spansToHtml(sp):string /* escapes & < > " ' */
```
- `serializeInline` merges neighbouring spans with the same marks and moves leading and trailing spaces outside the markers.
- `/Users/rhd/Projects/book_summary/Summ/src/Inline.tsx` exports `<Inline text/>`, which renders `<strong>` and `<em>`.
- Server twin: `/Users/rhd/Projects/book_summary/Summ/server/inline.py` with `strip_inline()`.
- Shared test cases go in `/Users/rhd/Projects/book_summary/Summ/tests/fixtures/inline.json` and are used by both the TypeScript and Python tests.
- Persian typography: on RTL pages, `em` should render upright with a subtle brand-ink colour, following the existing `[dir=rtl] … font-style:normal` convention. Persian fonts have no italic.

**Draft model: `/Users/rhd/Projects/book_summary/Summ/src/inline-draft.ts`.** A draft is a patch of replaced lists, never a second copy of the document:
```ts
type Scope=`ch:${string}:p`|`ch:${string}:r`|'ov:p'|'ov:t'|`g:${number}`|`gt:${number}`|`t:${string}`;
// chapter paragraphs, chapter review, overview, takeaways, guide items, guide title, chapter title
interface Draft{book:string;base:string;vk:string;changes:Record<string,PubPara[]|string>;at:number}
applyDraft(doc,draft):PubDoc; readScope(doc,vk,scope):PubPara[]|string;
changedChapterIds(changes):string[] /* 'overview' for ov:* */; countChanges(changes):number
```
- `vk` is the `versionKey` (language and type) of the version being read. A chapter title edit writes `title[version.language]`.
- Because a draft only names lists it replaces, re-applying it to a newer document after a conflict is well defined.
- The draft is saved in localStorage under `inkling-edit:<pubId>`. It stays small because it only holds changed lists.
- History: a stack of `changes` snapshots, capped at 100. Typing collapses into one entry after 800 ms of no typing, or on leaving the field.
- Editing `text`, `heading` or `quote` keeps every other field (`pages`, `chapters`, `image`, `table`) as it was.
  - Splitting a paragraph copies `pages` to both halves.
  - Merging two paragraphs takes the union of their `pages`.

**Editor UI: `/Users/rhd/Projects/book_summary/Summ/src/InlineEditor.tsx`, with styles in `/Users/rhd/Projects/book_summary/Summ/src/editing.css`.** Load it lazily, for owners only.

*Getting into edit mode.*
- Add an owner cluster to the reader's site bar (`ReaderPage.tsx` line 105): an "Edit" pill (EditOutlined icon) and a "⋯" menu.
- The menu holds: Open in the book editor (goes to `#/edit/:id/chapters/:chapterId`), Audio…, Adjust background…, and View as visitor or Back to editing.
- On phones, all of these live in the ⋯ menu.

*Edit bar.*
- On desktop it sticks to the top of `.r2-col`; on phones it sits fixed at the bottom.
- Content: "Editing · فارسی · {version label}", then a status, then Undo, Redo, Discard, Save (primary) and Done.
- Status messages: "No changes", "3 unsaved changes · kept on this device", "Saving…", "Saved · readers see it now", "Changed elsewhere".

*Editable blocks.*
- The optional paragraph heading becomes a `<h2 contentEditable>` (plain text). The paragraph text, the quote text and the figure caption become `<p contentEditable>`. Tables stay read-only, with a hint to use the book editor.
- Editable blocks get a dashed outline on hover and a focus ring. Blocks changed in the draft get a 2 px brand-colour bar on the inline-start side. Owners only see this.
- A gutter handle (⋮) on the focused or hovered block opens a menu: Add paragraph below, Add/Remove heading, Make quote/Make paragraph, Move up, Move down, Delete. Delete is disabled for the last paragraph of a chapter.

*Selection toolbar.*
- Shown when text is selected inside a block: Bold, Italic, Clear formatting | Heading, Quote | Undo, Redo.
- Desktop: an MUI `Popper` anchored to the selection's `getBoundingClientRect()`, placed above and flipping when there is no room. It is centred, so RTL needs nothing special.
- Phones (≤699 px, the existing `phone` query): a toolbar docked at the bottom and offset by `visualViewport` so it sits above the keyboard.

*Also editable:* the chapter title h1 (`t:<id>`), the critique paragraphs, the overview page, the takeaways and the study-guide sections.

*How the editable elements work.* Follow these rules exactly; they avoid React fighting the browser over the DOM.
- **Uncontrolled elements.** Render `<p ref contentEditable suppressContentEditableWarning dir="auto"/>` with no React children. A layout effect sets `el.innerHTML=spansToHtml(parseInline(value))` only when the block's `rev` counter changes. `rev` changes on mount, undo/redo, toggling a mark, a structural change or a conflict reload, never on a keystroke.
- **Typing.** On `input`, wait 400 ms, then `serializeInline(spansFromDom(el))` and commit it to the draft without changing `rev`.
- **Reading the DOM (`spansFromDom`).** `STRONG`, `B` and spans with font-weight ≥ 600 mean bold. `EM`, `I` and spans with italic style mean italic. `BR` and newlines become one space. Anything else contributes its text only.
- **Selection.** Selection is tracked as character offsets inside the block (`getOffsets` and `setOffsets`, built on Range).
- **Bold and italic.** Read the offsets, run `toggleMark`, write the new value, bump `rev`, then restore the selection in the next animation frame. Do not use `document.execCommand` for formatting.
- **Paste.** Always prevent the default and insert plain text only, with spaces collapsed, through Range insertion.
- **Enter** splits the paragraph at the caret using `splitSpans`. The new paragraph keeps `quote`, gets no heading and receives focus.
- **Backspace** at offset 0 moves into the heading if there is one; otherwise it merges into the previous text or quote paragraph. **Delete** at the end merges the next paragraph in. Images and tables never merge.
- **In a heading,** Enter moves to the paragraph text, and Backspace in an empty heading removes the heading.
- **Shortcuts,** active only while focus is inside the editor (Mod is ⌘ on Mac and Ctrl elsewhere): Mod+B, Mod+I, Mod+Z, Mod+Shift+Z or Ctrl+Y, and Mod+S (always prevent the default while editing).
- **Esc** hides the toolbar. A second Esc means Done, with a confirmation if there are unsaved changes.
- **IME:** skip all key handling while the browser reports `isComposing`.
- **Accessibility.** Editable blocks get `role="textbox"` and a label such as "Paragraph 3" or "بند ۳". The toolbar gets `role="toolbar"`, with `aria-pressed` on B and I.

**Saving.**
- **Autosave is local only.** Every save goes live to readers at once, so saving half-written sentences automatically would be wrong. The draft autosaves to the device after 800 ms. When the owner returns, a banner offers "Restore · Discard".
- **Save steps:**
  1. `doc=applyDraft(pub.doc,draft)` and drop empty paragraphs.
  2. Validate with `editorProblems(doc)`, extracted from `PublishedEditor.tsx` lines 57–61 into `/Users/rhd/Projects/book_summary/Summ/src/replace-import.ts`, plus the existing `publishProblems`.
  3. Call `publishBook({id,doc,visibility:pub.visibility,base:pub.rev})`.
  4. Replace `pub` with the response, clear the draft, refresh the app's book list, and fetch the narration status with details.
- **Conflicts.** The server answers 409 when `base` no longer matches the stored version. Offer "Load latest and keep my edits": fetch the book and re-apply the draft. For each changed section that was also changed elsewhere, warn "…was also changed elsewhere; your version will replace it". The other choice is "Discard my edits".
- Show a `beforeunload` warning when there are unsaved changes. Moving to another page inside the app is safe, because the draft stays on the device.

**What else changes when the text changes.**
- **Audio.** After a save, if the narration details list out-of-date chapters, show "Audio of 'Chapter 2' was made from the earlier text · Update audio". This opens the Audio panel with "changed chapters" preselected. Listeners keep hearing the old audio until it is updated.
- **Other languages and versions** are untouched. On multi-language books, the edit bar says "Only the Persian version changes".
- **Blurbs and email excerpts** follow automatically, because the server strips markers.
- **The local device copy** is not updated. The existing PublishDialog warning (lines 51 and 76) covers republishing from the device.

**Visitors see no change.** The editing code is lazy-loaded and rendered only when the user can edit this book, is not in visitor view, and has edit mode on. The only change visitors see is that bold and italic text now display.

**The old editor.** `PublishedEditor` keeps editing raw text. Add a hint: "**bold** and *italic* appear formatted to readers". It should also send `base`.

**How it plugs into ReaderPage, with minimal changes.**
- Add an optional `editSlot?:(scope:string)=>ReactNode|null`. At each place text is rendered, use it when it returns something and otherwise fall back to the existing `paragraphs(...)` call: lines 113/128 (title), 118–119 (overview), 121 (guide), 135 (chapter paragraphs and review).
- Add an optional `owner?:ReactNode` for the site-bar cluster and edit bar.
- PublishedBook owns the draft. While editing, it displays `adaptPublished(pub, applyDraft(pub.doc,draft), …)`.

### 2.2 Homepage: every published book in the lower list
- New pure module `/Users/rhd/Projects/book_summary/Summ/src/home-order.ts`:
  - `homeOrder(books,config)` sorts only.
  - `wallBooks = homeOrder` with no `hidden` filter and no limit.
- Keep `homeBooks` exactly as it is. `PublishedBook.tsx` line 39 uses its index to choose the automatic painting, and changing it would change books' paintings.
- `HomePage.tsx` line 41: render `wallBooks(all,config)` in full. Covers are already lazy-loaded at 480 px.
- Add a quiet small serif heading, "همهٔ کتاب‌ها · {n}" / "All books · {n}". Do not bring back the hairline that commit `62f202f` removed.
- HomeEditor copy: "Unticked books leave the slideshow but stay in the list below."

### 2.3 Background framing (per book)

**Data.** `Frame={x:number;y:number;zoom:number}`: x and y are the focal point in percent (0–100), zoom is 1–3. Store it in the artwork JSON as `frame` (wide screens) and optional `framePhone`, and return both from `artwork.slide()`.

**When it applies.**
- Only for the art and upload modes, where the picture is fixed per book. The automatic gallery picture can change with the home order, and the cover mode is blurred.
- Reset the frame when the picture changes. Keep it for `keep` and for fit changes.
- Default: with no frame, nothing changes. No `framed` class is added, so today's rendering stays exactly the same.

**Rendering.**
- Pure helper `/Users/rhd/Projects/book_summary/Summ/src/frame.ts` with `frameVars(backdrop)`. It returns `{'--fx','--fy','--fz','--pfx','--pfy','--pfz'}`, or `undefined` when there is no frame.
- Apply it to the slider picture (`MuseumHero.tsx` line 61), the book intro (`BookDetail.tsx` line 97) and the chapter header (`ReaderPage.tsx` line 112) with the class `framed`. The chapter strip also gets `wide-only`.
- Add these rules at the end of the stylesheets so they beat the existing `!important` rules by higher specificity:
```css
.m-art.framed,.curated-art.framed{object-fit:cover!important;object-position:var(--fx) var(--fy)!important;transform:scale(var(--fz))!important;transform-origin:var(--fx) var(--fy);animation:none!important}
@media (max-width:899px){.m-art.framed,.curated-intro-art .curated-art.framed{object-position:var(--pfx,var(--fx)) var(--pfy,var(--fy))!important;transform:scale(var(--pfz,var(--fz)))!important;transform-origin:var(--pfx,var(--fx)) var(--pfy,var(--fy))}}
```
- With `object-position: x% y%` plus `scale` around the same point, the focal point stays fixed and zoom crops around it.
- The "whole picture" fit still uses `contain`; position and zoom are allowed there. The blurred fill copy is unchanged.
- The slider's text-colour measurement gets the frame: crop the source at the focus and zoom, and include the frame in the cache key.

**Frame dialog: `/Users/rhd/Projects/book_summary/Summ/src/FrameDialog.tsx`.** Full screen on phones.
- The whole picture is shown with a draggable focus ring. Pointer position maps to x and y in percent; account for letterboxing.
- Zoom slider (1×–3×, step 0.05) with − and + buttons, and wheel zoom over the previews.
- A switch between Wide screens and Phones, with "Phones use the same framing" ticked by default (`framePhone=null`).
- Live previews at the real aspect ratios: read the CSS, roughly 2:1 for the desktop slider, ~0.5:1 for the phone slider, and the book intro and chapter strip as rendered. Each preview includes the dark shade and a mock title on the text side, so the owner can see what the text covers.
- Optional: drag the large preview to pan, with `x -= dx*100/(coverWidth*zoom - frameWidth)` (clamped; same idea for y).
- Keyboard: arrows move 1%, Shift+arrows 5%, + and − zoom, Esc cancels.
- Buttons: Reset (50/40, 1×), Cancel, Save.
- Do not mirror drag directions in RTL; pictures are physical.

**Where to open it.**
- In PublishedEditor's background section: "Frame the picture". It is disabled, with a short reason, for the automatic and cover modes. It also opens by itself after a picture is uploaded or a painting is chosen.
- On the book page, in the owner strip (2.6).
- In the reader's ⋯ menu.

### 2.4 Listen button rule
- **Book Listen** shows only if the narration for the language being read has at least one track and its `type` equals the version's type, or is empty for older rows.
  - The first generation, while running: hidden.
  - A regeneration, while running: still shown, because the old audio is kept until the new set is complete.
  - Failed but old audio exists: shown.
- **Chapter Listen** shows only if book Listen does and a track exists for that chapter. **Overview Listen** shows only if a track with no chapter exists.
- **Listening library** shows only books whose `audio` list is not empty.
- **No flicker.** Use the new `pub.audio` field (languages with audio) from the book payload until `narrationStatus` arrives.
- Pure helper `audioFor(status,pubAudio,language,type)` in `/Users/rhd/Projects/book_summary/Summ/src/listening.ts` returns `{book,overview,chapters:Set<string>}`.
- UI changes:
  - BookDetail gets a `canListen` prop; with it false, Listen is not rendered.
  - Add a `.solo` class to `.curated-actions` so the phone grid at `curated.css` line 75 becomes a single column.
  - ReaderPage gets `canListen(chapterId|null)`.
  - With `#/b/:slug/listen` and no audio, stay on the book page silently.
- Owners, but not visitors, see "Audio: none · Make audio" in the owner strip.

### 2.5 Audio panel (offline or ElevenLabs, any time)

**Component.** `/Users/rhd/Projects/book_summary/Summ/src/AudioPanel.tsx`: a Dialog, full screen on phones, with tabs per language.

**Where to open it.**
- A new 6th "Audio" tab in PublishedEditor.
- The reader's ⋯ menu and the edit bar's stale-audio notice.
- The owner strip on the book page.

**Status card, one per language:**
- None: "No audio yet. Readers don't see a Listen button until you make one."
- Running: a progress bar, "part 5 of 12 · ElevenLabs", and Stop.
- Ready: "12 parts · about 48 min · offline voice 1.0× · made {date}", with Preview, Regenerate and Delete.
- Out of date: an amber chip, "2 chapters changed since: …", with "Update these chapters".
- Failed: the error message and Try again.
- Always add: "Listeners keep hearing the current audio until the new one is ready."

**Make-audio form.** Collapsed when audio exists.
- **Version:** shown only if the language has several versions.
- **Scope:** Whole book, Only changed chapters (n), or Choose chapters (a checklist that includes the Overview, with characters per item).
- **Engine:** "Offline · free" or "ElevenLabs · your plan". ElevenLabs is disabled without a key, with a link to Account.
- **Offline options:** speed 0.8–1.3 and a Preview.
- **ElevenLabs voice:**
  - "Your voices": fetched server-side, with cloned and generated voices first, marked "your voice". A free preview uses the `preview_url` that ElevenLabs returns.
  - Or "Enter a voice ID", with "Make this my default voice" (uses the existing `saveVoiceKey({voice})`).
- **ElevenLabs model:** a choice limited to models that support this language.
- **ElevenLabs settings**, each with a short explanation:
  - Speed (0.7–1.2)
  - Stability (0–1)
  - Similarity (0–1)
  - Style (0–1)
  - Speaker boost (on or off)
  - "Reset to recommended": 0.55, 0.8, 0, on, 1.0.
- **Preview** reads about 250 characters of the first chapter. Say that this uses a few credits.
- **Estimate**, from the server: "≈ 38,400 characters · ≈ 43 min of audio". For ElevenLabs add the app's existing "about $0.10 per 1,000 characters ≈ $3.84". For offline: "Free · prepared on the server in a few minutes".
- **Primary button:** "Make audio", "Replace audio" or "Update 2 chapters". ElevenLabs runs over 10k characters need a confirmation that shows the estimate.
- **Mixed voices:** if a partial update uses a different engine or voice, warn "Other chapters keep their current voice".
- While editing with unsaved changes, disable generation: "Audio is made from the saved text. Save first."
- While running, refresh the status every 3 s (the pattern in PublishDialog).

**Server pipeline**, extending the existing one (shapes in section 3):
- Split `narration_tracks` into `narration_items(doc,lang,type)` and a track splitter. Items are the overview plus each chapter, each with a hash of its stripped text. Keep `narration_tracks` returning the same tracks so the existing test still passes.
- Starting a run uses an upsert that keeps the old `tracks`.
- `_narrate` writes new files as `<gen>-<n>.mp3` (`gen = secrets.token_hex(4)`) for the chosen items only and updates `done` as it goes.
- At the end it builds the new manifest in document order: regenerated items, plus kept tracks for the other chapters, minus chapters that no longer exist. It swaps the manifest in one update and deletes files that are no longer listed.
- Cancel: a `_cancel` set is checked before each track. A cancelled or failed run deletes its new files and keeps the old manifest.
- `audio_path` accepts `^(?:\d{1,4}|[0-9a-f]{8}-\d{1,4})\.mp3$`, so old files keep working.
- Play-time estimate: compute seconds per track from its own engine (16000 B/s for ElevenLabs at 128 kbps, 8000 B/s for offline at 64 kbps).
- ElevenLabs request: `voice_settings = {**ELEVEN_SETTINGS, …chosen}` including `speed`, with `model_id` taken from the settings or the environment default.
  - If the API rejects `language_code` for the chosen model, retry once without it.
  - Verify the current model IDs and the speed range against the ElevenLabs docs at implementation time, and show the API's own message on refusal.
- Piper: `voice.synthesize(text, syn_config=SynthesisConfig(length_scale=1/speed))`. This is the piper-tts 1.8 API; verify it.

### 2.6 View switch keeps the book and chapter
- **Route mapping.** New pure module `/Users/rhd/Projects/book_summary/Summ/src/view-switch.ts` with `visitorRoute(route,{published,local})`. Visitors stay on `/`, `/library…` and `/b/…`. The other routes map as follows:

| Editor route | Visitor route |
|---|---|
| `/edit/:id` | `/b/:slug` |
| `/edit/:id/chapters/:cid` | `/b/:slug/read/c:<cid>` |
| `/edit/:id` when the book is not public | `/library` |
| `/workspace` | `/library` |
| `/book/:id` or `/read/:id[…]` of a published local book | `/b/:slug` or `/b/:slug/read` |
| `/book/:id` or `/read/:id` of an unpublished local book | `/` |
| `/saved`, `/mailing` | `/` |

- **`toggleVisitor()` in App,** replacing line 185:
  - Entering visitor view: store `{from,to}`, set the flag, remember it in sessionStorage (`inkling-as-visitor`), and navigate only if the route changes. With unsaved edits, toast: "Your edits stay on this device; visitors see the saved text".
  - Leaving visitor view: clear the flag. If the current route still equals the stored `to`, go back to `from` exactly; otherwise stay where you are. Restore inline edit mode from sessionStorage `inkling-editing:<pubId>`.
- **Show the switch where people read.** Pass `viewSwitch={asVisitor,onToggle}` to the published reader's site bar for every editor account, so visitors-in-preview can always come back.
- **Owner strip.** On the curated book page, add a row in the existing `.home-edit` style: Edit book · Audio · Background · View as visitor. Translate the visitor bar text (`Shell.tsx` line 70).
- **Deep links:**
  - `#/b/:slug/read/c:<chapterId>`: PublishedBook treats a section starting with `c:` as a chapter hint. It looks up the index, calls `move({index})`, and passes `section=''`, so the saved scroll position is restored.
  - `#/edit/:id/:tab/:chapterId`, with tabs details, overview, chapters, guide, reception, audio. PublishedEditor gets `initialTab` and `focusChapter`: it scrolls `#ed-ch-<id>` into view and highlights it briefly.
- Each chapter section in the editor gets "View on the page".
- The editor's back button goes to the previous route if it was a `/b/…` page ("Back to the book"); otherwise to `/workspace`. App keeps a `previousRoute` ref, updated in the `hashchange` handler.
- Scroll is kept because the switch does not remount the page.

### 2.7 Redesign of "What others say"

**Pure view helper.** `/Users/rhd/Projects/book_summary/Summ/src/reception-view.ts`: `receptionView(review,scores,lang)` returns:
- `lead` (the verdict's first sentence, split on `.!?؟`) and `rest`
- `scores` (up to 3) and `themes` (up to 5)
- `praise` and `criticism` (the top 3 of each, plus the full lists)
- `featured` (the first verified critic with an excerpt and a positive or mixed stance, else the first with an excerpt)
- `critics` (verified first, then those with excerpts) and `readers`
- `awards` and `impact`
- `sources`, without links already shown on cards
- `counts`, and `isEmpty`
- A `year(date)` helper and a `quoteFor(item,lang)`: in Persian, the translation is the main quote; otherwise the excerpt.

**Layout**, the same structure in both languages. Classes start with `rx-` and live in `styles.css`.
1. **Header:** the h2 plus a kicker, "From 6 critics and 4 readers · ★ 4.1 on Goodreads".
2. **Summary row:** on desktop, a 7/5 grid. The lead sentence is bold large serif, followed by the rest of the verdict. Up to 3 score chips (value, stars, source, count; linked) sit beside it, and theme chips go under the verdict.
3. **Balance:** two cards, "What readers praise" (green +) and "Where it is faulted" (terracotta −). Three items each, then "Show all (n)". They stack on phones.
4. **Voices:**
   - A featured pull-quote card: a large gold quote mark (« for Persian, “ for English), the quote in serif at 22–26 px, "— reviewer, publication · year", and a stance pill.
   - In Persian, an "Original text" disclosure shows the English excerpt in LTR with `lang="en"`.
   - Then 2 compact critic cards. Each has the publication in bold (normal case in Persian), a stance dot and label, the quote clamped to 4 lines, the reviewer, the year in Persian digits, and "Read the review ↗". The summary is shown only when a card is expanded.
   - "More reviews (n)" reveals the rest. Then up to 3 reader quotes with stars, and "More".
5. **Legacy:** award chips and the impact text, clamped to 3 lines with "Read more".
6. **Sources:** a `<details>` "Sources (n)".
7. **Call to action:** "Make up your own mind", with Start reading and, if audio exists, Listen.

- **Phones:** one column; critic cards become a horizontal scroll-snap row.
- **Empty state:** if `isEmpty`, hide the whole section for visitors. Owners see a muted line, "No reception yet · Research it", linking to `#/edit/:id/reception`. Local books keep their existing `rv-empty` research prompt.
- **Generation prompt (`reviews.py` lines 69–84):** critics' `date` should be "YYYY-MM-DD or YYYY", and pros and cons "each a short phrase, at most 12 words". Existing reviews still work: the year is extracted by pattern and long points are clamped by CSS. No data migration.
- **Move "If you liked this" out** of ReviewSection into its own section (2.8).

### 2.8 "If you liked this book": top-rated related books

**Server (`related.py`):**
- **In this library (computed fresh each time, no external calls):** `in_library(me, doc, books)` scores the other public books.

  | Signal | Points |
  |---|---|
  | Same author (normalised surname) | +3 |
  | Title matches one of this book's picks (in any language) | +3 |
  | Each shared category word | +1, up to 3 |
  | Each shared theme | +1, up to 2 |

  - Keep books scoring 2 or more, ranked by score and then rating, at most 4.
  - Return `slug` and a `reason` (author, pick or subject) plus `subject`. The client writes the "why" line: "Also by this author" or "Also about {subject}".
  - To support this, `_public` adds `tags`: up to 6 category words plus themes.
- **External books:**
  - The picks: `review.similar`, plus Gemini suggestions when the owner has a key.
  - Same-author books.
  - New: books on the same subjects, using `_subjects(info.categories)`, up to 2 subjects. Search Open Library with `subject=…&sort=rating&limit=20` and keep books with at least 100 ratings, a rating of 4.0 or more, and a cover. Verify the query by hand with curl.
  - Rank by Bayesian weighted rating: `wr=(v/(v+50))*R+(50/(v+50))*3.8`. Picks get +0.15. Unrated picks go last, books without a cover go last, and the list is capped at 8.
- **Localisation:** for languages other than English with an owner key, make one batched Gemini call, `reviews.localize_books(items,lang)`. It returns the title the book is published under in Persian (or a faithful translation), the author in Persian script, and a Persian "why", stored as `localTitle`, `localAuthor` and `why`. Without a key, show the original title in LTR. Never drop a card.
- **Cache:** add a version (`{'v':2,'lang',…}`), one file per language (`<id>-<lang>.json`). Older files are treated as stale, which backfills existing books lazily.
- **New endpoint** `POST /api/library/{id}/related/refresh` (owner or book owner). After a publish, warm the cache with FastAPI `BackgroundTasks`.

**Client:**
- `/Users/rhd/Projects/book_summary/Summ/src/RelatedShelf.tsx` is its own section after the reception, headed "اگر این کتاب را دوست داشتید". Its title helper is pure, in `/Users/rhd/Projects/book_summary/Summ/src/related-view.ts`.
- Title choice: the hand-written dictionary first (now an override, not a filter), then `localTitle`, then the original with a small original-title line.
- Card: a 2:3 cover with shadow (like `.m-card`), a 2-line title, the author, a stars row with value and count (shown when the count is at least 20), a 2-line "why", and a badge for books in this library.
- Cards in this library navigate to `#/b/:slug`. External cards open Open Library in a new tab, only if `directReviewPage(url)`.
- Layout: 4 per row on desktop; a scroll-snap shelf on phones.
- **Never empty:** with fewer than 2 cards, render nothing, not even the heading.
- `libraryRelated(id,lang)` passes the reading language.

---

## 3. Data, API, migrations, security

**TypeScript (`/Users/rhd/Projects/book_summary/Summ/src/types.ts`):**
```ts
interface Frame{x:number;y:number;zoom:number}
interface VoiceSettings{voice?:string;model?:string;speed?:number;stability?:number;similarity?:number;style?:number;speakerBoost?:boolean}
PubBook += {rev?:string;audio?:string[];tags?:string[]}; PubBook.slide += {frame?:Frame;framePhone?:Frame}
NarrationStatus += {engine?:'offline'|'elevenlabs'|'mixed';type?:string;settings?:VoiceSettings;updated?:number;staleChapters?:string[]} ; tracks[] += {engine?:string}
RelatedBook += {count?:number|null;slug?:string|null;reason?:'author'|'pick'|'subject';subject?:string;localTitle?:string;localAuthor?:string}
```
`PubPara` is unchanged; `text` may now contain inline markers.

**Server changes.** Every write needs `editor_user` and `own_or_owner`, and the existing `X-Summ-Request` check already applies.
- `PublishRequest.base: str|None` (pattern `^[0-9a-f]{16}$`). `get()` returns `rev = sha256(doc)[:16]` and `audio`. Do the check and the update inside one `with accounts._lock:`. A mismatch returns 409 with a plain sentence. Requests without `base` behave as today, so PublishDialog and NewBookWizard keep working.
- `_public` and `listing` add `audio` (one grouped query: `SELECT book_id,language FROM narration WHERE tracks!='[]'`) and `tags`.
- **Schema migration hook.** Add `accounts.EXTRA_MIGRATIONS: list[Callable]`, run in `_db()` after `EXTRA_SCHEMA`. The library registers one that adds the `narration` columns `engine` (if missing), `type TEXT NOT NULL DEFAULT ''` and `settings TEXT NOT NULL DEFAULT '{}'`. Remove the stray `ALTER` at `library.py` lines 187–188.
- **Manifest entries:** `{title,chapterId,file,hash,engine}`.
- **Narration endpoints:**
  - `POST /api/library/{id}/narration`: `{language,type?,engine,chapters?:list[str] (≤500, 'overview' allowed),settings?:VoiceSettingsBody}`.
  - `GET /api/library/{id}/narration/{lang}?detail=1`: adds `staleChapters` and `settings`, for editors only. The default response is cheap and public.
  - `POST /api/library/{id}/narration/estimate`: returns `{chars,items:[{key,title,chars,narrated,stale}]}`.
  - `POST /api/library/{id}/narration/{lang}/cancel`, and `DELETE /api/library/{id}/narration/{lang}` (409 while running).
- **Account voice endpoints:**
  - `POST /api/audio` gains optional `voice` and `settings` for previews (existing 40/min throttle; the client sends at most 300 characters).
  - `GET /api/me/voices` returns `{voices:[{id,name,category,preview}]}` and `GET /api/me/voice-models?language=` returns `{models:[{id,name}],default}`. Both call ElevenLabs on the server with the stored key, never return the key, are throttled at 10/min, and fall back to `[ELEVEN_MODEL]`.
- **`VoiceSettingsBody`** (Strict):
  - voice: `^[A-Za-z0-9]{1,64}$`; model: `^[a-z0-9_]{3,60}$`
  - stability, similarity, style: 0–1; speakerBoost: boolean
  - speed: 0.7–1.2 for ElevenLabs, 0.7–1.5 offline (checked in the route)
- **Frames:** `PUT /api/library/{id}/frame` with `{wide:Frame|null,phone:Frame|null}`; x and y in 0–100, zoom 1–3. Returns 422 unless the mode is art or upload.
- **Related:** `GET /api/library/{id}/related?lang=` and `POST …/related/refresh`.
- **Function changes:**
  - `audio.eleven_mp3(…, settings=None)` and `audio.piper_mp3(text, language, speed=1.0)`.
  - Pass the new arguments as keywords, and update the test fakes (section 5).

**Defaults for existing data:**
- Documents without markers render the same as today.
- Old narration rows have an empty `type`, which matches any version. Entries without a hash count as up to date. Old `N.mp3` files are still served.
- No frame means today's rendering.
- Old related caches are recomputed.

**Security:**
- Keys never reach the browser.
- Voice IDs and model IDs are validated by pattern.
- Previews and voice lists are throttled.
- Estimate, cancel, delete, frame and refresh are owner or book-owner only.
- `rev` is a hash of content that is already public.

---

## 4. Implementation order

Each step is a small, separately testable change. After each step run `npm test`, `npm run build`, and the Python suite.

1. **Homepage list (bug).**
   - Files: new `/Users/rhd/Projects/book_summary/Summ/src/home-order.ts`, `HomePage.tsx`, `HomeEditor.tsx` (copy), `i18n.ts`.
   - Test: `/Users/rhd/Projects/book_summary/Summ/tests/home-order.test.ts`. A wall of 13 books shows all 13; unticked books stay in the wall; the order follows the config; `homeBooks` and its index are unchanged.
   - Visual check: on the home page, a book shown in the slider also appears below.
2. **View switch and deep links (bug).**
   - Files: new `/Users/rhd/Projects/book_summary/Summ/src/view-switch.ts`, `App.tsx`, `PublishedBook.tsx` (`c:` hint and `viewSwitch`), `ReaderPage.tsx` (site-bar switch), `PublishedEditor.tsx` (`initialTab`, `focusChapter`, back target, "View on the page"), `Shell.tsx` (translated text), `BookDetail.tsx` (owner strip), `i18n.ts`.
   - Test: `/Users/rhd/Projects/book_summary/Summ/tests/view-switch.test.ts`, covering every row of the mapping table and the round trip.
   - Visual check: from chapter 2, scrolled halfway, toggle both ways: the same chapter and scroll. From the editor's chapter 3, go to visitor view: the reader opens at chapter 3.
3. **Listen visibility, with safe regeneration (bug).**
   - Files: `library.py` (upsert, generation file names and swap, `audio_path`, `audio` in `_public` and `get`, migration hook), `accounts.py` (`EXTRA_MIGRATIONS`), `listening.ts` (`audioFor`), `PublishedBook.tsx`, `BookDetail.tsx`, `ReaderPage.tsx`, `PublicLibrary.tsx`, `curated.css` (`.solo`).
   - Python tests: the listing shows `audio:['en']` after a narration; old tracks are still listed while a second run is running; the new files replace the old ones; old `0.mp3` names are still served.
   - TypeScript test: `/Users/rhd/Projects/book_summary/Summ/tests/listening.test.ts`.
   - Visual check: a book without audio shows no Listen on the book page, the chapter header or the listening library.
4. **Related books (bug).**
   - Files: `related.py`, `reviews.py` (`localize_books`), `app.py` (`lang`, refresh, background warm-up), `library._public` (`tags`), `api.ts`, `types.ts`, new `/Users/rhd/Projects/book_summary/Summ/src/RelatedShelf.tsx` and `/Users/rhd/Projects/book_summary/Summ/src/related-view.ts`, `ReviewSection.tsx` (remove the shelf), `BookDetail.tsx`, `PublishedBook.tsx`, CSS.
   - Python test: new `/Users/rhd/Projects/book_summary/Summ/tests/test_related.py`, with mocked `_search`, `suggest` and `localize`. Check the weighted ordering, that Persian keeps unlocalised cards, the in-library scoring, the cache-version recompute, and that refresh is refused for readers.
   - TypeScript test: `/Users/rhd/Projects/book_summary/Summ/tests/related-view.test.ts` (title choice; hidden when there are fewer than 2).
   - Visual check: a Persian book shows 4–8 rated cards, with books from this library first.
5. **Reception redesign.**
   - Files: new `/Users/rhd/Projects/book_summary/Summ/src/reception-view.ts`, `ReviewSection.tsx` rebuilt from small subcomponents, `BookDetail.tsx` (empty check, call to action), `styles.css` and `curated.css` (`rx-*`), `reviews.py` prompt, `i18n.ts`.
   - Test: `/Users/rhd/Projects/book_summary/Summ/tests/reception-view.test.ts` (featured choice, verified first, deduped sources, year, Persian quote choice, `isEmpty`).
   - Visual check: the Yalom book (it has rich data and `persian-reception.ts`) in Persian and English at 390 px and 1440 px; a book with no reception shows no heading.
6. **Inline markers.**
   - Files: new `/Users/rhd/Projects/book_summary/Summ/src/inline.ts` and `/Users/rhd/Projects/book_summary/Summ/src/Inline.tsx`, `/Users/rhd/Projects/book_summary/Summ/server/inline.py`; use them in `ReaderPage.tsx` (lines 68–71, 118, 121) and `BookDetail.tsx` (lines 147, 149), `library._say` and `_blurb`, and `mailing.py`. Add the CSS for `strong`/`em` and the RTL `em`.
   - Tests: `/Users/rhd/Projects/book_summary/Summ/tests/inline.test.ts` and `/Users/rhd/Projects/book_summary/Summ/tests/test_inline.py`, both using the shared fixtures. Also check that narration text contains no `*`.
   - Visual check: type `**…**` in the old editor and see bold in the reader.
7. **Version check, draft model and shared validation.**
   - Files: `library.py` (`rev`, `base`, 409), `api.ts` (`publishBook` gets `base`), `PublishedEditor.tsx` (send `base`, handle 409, hint text), new `/Users/rhd/Projects/book_summary/Summ/src/inline-draft.ts`, and `replace-import.ts` (`editorProblems`).
   - Python test: saving with the current `rev` succeeds, a stale `base` returns 409, and no `base` succeeds.
   - TypeScript test: `/Users/rhd/Projects/book_summary/Summ/tests/inline-draft.test.ts` (apply, re-apply on a newer doc, changed chapters, other fields kept on split and merge).
8. **Editing UI on the reading page.**
   - Files: new `/Users/rhd/Projects/book_summary/Summ/src/InlineEditor.tsx` and `/Users/rhd/Projects/book_summary/Summ/src/editing.css`, `ReaderPage.tsx` (`editSlot`, `owner`), `PublishedBook.tsx` (draft, edit mode, save, conflict, restore banner), `App.tsx` (pass `editable`, account, `onSaved`), `i18n.ts`.
   - Visual checklist:
     - Bold and italic via the toolbar and via ⌘/Ctrl+B and I; undo and redo.
     - Enter splits and Backspace merges; Persian text throughout.
     - Save shows the change to a logged-out window; a conflict appears after a save from the editor in another tab.
     - The draft survives a reload; visitor view shows the saved text.
     - The phone toolbar sits above the keyboard (iOS Safari width).
9. **Audio pipeline (server).**
   - Files: `library.py` (items and hashes, scope, settings, cancel, delete, estimate, stale detection), `audio.py`, `app.py` (routes, voices and models, preview settings).
   - Tests in `/Users/rhd/Projects/book_summary/Summ/tests/test_library.py`:
     - A partial run keeps the other chapters' files.
     - A formatting-only edit is not out of date; a text edit is.
     - Settings are passed to the mocked ElevenLabs call and the key never appears in any response.
     - Cancel restores the old audio; delete is refused while a run is going.
     - Readers are refused with 403.
10. **Audio panel (UI).**
    - Files: new `/Users/rhd/Projects/book_summary/Summ/src/AudioPanel.tsx`, `PublishedEditor.tsx` (Audio tab), `PublishedBook.tsx` and `InlineEditor.tsx` (entry points and the out-of-date notice), `api.ts`, `i18n.ts`. Optionally point the NewBookWizard message at the new tab.
    - Visual check: add Persian offline audio to a published book with no audio; then update only one chapter with an ElevenLabs voice ID (use a mocked or real key).
11. **Background framing.**
    - Files: `artwork.py` (`set_frame`, reset when the picture changes, `slide()`), `app.py` route, new `/Users/rhd/Projects/book_summary/Summ/src/frame.ts` and `/Users/rhd/Projects/book_summary/Summ/src/FrameDialog.tsx`, `bookBackdrop.ts`, `MuseumHero.tsx` (vars plus text-colour crop), `BookDetail.tsx`, `ReaderPage.tsx`, CSS, `PublishedEditor.tsx`.
    - Tests: `/Users/rhd/Projects/book_summary/Summ/tests/frame.test.ts` (vars, clamping, pointer-to-focus with letterboxing) and a Python test (validation, 422 for the cover mode, reset when the picture changes, editor only).
    - Visual check: one framed book across the home slider, book page and chapter header at 390 px and 1440 px; an unframed book looks the same as before.
12. **Final pass.** Check that every new string has Persian. Add an entry to `/Users/rhd/Projects/book_summary/Summ/docs/validation.md` and update the README's "What works". Re-run the whole visual matrix as a visitor and as the owner.

---

## 5. Risks and things not to break

- **Painting assignment.** `homeBooks` and its index assign the automatic paintings (`PublishedBook.tsx` line 39, `HomePage.tsx` line 36). Do not change them.
- **Existing tests** that will need updating:
  - `test_library.py` line 212 has a fake `eleven_mp3(text,lang,key,voice)`; change it to accept `**kw`.
  - The Piper lambdas at lines 197 and 228 must accept `**kw`.
  - Line 222 assumes `0.mp3`; read the file name from the status track URL instead.
  - Line 203 expects the track titles `['Overview','First','Second']`; keep that true.
- **Page references.** Edit raw `PubDoc` text, never the adapted text, or the hidden "(p. N)" references are lost. In edit mode these references are visible; say so in the edit bar's help.
- **Old publish paths** (PublishDialog, NewBookWizard) send no `base` and must keep working.
- **The schema migration hook** must run on every new connection; tests switch `SUMM_DATA_DIR`, which reconnects.
- **Unsure API details.** The ElevenLabs model IDs, the `speed` range, and `language_code` support per model must be checked against current docs. So must the Piper `SynthesisConfig` and the Open Library `subject` search. The code must show the provider's refusal instead of failing silently.
- **Selection and RTL edge cases:** the mixed Persian/English selection rectangle, the iOS selection menu overlapping the toolbar (hence the docked toolbar on phones), and the zero-width non-joiner (U+200C) inside Persian words, which must be kept when converting the DOM to spans.
- **Request size.** A save sends the whole document; the request limit is 4.1 MB (`app.py` line 37). Large books are fine, but keep the existing error message.
- **Must not change:** what visitors see apart from bold and italic, reading and listening positions, the X-Summ-Request check, never storing provider keys in the browser, the curated reader layout and zen mode, the slide-colour measurement on phones, `prefers-reduced-motion`, and unlisted books staying out of all listings.

### Critical files for implementation
- /Users/rhd/Projects/book_summary/Summ/src/PublishedBook.tsx
- /Users/rhd/Projects/book_summary/Summ/src/ReaderPage.tsx
- /Users/rhd/Projects/book_summary/Summ/src/App.tsx
- /Users/rhd/Projects/book_summary/Summ/server/library.py
- /Users/rhd/Projects/book_summary/Summ/src/ReviewSection.tsx