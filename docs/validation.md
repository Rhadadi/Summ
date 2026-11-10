# Validation

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
