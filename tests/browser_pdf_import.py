"""Run with a local PDF and a disposable browser context; requires Playwright.

python tests/browser_pdf_import.py --url http://127.0.0.1:3912 --pdf /path/to/book.pdf
The input stays in the browser. It is never sent to the processing API.
"""
import argparse
import hashlib
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', required=True)
parser.add_argument('--pdf', type=Path, required=True)
args = parser.parse_args()
data = args.pdf.read_bytes()
expected_hash = hashlib.sha256(data).hexdigest()

with sync_playwright() as playwright:
    for engine in ['webkit', 'chromium']:
        browser = getattr(playwright, engine).launch(headless=True)
        try:
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.url, wait_until='networkidle')
            page.get_by_role('button', name='Add a source', exact=True).first.click()
            page.locator('input[type=file]').set_input_files({
                'name': args.pdf.name,
                'mimeType': 'application/pdf',
                'buffer': data,
            })
            page.wait_for_function("() => location.hash.startsWith('#/book/') || [...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.trim())", timeout=90000)
            assert '#/book/' in page.url, page.get_by_role('alert').all_text_contents()
            heading = page.locator('.book-heading h1')
            heading.wait_for()
            title = heading.inner_text()
            route = page.url
            # A full reload checks that both the parsed book and its original
            # have committed to IndexedDB rather than just remaining in React.
            page.reload(wait_until='networkidle')
            heading.wait_for()
            assert heading.inner_text() == title
            assert page.url == route
            page.locator('button.citation').first.click()
            original = page.get_by_role('link', name='Open original source ↗')
            original.wait_for()
            source_url = original.get_attribute('href')
            assert source_url and source_url.startswith('blob:')
            result = page.evaluate('''async url => {
                const response = await fetch(url);
                const bytes = await response.arrayBuffer();
                const hash = await crypto.subtle.digest('SHA-256', bytes);
                return {size: bytes.byteLength, hash: Array.from(new Uint8Array(hash), x=>x.toString(16).padStart(2,'0')).join('')};
            }''', source_url)
            assert result['size'] == len(data), result
            assert result['hash'] == expected_hash, result
            assert not errors, errors
            print(json.dumps({'browser': engine, 'import': 'passed', 'reload': 'passed', 'original_bytes': 'matched', 'page_errors': errors}), flush=True)
        finally:
            browser.close()
