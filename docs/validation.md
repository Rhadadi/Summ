# Validation

## Owner editing, audio panel and background framing — November 22, 2026

Nine owner requests (see `docs/plans/2026-11-22-owner-editing.md`): every published book in the home list, a view switch that keeps the book and chapter, Listen only where audio exists, rated related books, a redesigned reception section, bold and italic markers, version-checked saves, inline editing on the reading page, an Audio panel, and background framing.

- `npm test` (frame, inline, draft, listening, view-switch, home-order, reception and related tests included), `npm run build` and the Python suite passed after each step. The framing route is covered by `FrameTests`: range validation, 422 for the cover and automatic modes, 422 for phones without wide screens, the frame kept on a fit or caption change and dropped with a new picture, and editors only.
- Browser matrix (Chrome via Playwright, local dev servers, throwaway database with 14 published books, one with audio, one framed; no provider called): Persian and English at 390 and 1440 px, as visitor and as owner. Checked the home list (all 14 books), book page (owner strip only for the owner; Listen only on the book with audio), chapter reader (Listen, the ⋯ menu, View as visitor and Back to editing keep the same chapter, edit mode), the Audio panel and the frame dialog. No horizontal overflow and no console errors on any page.
- Framing, before and after on one book: focus dragged to the top-left corner and zoom 1.6x. The home slider (desktop and phone), book intro and chapter header all follow the frame, a separate phone framing applies to the slider and intro only, and the slider's text colour flips to dark when the framed crop is bright. Unframed books carry no `framed` class and render as before.
- Fixed in the final pass: the Persian home page scrolled sideways (the hidden mailing-list trap input was placed 9,999 px to the right in right-to-left pages); the book intro and chapter header shaded the right side in left-to-right books although their text sits on the left; HomeEditor and the book editor's "Replace from a ZIP" had no Persian.
- Not verified: Safari and iOS keyboard behaviour of the inline editor toolbar; ElevenLabs with a real key (audio checks use `SUMM_FAKE_AUDIO=1`).

## Six-persona UX follow-up — November 12, 2026

Deployed on top of Claude's `62e8739` reader/reception update. Preserved the new fonts, reading preferences, painting picker, and removal of public page chips and completion controls.

- Added Persian-first public navigation with a separate saved English interface choice; translated discovery titles, reader preferences, metadata and audio controls.
- Public-library search now filters all available title translations and author names, normalizes Persian/Arabic letter variants, and displays empty results and reset actions.
- Added audio position/rate persistence, an explicit resume label, restart action and named playlist subdivisions. Listening cards preserve listening intent. Published fixed-bitrate audio exposes an approximate listening duration separately from reading time.
- Removed the unverified Wikipedia fallback from book reception; new Wikipedia lookups require author and book-type evidence. This suppresses the previously observed unrelated TV-series description without fabricating replacement reviews.
- Moved takeaways ahead of detailed overviews, aligned reading-time estimates with chapter estimates, recognized Persian front matter, corrected reader language and heading semantics, and moved the skip destination past navigation.
- Featured books no longer auto-rotate. A 390px browser check found and fixed long Persian featured titles hiding the primary actions.

Validation: 39 frontend tests, production TypeScript/Vite build, and 54 backend tests passed. Backend tests ran in an isolated production image without the production data volume or environment. Browser checks used the actual public catalogue via a local preview, then the deployed website. Production search returned only Midlife for `ميانسالي`. Production narration resumed at 0:15 and 1.25× after refresh. Its estimated listening duration was visible before play. The unrelated TV description was absent from Can Love Last? reception. Local reader skip navigation focused the article, Persian text inherited `lang=fa`, and settings labels were Persian. Desktop and 390px responsive screenshots were inspected; this is not a physical-phone or screen-reader certification.

Deployment source backup: `~/summ-deployment-backups/before-ux-20261111.tar.gz` on the existing home server. The existing reverse proxy and production book data were preserved. Local and server source changes remain uncommitted.

Content refresh remains pending: Chrome's Rumi profile signed in successfully but showed only the sample book; the other available profile was signed out. Requested the Chrome workspace containing the original imports before researching reception, re-importing Staring at the Sun or republishing those books. No live Gemini call or book-content republish is claimed.

## Sidebar layout and cleanup — November 11, 2026

