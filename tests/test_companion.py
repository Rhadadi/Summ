import json
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from server import accounts
from server.app import app
from tests.test_library import RolesTest

GEMINI_KEY = 'AIza' + 'x' * 35
ELEVEN_KEY = 'sk_test_0000000000000000000000'


def mocked(handler):
    real = httpx.AsyncClient
    return patch('server.companion.httpx.AsyncClient', lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


class CompanionTests(RolesTest):
    def test_chat_streams_with_the_account_key_and_the_key_stays_on_the_server(self):
        owner, uid = self.owner()
        body = {'system': 'You are the study companion.', 'turns': [{'role': 'user', 'text': 'Explain the chapter.'}]}
        self.assertEqual(owner.post('/api/companion/chat', json=body).status_code, 412)
        accounts.save_key(uid, GEMINI_KEY, 'gemini-flash-latest', None, None)
        seen = []

        def handler(request: httpx.Request):
            seen.append((str(request.url), request.headers.get('x-goog-api-key'), json.loads(request.content)))
            sse = ''.join('data: ' + json.dumps({'candidates': [{'content': {'parts': [{'text': t}]}}]}) + '\r\n\r\n' for t in ['Safety ', 'and adventure.'])
            return httpx.Response(200, text=sse, headers={'content-type': 'text/event-stream'})

        with mocked(handler):
            r = owner.post('/api/companion/chat', json=body)
        self.assertEqual(r.status_code, 200, r.text)
        events = [json.loads(line[5:]) for line in r.text.splitlines() if line.startswith('data:')]
        self.assertEqual(''.join(e.get('text', '') for e in events), 'Safety and adventure.')
        self.assertTrue(events[-1].get('done'))
        url, key, sent = seen[0]
        self.assertIn('gemini-flash-latest:streamGenerateContent', url)
        self.assertEqual(key, GEMINI_KEY)
        self.assertEqual(sent['systemInstruction']['parts'][0]['text'], 'You are the study companion.')
        self.assertEqual(sent['contents'], [{'role': 'user', 'parts': [{'text': 'Explain the chapter.'}]}])
        self.assertNotIn(GEMINI_KEY, r.text)

    def test_chat_refused_key_and_signed_out(self):
        owner, uid = self.owner()
        accounts.save_key(uid, GEMINI_KEY, 'gemini-flash-latest', None, None)
        body = {'system': 's', 'turns': [{'role': 'user', 'text': 'q'}]}
        with mocked(lambda request: httpx.Response(400, json={'error': {'message': 'API key not valid.'}})):
            r = owner.post('/api/companion/chat', json=body)
        self.assertEqual(r.status_code, 422)
        self.assertIn('API key not valid', r.json()['detail'])
        anon = TestClient(app, headers={'X-Summ-Request': '1'})
        self.addCleanup(anon.close)
        self.assertEqual(anon.post('/api/companion/chat', json=body).status_code, 401)

    def test_transcribe_forwards_the_recording_with_the_account_key(self):
        owner, uid = self.owner()
        audio = b'\x1aE\xdf\xa3' + b'0' * 4000
        self.assertEqual(owner.post('/api/voice/transcribe?lang=fa', content=audio, headers={'content-type': 'audio/webm'}).status_code, 412)
        accounts.save_service_key(uid, 'elevenlabs', ELEVEN_KEY, 'Voice1')
        seen = []

        def handler(request: httpx.Request):
            seen.append((str(request.url), request.headers.get('xi-api-key'), request.content))
            return httpx.Response(200, json={'text': ' به نظرم این فصل دربارهٔ اعتماد است. ', 'language_code': 'fas'})

        with mocked(handler):
            r = owner.post('/api/voice/transcribe?lang=fa', content=audio, headers={'content-type': 'audio/webm;codecs=opus'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json(), {'text': 'به نظرم این فصل دربارهٔ اعتماد است.'})
        url, key, sent = seen[0]
        self.assertEqual(url, 'https://api.elevenlabs.io/v1/speech-to-text')
        self.assertEqual(key, ELEVEN_KEY)
        self.assertIn(b'scribe_v2', sent)
        self.assertIn(b'name="language_code"\r\n\r\nfa', sent)
        self.assertIn(audio, sent)
        self.assertNotIn(ELEVEN_KEY, r.text)
        self.assertEqual(owner.post('/api/voice/transcribe', content=b'hello', headers={'content-type': 'text/plain'}).status_code, 415)
        self.assertEqual(owner.post('/api/voice/transcribe', content=b'0' * 2_100_000, headers={'content-type': 'audio/webm'}).status_code, 413)
