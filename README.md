# Inkling

A source-first reading app with a Google Material Design–inspired interface. Import your own material, choose reading depth, inspect original passages, and save quotations with their locations.

## What works

- Text PDFs, DRM-free EPUBs, Markdown, HTML, plain text, and supplied video transcripts.
- Chapter navigation and editable contents.
- Four reading depths, original-passage references, bookmarks, local reading progress, and Markdown exports.
- Language and purpose controls for AI generation; source excerpts retain their original language.
- Optional Gemini processing service: chapter and whole-book summaries, translations, academic or educational presentation, and separate internal critique.
- Accounts (username and password, or Google sign-in). Each person stores their own Gemini key, encrypted on the server, and pays for their own summaries.
- A cost estimate (tokens, model calls, and a dollar range) before every chapter or whole-book run, and the actual cost afterwards.
- A study guide per book: overview and key takeaways, sections chosen for the kind of book (characters, themes, and symbols for fiction; key ideas, arguments, and terms for nonfiction; thesis, method, and findings for academic work), and every chapter summary.
- Search Google Books by title, author, or ISBN. Browse catalog records and previews, or choose an edition for an imported book's study guide. Book facts and reception also draw on Open Library and Wikipedia.
- Covers from the file (EPUB cover image or the first non-blank PDF page) or, failing that, from Open Library or Google Books.
- Narration: free offline Piper voices on the server (English, Persian, and six more languages), or ElevenLabs with each user's own key. Audio is cached in the browser.
- A typeset PDF of the study guide (cover, contents with page numbers, running heads; Vazirmatn and right-to-left layout for Persian and Arabic).
- Light/dark appearance, keyboard navigation, responsive layouts, and Persian/Arabic text support.

Files and reading history are stored in this browser using IndexedDB. They do not sync between devices or site addresses. AI generation sends the selected chapter to the Inkling server, which calls Gemini with the signed-in user's own key.

## Who can do what

- **Owner** (the Google-verified account whose email is `SUMM_OWNER_EMAIL`): imports books, generates or imports summaries, publishes them, and approves editors.
- **Editors** (approved by the owner in Settings): the same, using their own Gemini key. They can change only the books they published.
- **Readers** (everyone, with or without an account): read published summaries and listen to their narration. They cannot generate anything.
- Publishing stores summaries, a cover and narration on the server. The original file and its text are never uploaded, and page references in a published summary show page numbers only.

## Hosting

GitHub Actions builds and checks the app, then deploys the static reader to GitHub Pages. Pages cannot run the Python processing service.

For the complete app on your home server:

1. Install Docker Engine and Docker Compose.
2. Clone this repository into `~/summ`.
3. Run `bash deploy/on-server.sh` inside the checkout.
4. The script creates a private `.env` with a random `SUMM_SECRET_KEY`. It encrypts saved Gemini keys: back it up together with the `summ_data` Docker volume. If it changes, users must re-enter their keys.
5. Configure the Google services below if you want them. Set `SUMM_ALLOW_SIGNUP=false` to stop new sign-ups.
6. Run `docker compose up -d --build` after changing environment values or upgrading the app.
7. Open the app, create an account, and add your Gemini key and model under Account.

Provider credentials never belong in frontend code or the public repository. The server no longer uses a shared `GEMINI_API_KEY` or `SUMM_ACCESS_TOKEN`.

For `booksumm.duckdns.org`, keep DuckDNS pointed to your server's current public IP and forward TCP 80 and 443 to that server. Caddy obtains HTTPS certificates. Check existing services before claiming those ports.

### Server with an existing reverse proxy

The deployment at `rumi@192.168.1.51` uses the host's existing Caddy service. Start only the app using this configuration:

```sh
cd ~/summ
docker compose -f compose.yaml -f deploy/compose.existing-proxy.yaml up -d --build --wait app
```

This binds the app to `127.0.0.1:9010` and adds a health check. The bundled Caddy container is disabled in this configuration. Add the site block from `deploy/Caddyfile.existing-proxy` to the host's existing Caddyfile, validate it, and reload Caddy. Preserve the other site blocks.

The app is served at `https://booksumm.duckdns.org`. Before the first start with accounts, make sure `~/summ/.env` has a `SUMM_SECRET_KEY` of at least 32 characters and `SUMM_TRUST_PROXY=true` (running `deploy/on-server.sh` adds both). After changing that file, rerun the command above. Sign in to use link import and AI; local file and pasted-text imports work without an account.

**A domain cannot point to both GitHub Pages and your home server at the same time.** For the recommended home-server setup, use the DuckDNS domain for the complete app and the standard GitHub Pages address for the static reader. If Pages has that custom domain configured, remove it from Pages to keep the standard Pages address from redirecting to the home server.

### Google services

- **Google sign-in.** In Google Auth Platform, configure your app's branding and audience, then create an OAuth client of type **Web application**. Add `https://booksumm.duckdns.org` under **Authorized JavaScript origins**. If the app is in testing, add the Google accounts that will test it under **Audience**. Set the resulting `*.apps.googleusercontent.com` client ID as `GOOGLE_CLIENT_ID` in the server's `.env`. This Google Identity Services flow uses the client ID and a verified ID token to create a Summ session. [Google setup instructions](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- **Google Books.** Enable **Books API** in the Google Cloud project. Create an API key restricted to **Books API** and set `GOOGLE_BOOKS_API_KEY` in the server's `.env`. The key stays on the server. Search and previews use public catalog data. [Google Books API setup](https://developers.google.com/books/docs/v1/using#APIKey)

Rerun the Docker Compose command for your deployment after editing `.env`. Open **Account** to see **Continue with Google**. Open **Your library → Find books** to search the catalog or **Study guide → At a glance → Choose edition** to update the guide's catalog details. Summaries and citations come from your imported source.

## Development

```sh
npm install
npm run dev
```

Optional backend:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
SUMM_SECRET_KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))') SUMM_INSECURE_COOKIES=true \
  uvicorn server.app:app --host 127.0.0.1 --port 9000
```

The Vite dev server proxies `/api` to port 9000, so the session cookie stays same-origin. `SUMM_INSECURE_COOKIES=true` is for plain-HTTP development only.

## Validation

```sh
npm test
npm run build
python3 -m unittest discover -s tests -p 'test_*.py'
```

API tests mock provider responses; they do not establish live model quality.

## Fidelity and current limits

Original passages are verbatim extracted text, **not generated summaries**. AI output is labeled separately. Every generation inspects all supplied blocks in bounded batches and runs reference validation and a separate support check. These checks reduce error; they do not guarantee truth or completeness.

- Critical review examines reasoning within the chapter. External academic fact-checking is not implemented.
- Scanned PDFs require an existing searchable text layer; there is no OCR service yet.
- PDF columns, notes, formulas, and tables require checking against the original.
- YouTube uses an uploaded or pasted transcript; automatic arbitrary-video caption retrieval is not implemented.
- EPUB navigation uses reading order; some notes may be separate sections.
- Long chapters are split automatically (smaller parts at deeper reading depths) and recombined. Short chapters are summarized in two model calls; long ones add one inventory call per ~24,000 characters.
- Cost estimates use approximate token counts and Google's list prices (checked November 10, 2026). Google's bill is final.
- Web import accepts accessible public HTML/text/PDF. It blocks private addresses and revalidates redirects.
- Citation support checks are automated and can miss errors. Inspect the evidence.

The bundled sample is original writing created for the app. It is not a purported summary of a published book.
