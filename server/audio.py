"""Narration: Piper voices run offline on the server's CPU; ElevenLabs uses each user's own key."""
from __future__ import annotations
import os,threading
from pathlib import Path
import httpx
# Medium voices keep synthesis faster than real time on an old 4-core CPU; Persian has no high-quality Piper voice.
PIPER_VOICES={'en':'en_US-lessac-medium','fa':'fa_IR-gyro-medium','de':'de_DE-thorsten-medium','es':'es_ES-davefx-medium','fr':'fr_FR-siwis-medium','tr':'tr_TR-dfki-medium','zh':'zh_CN-huayan-medium','ar':'ar_JO-kareem-medium'}
# Eleven v4 Turbo reads Persian and every other language here at half the credits of v3/v4; ELEVENLABS_MODEL overrides it.
ELEVEN_MODEL=os.getenv('ELEVENLABS_MODEL','eleven_v4_turbo')
# Podcast-style delivery: 128 kbps, a steady close voice, no added style, speaker boost for presence.
ELEVEN_FORMAT='mp3_44100_128'
ELEVEN_SETTINGS={'stability':0.55,'similarity_boost':0.8,'style':0.0,'use_speaker_boost':True}
ELEVEN_DEFAULT_VOICE='JBFqnCBsd6RMkjVDRZzb'
_voices:dict={};_lock=threading.Lock()
def _voice(language:str):
    from piper import PiperVoice
    from piper.download_voices import download_voice
    name=PIPER_VOICES.get(language)
    if not name:raise ValueError('No offline voice for this language.')
    with _lock:
        if name not in _voices:
            folder=Path(os.getenv('SUMM_DATA_DIR','data'))/'voices';folder.mkdir(parents=True,exist_ok=True)
            if not (folder/(name+'.onnx')).exists():download_voice(name,folder)
            _voices[name]=PiperVoice.load(folder/(name+'.onnx'))
        return _voices[name]
def piper_mp3(text:str,language:str)->bytes:
    import lameenc
    voice=_voice(language)
    encoder=lameenc.Encoder();encoder.set_bit_rate(64);encoder.set_in_sample_rate(voice.config.sample_rate);encoder.set_channels(1);encoder.set_quality(5)
    out=bytearray()
    with _lock:  # One synthesis at a time keeps the shared CPU responsive for everything else.
        for chunk in voice.synthesize(text):out+=encoder.encode(chunk.audio_int16_bytes)
    out+=encoder.flush();return bytes(out)
async def eleven_mp3(text:str,language:str,key:str,voice:str)->bytes:
    async with httpx.AsyncClient(timeout=180) as client:
        r=await client.post('https://api.elevenlabs.io/v1/text-to-speech/'+(voice or ELEVEN_DEFAULT_VOICE),params={'output_format':ELEVEN_FORMAT},headers={'xi-api-key':key},json={'text':text,'model_id':ELEVEN_MODEL,'language_code':language,'voice_settings':ELEVEN_SETTINGS})
    if r.status_code in (401,403):raise PermissionError('ElevenLabs rejected your key.')
    if r.status_code==429:raise OverflowError('Your ElevenLabs quota is used up or the service is busy.')
    if r.status_code!=200 or not r.headers.get('content-type','').startswith('audio/'):
        try:detail=(r.json().get('detail') or {}).get('message','')
        except ValueError:detail=''
        if 'api key' in detail.lower():raise PermissionError('ElevenLabs rejected your key: '+detail[:200])
        raise ConnectionError('ElevenLabs could not create audio (HTTP '+str(r.status_code)+(': '+detail[:200] if detail else '')+').')
    return r.content
# ElevenLabs takes a few thousand characters per request; longer chapters are read in parts and joined.
ELEVEN_CHUNK=4000
def split_text(text:str,limit:int=ELEVEN_CHUNK)->list[str]:
    """Break at paragraph ends, then sentence ends, so no part stops mid-thought."""
    import re
    parts:list[str]=[];current=''
    for para in [p.strip() for p in text.split('\n') if p.strip()]:
        pieces=[para] if len(para)<=limit else re.split(r'(?<=[.!?؟،؛])\s+',para)
        for piece in pieces:
            while len(piece)>limit:parts.append(piece[:limit]);piece=piece[limit:]
            if current and len(current)+len(piece)+2>limit:parts.append(current);current=''
            current=(current+'\n\n'+piece) if current else piece
    if current:parts.append(current)
    return parts
def eleven_long(text:str,language:str,key:str,voice:str)->bytes:
    """A whole chapter as one MP3: each part synthesized in turn, frames joined (same format, so players read it as one file)."""
    import asyncio
    return b''.join(asyncio.run(eleven_mp3(part,language,key,voice)) for part in split_text(text))