- New layout: sidebar and search, home with Continue reading, book page, reader with chapter list, and one narration player that stays across pages. Checked with the real 366-page PDF in WebKit and Chromium at desktop and phone width, on the home server (live site, no account).
- Chapter summaries and narration were exercised with a stand-in model and the real offline Piper voice; no real Gemini or ElevenLabs call was made.
- Cleanup removed the old book page and header and 570 unused CSS selectors (80 KB → 39 KB). A 27-screen visual comparison (light and night themes, dialogs, phone) before and after showed identical pixels except the audio playhead, which also differs between two captures of the same build.
- 22 frontend and 35 backend tests pass.

## Study guides, book facts, covers, narration, and typeset PDF — November 10, 2026

- Study guides choose one of five book types (fiction, narrative nonfiction, ideas and argument, academic, poetry or drama) and fill that type's sections from the checked chapter summaries, followed by a separate support check. Unknown types, invented chapter references, and thin guides are rejected.
- Book facts come from Open Library, Google Books, and Wikipedia (CC BY-SA, attributed). Live lookups matched *Nineteen Eighty-Four* (searched as "1984"), *Theo of Golden*, and *بوف کور*. Google Books needs `GOOGLE_BOOKS_API_KEY`: the shared anonymous quota returned HTTP 429. Goodreads is linked, not queried.
- Covers come from the EPUB cover image or the first non-blank PDF page (pages 1–3 are checked), otherwise from Open Library or Google Books through an allowlisted proxy.
- Piper ran on the production server's i5-2435M (AVX, no AVX2) at 7.6× real time for `fa_IR-gyro-medium` and 7.9× for `en_US-lessac-medium`. ElevenLabs uses each user's own key; it was tested only with mocked responses.
- WeasyPrint PDFs (A5, cover page, contents with page numbers, running heads) were rendered in English and Persian; Persian uses Vazirmatn with correct shaping and right-to-left layout.
- 32 backend and 15 frontend tests pass. A Chromium and WebKit end-to-end run with a stand-in model covered sign-up, a whole-book run, the study guide, PDF download, and real offline narration, with no page errors. No real Gemini or ElevenLabs call was made.

## Accounts, per-user keys, cost estimates, and Apple-style refresh — November 10, 2026

- Accounts: username/password (scrypt) or Google ID tokens verified against `GOOGLE_CLIENT_ID`. Sessions are HttpOnly SameSite=Lax cookies. Writes require an `X-Summ-Request` header that cross-site pages cannot send without a refused preflight.
- Each user's Gemini key is checked with Google on save, encrypted with a key derived from `SUMM_SECRET_KEY`, and never returned to the browser. Rate limits apply per user, and sign-in attempts are limited per client address taken from Caddy.
- No more duplicate sends: short chapters go to the draft once and the check sees only cited passages. Long chapters are drafted from the inventory instead of inventory plus full source. Composition sends each summary once instead of twice.
- A cost sheet appears before every chapter and whole-book run. Actual token usage from Gemini is shown afterwards.
- 27 backend tests and 15 frontend tests pass, and the production build succeeds. A local Chromium and WebKit run covered sign-up, the account sheet, adding a key, and both cost sheets with no page errors. A real Gemini call was not made: Google correctly rejected a fake key on save.

## Native Safari stream iteration fix — November 9, 2026

The exact reported error was reproduced in the user's actual Safari session on the current public build. PDF.js's `getTextContent()` uses `for await` on a ReadableStream, but shipping Safari lacks that async iterator even when Playwright's newer WebKit supports it. This matches [Mozilla issue #21924](https://github.com/mozilla/pdf.js/issues/21924).

Text extraction now drains `streamTextContent()` through `getReader().read()` and releases the reader, preserving text order, styles, and language. Pure XFA pages retain their existing extraction path. The regression tests explicitly remove `ReadableStream.prototype[Symbol.asyncIterator]` so newer WebKit cannot hide this incompatibility. The updated importer test fails before the workaround and passes after it.

