# Summ

A source-first reading app with a Google Material Design–inspired interface. Import your own material, choose reading depth, inspect original passages, and save quotations with their locations.

## What works

- Text PDFs, DRM-free EPUBs, Markdown, HTML, plain text, and supplied video transcripts.
- Chapter navigation and editable contents.
- Four reading depths, original-passage references, bookmarks, local reading progress, and Markdown exports.
- Language and purpose controls for AI generation; source excerpts retain their original language.
- Optional Gemini processing service: chapter summaries, translations, academic or educational presentation, and separate internal critique.
- Light/dark appearance, keyboard navigation, responsive layouts, and Persian/Arabic text support.

Files and reading history are stored in this browser using IndexedDB. They do not sync between devices or site addresses. AI generation sends the selected chapter to the configured server and Gemini.

## Hosting

GitHub Actions builds and checks the app, then deploys the static reader to GitHub Pages. Pages cannot run the Python processing service.

For the complete app on your home server:

1. Install Docker Engine and Docker Compose.
2. Clone this repository into `~/summ`.
3. Run `bash deploy/on-server.sh` inside the checkout.
4. Edit the private `.env` file: set `GEMINI_API_KEY` and an available `SUMM_MODEL`.
5. Run `docker compose up -d` after changing environment values.
6. In the app Settings, enter the app access token from `.env`. This is different from the Gemini key.

The install script creates a random app token. Provider credentials never belong in frontend code or the public repository.

For `booksumm.duckdns.org`, keep DuckDNS pointed to your server's current public IP and forward TCP 80 and 443 to that server. Caddy obtains HTTPS certificates. Check existing services before claiming those ports.

### Server with an existing reverse proxy

The deployment at `rumi@192.168.1.51` uses the host's existing Caddy service. Start only the app using this configuration:

```sh
cd ~/summ
docker compose -f compose.yaml -f deploy/compose.existing-proxy.yaml up -d --build --wait app
```

This binds the app to `127.0.0.1:9010` and adds a health check. The bundled Caddy container is disabled in this configuration. Add the site block from `deploy/Caddyfile.existing-proxy` to the host's existing Caddyfile, validate it, and reload Caddy. Preserve the other site blocks.

The app is served at `https://booksumm.duckdns.org`. AI remains disabled until `GEMINI_API_KEY` and `SUMM_MODEL` are configured in `~/summ/.env`. After changing that file, rerun the command above. Retrieve `SUMM_ACCESS_TOKEN` privately on the server and enter it in app Settings to use link import and, once configured, AI processing. Local file and pasted-text imports work without a token.

**A domain cannot point to both GitHub Pages and your home server at the same time.** For the recommended home-server setup, use the DuckDNS domain for the complete app and the standard GitHub Pages address for the static reader. If Pages has that custom domain configured, remove it from Pages to keep the standard Pages address from redirecting to the home server.

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
# Set SUMM_ACCESS_TOKEN, GEMINI_API_KEY, SUMM_MODEL in your server environment.
uvicorn server.app:app --host 127.0.0.1 --port 9000
```

For a separate development backend, set the app's processing URL to `http://localhost:9000`.

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
- AI processing supports chapters up to 48,000 characters. Split longer chapters in the contents editor.
- Web import accepts accessible public HTML/text/PDF. It blocks private addresses and revalidates redirects.
- Citation support checks are automated and can miss errors. Inspect the evidence.

The bundled sample is original writing created for the app. It is not a purported summary of a published book.
