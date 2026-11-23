"""The reader's study companion and voice-note transcripts, run with the keys the signed-in reader saved in Account.

The keys are decrypted here and sent only to Google or ElevenLabs; they never go back to the browser.
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/'
SCRIBE = 'https://api.elevenlabs.io/v1/speech-to-text'


class Failed(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _reason(raw: bytes, fallback: str) -> str:
    try:
        data = json.loads(raw)
    except ValueError:
        return fallback
    error = data.get('error') if isinstance(data, dict) else None
    if isinstance(error, dict) and isinstance(error.get('message'), str):
        return error['message'][:300]
    detail = data.get('detail') if isinstance(data, dict) else None
    if isinstance(detail, str):
        return detail[:300]
    if isinstance(detail, dict) and isinstance(detail.get('message'), str):
        return detail['message'][:300]
    return fallback


async def open_chat(system: str, turns: list[dict], key: str, model: str) -> tuple[httpx.AsyncClient, httpx.Response]:
    """Start a streamed Gemini answer. Raises Failed before anything is streamed, so the caller can answer with a status."""
    body = {
        'systemInstruction': {'parts': [{'text': system}]},
        'contents': [{'role': 'model' if t['role'] == 'assistant' else 'user', 'parts': [{'text': t['text']}]} for t in turns],
    }
    client = httpx.AsyncClient(timeout=httpx.Timeout(180, connect=15))
    try:
        request = client.build_request('POST', f'{GEMINI}{model}:streamGenerateContent?alt=sse',
                                       headers={'x-goog-api-key': key}, json=body)
        response = await client.send(request, stream=True)
    except BaseException:
        await client.aclose()
        raise
    if response.status_code != 200:
        raw = await response.aread()
        await response.aclose()
        await client.aclose()
        raise Failed(response.status_code, _reason(raw, f'Gemini answered {response.status_code}.'))
    return client, response


async def pieces(client: httpx.AsyncClient, response: httpx.Response) -> AsyncIterator[str]:
    """Gemini's stream, re-sent to the browser as server-sent events: {"text": …} chunks, then {"done": true}."""
    try:
        async for line in response.aiter_lines():
            if not line.startswith('data:'):
                continue
            try:
                chunk = json.loads(line[5:])
            except ValueError:
                continue
            candidate = (chunk.get('candidates') or [{}])[0]
            text = ''.join(p.get('text', '') for p in (candidate.get('content') or {}).get('parts', []) if not p.get('thought'))
            if text:
                yield 'data: ' + json.dumps({'text': text}, ensure_ascii=False) + '\n\n'
            if candidate.get('finishReason') in ('SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'):
                yield 'data: ' + json.dumps({'refused': True}) + '\n\n'
                return
        yield 'data: {"done": true}\n\n'
    except httpx.HTTPError:
        yield 'data: ' + json.dumps({'error': 'The connection to Google was interrupted.'}) + '\n\n'
    finally:
        await response.aclose()
        await client.aclose()


async def transcribe(audio: bytes, content_type: str, language: str, key: str) -> str:
    """Speech to text with ElevenLabs Scribe; filler words and sound tags left out, since this becomes a note."""
    ext = 'm4a' if 'mp4' in content_type else 'ogg' if 'ogg' in content_type else 'webm'
    fields = {'model_id': 'scribe_v2', 'tag_audio_events': 'false', 'no_verbatim': 'true'}
    if language:
        fields['language_code'] = language
    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=15)) as client:
        response = await client.post(SCRIBE, headers={'xi-api-key': key}, data=fields,
                                     files={'file': ('note.' + ext, audio, content_type)})
    if response.status_code != 200:
        raise Failed(response.status_code, _reason(response.content, f'ElevenLabs answered {response.status_code}.'))
    return str(response.json().get('text', '')).strip()