- Five source/import tests, twelve backend tests, and the production build passed.
- The full PDF browser test passes in WebKit with stream iteration disabled and in Chromium: import, reload, original-file opening, and matching SHA-256 bytes.
- HTML now has `Cache-Control: no-cache` so reloading revalidates the deployed entry point. Import failures log their stage and error stack to the local browser console.
- Native Safari controls subsequently stalled, so the final native-browser retest is not claimed. The earlier generic WebKit passes below did not establish compatibility with shipping Safari; the new missing-API regression addresses that gap.

## Safari original-file storage fix — November 9, 2026

Automated WebKit testing exposed a second failure after successful PDF parsing: writing a browser `File` directly to IndexedDB failed, and the request wrapper rejected with `null` before the transaction error was available. The file-import error handler then failed while reading `error.message`.

Originals now persist as an ArrayBuffer plus MIME type, and are reconstructed as a Blob when opened. Previously saved Blob records remain readable. Storage errors use the request's error or a meaningful fallback, and the import handler accepts unknown error values safely.

- Five source/import tests and the production build passed.
- `tests/browser_pdf_import.py` passed in WebKit and Chromium using the supplied 366-page PDF. It verifies import, persistence after a full page reload, opening the original from a passage, and a SHA-256 match of the original file bytes. Neither browser reported a page error.
- The earlier Chromium error at `127.0.0.1:3910` was from a stopped temporary preview. Use the public `https://booksumm.duckdns.org` address.
- The PDF.js compatibility build and security patch remain in place. These automated results covered storage but did not model native Safari's missing stream iterator; see the later fix above.

## Safari PDF import compatibility fix — November 9, 2026

The PDF importer and its worker now both use PDF.js's `legacy` compatibility build. The modern build assumes recent browser APIs; the new regression test reproduces `getOrInsertComputed is not a function` without them and passes after the switch. The patched PDF.js version remains 6.2.108.

- Five source/import tests and the production build passed. The PDF regression exercises the real importer with recent Map methods removed, checks source wording from two pages, and verifies page references and chapter boundaries.
- The supplied 366-page PDF was processed locally through the real importer: 15 sections, 1,417 passages, and 1,266,903 extracted characters. Every page was processed, including five pages without extracted text. The PDF was not sent to the server or added to the repository.
- Native browser automation reached the file chooser but then stopped accepting reliable input, so a completed Safari UI import remains unverified.

## Home-server deployment — November 9, 2026

Published to `https://booksumm.duckdns.org` on `rumi@192.168.1.51`, using the existing host Caddy service and a Docker app bound to `127.0.0.1:9010`. The container is healthy and uses the `unless-stopped` restart policy. The previous Caddy configuration is backed up privately in `~/summ-deployment-backups` on the server.

- Production build, four source-processing tests, and twelve API tests passed. API tests ran inside the production image and mocked the provider.
- Public HTTPS returns 200, HTTP redirects to HTTPS, `/api/health` responds, and unauthenticated link imports return 401.
- The existing primary and tennis sites still return 200 after the proxy reload.
- Desktop and 390 px phone-width previews were visually checked in Safari. Fixed the phone hero illustration overlapping text and the wrapping Add source button. Live rendering was also observed in Chrome. Safari's live-domain check stalled; the local production preview rendered successfully there.
- Updated PDF.js to 6.2.108 for [GHSA-hq66-cqwq-w95j](https://github.com/advisories/GHSA-hq66-cqwq-w95j). The npm audit then reported zero vulnerabilities.
- AI remains disabled at the user's request. Configure Gemini later using the private server `.env`. Link imports require the private app token; local file and pasted-text reading work without it.

These checks are a deployment smoke test, not a complete accessibility certification or live Gemini quality evaluation.

## Previous validation

GitHub Actions run [42434445401](https://github.com/Rhadadi/Summ/actions/runs/42434445401) passed the production TypeScript/Vite build, four source-processing tests, twelve API tests, and GitHub Pages deployment on November 7, 2026 (America/New_York).

The API tests mock the model provider. Live Gemini generation needs server credentials and has not been tested with a real key. The remote home server was unreachable from the development environment.

The initial local browser checks exercised the library, chapter selection, depth controls, source passage viewer, and saving a passage. The development environment then failed during startup recovery; final desktop/mobile visual checks and PDF/EPUB browser imports could not be completed. CI validates the recovered source.

No claim of complete detail retention or zero hallucinations is made. External fact-checking, automatic YouTube transcripts, and OCR remain outside this first version.
