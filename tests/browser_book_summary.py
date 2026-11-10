"""Whole-book UI, resume, export, and responsive-layout test with mocked AI.

Requires Playwright. Run against a local production build with --url.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', required=True)
args = parser.parse_args()
model = 'gemini-3.1-pro-preview'

with sync_playwright() as playwright:
    for engine in ['webkit', 'chromium']:
        browser = getattr(playwright, engine).launch(headless=True)
        try:
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
            context.add_init_script("if(location.protocol.startsWith('http'))sessionStorage.setItem('summ-token','test-only-token')")
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            calls = []
            fail_second = [True]

            def api(route):
                request = route.request
                endpoint = request.url.split('/api/')[-1]
                if endpoint == 'health':
                    route.fulfill(json={'version':'0.2.0','ai_configured':True,'auth_required':True,'model':model})
                elif endpoint == 'summarize':
                    payload = request.post_data_json
                    chapter = payload['chapter']
                    calls.append(chapter['title'])
                    if chapter['title'] == 'Second chapter' and fail_second[0]:
                        fail_second[0] = False
                        route.fulfill(status=502,json={'detail':'Temporary provider failure; resume to continue.'})
                        return
                    route.fulfill(json={'paragraphs':[{'heading':'Main argument','text':'This chapter develops a carefully qualified argument. Its example supports an observation, while leaving causal questions open.','evidence_ids':[chapter['blocks'][0]['id']]},{'heading':'Evidence and limitations','text':'The scope of the finding remains limited. The author distinguishes the supporting material from a broader interpretation.','evidence_ids':[chapter['blocks'][0]['id']]}],'review':[],'processed_blocks':len(chapter['blocks']),'total_blocks':len(chapter['blocks']),'language':payload['language'],'mode':'ai','checked':True,'model':model})
                elif endpoint == 'compose':
                    payload = request.post_data_json
                    ids = [section['id'] for section in payload['sections']]
                    route.fulfill(json={'paragraphs':[{'heading':'The book’s central argument','text':'The book develops its argument across all three chapters, linking observations to their qualifications. The chapters together show how evidence can inform a conclusion without establishing every causal claim.','evidence_ids':ids}],'takeaways':[{'text':'Distinguish an observation from a causal conclusion.','evidence_ids':ids},{'text':'Read examples together with their limitations.','evidence_ids':ids}],'checked':True,'language':payload['language'],'model':model})
                else:
                    route.fulfill(status=404,json={'detail':'Unknown test endpoint'})

            page.route('**/api/**', api)
            page.goto(args.url, wait_until='networkidle')
            page.get_by_role('button', name='Add a source', exact=True).first.click()
            page.get_by_role('tab', name='Paste text').click()
            page.get_by_role('textbox', name='Source title', exact=True).fill('A Whole Book')
            page.get_by_role('textbox', name='Source text', exact=True).fill('# First chapter\n\nThe first observation has an important qualification.\n\n# Second chapter\n\nThe second observation supplies another example.\n\n# Third chapter\n\nThe final chapter sets out the limitations.')
            page.get_by_role('button', name='Add to library', exact=True).click()
            page.get_by_role('button', name='Summarize whole book', exact=True).click()
            page.get_by_role('button', name='Create whole-book summary', exact=True).click()
            page.get_by_text('Temporary provider failure; resume to continue.', exact=False).wait_for()
            assert calls == ['First chapter','Second chapter'], calls
            page.get_by_role('button', name='Close book summary', exact=True).click()
            page.reload(wait_until='networkidle')
            page.get_by_role('button', name='Summarize whole book', exact=True).click()
            page.get_by_role('button', name='Resume whole-book summary', exact=True).click()
            page.get_by_text('All 3 chapters summarized', exact=True).wait_for()
            assert calls == ['First chapter','Second chapter','Second chapter','Third chapter'], calls
            assert page.locator('.book-report-chapter').count() == 3
            page.screenshot(path=f'/private/tmp/summ-whole-book-{engine}.png')
            with page.expect_download() as download:
                page.get_by_role('button', name='Download formatted HTML', exact=True).click()
            output = Path('/private/tmp') / f'summ-whole-book-{engine}.html'
            download.value.save_as(output)
            content = output.read_text()
            assert 'Book overview' in content and 'Key takeaways' in content
            for title in ['First chapter','Second chapter','Third chapter']:
                assert title in content
            assert 'test-only-token' not in content
            page.set_viewport_size({'width':390,'height':844})
            assert page.locator('.book-summary-dialog').evaluate('(element)=>element.getBoundingClientRect().width<=window.innerWidth')
            page.screenshot(path=f'/private/tmp/summ-whole-book-mobile-{engine}.png')
            formatted = context.new_page()
            formatted.set_content(content, wait_until='load')
            assert formatted.locator('.report-chapter').count() == 3
            formatted.screenshot(path=f'/private/tmp/summ-formatted-summary-{engine}.png')
            formatted.emulate_media(media='print')
            assert formatted.locator('.report').evaluate('(element)=>getComputedStyle(element).borderTopWidth') == '0px'
            assert not errors, errors
            print(json.dumps({'browser':engine,'all_chapters':'passed','resume_after_reload':'passed','formatted_export':'passed','mobile':'passed','page_errors':errors}),flush=True)
        finally:
            browser.close()
