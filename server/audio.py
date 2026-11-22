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
# Dev and test only: SUMM_FAKE_AUDIO=1 returns a short silent MP3 instead of running Piper or calling ElevenLabs (no model download, no credits).
def _fake_mp3(text:str)->bytes:
    import time,lameenc
    time.sleep(float(os.getenv('SUMM_FAKE_AUDIO_DELAY','0.8')))
    encoder=lameenc.Encoder();encoder.set_bit_rate(64);encoder.set_in_sample_rate(16000);encoder.set_channels(1);encoder.set_quality(7)
    return bytes(encoder.encode(b'\x00\x00'*16000*max(1,min(8,len(text)//400+1))))+encoder.flush()
def fake()->bool:return os.getenv('SUMM_FAKE_AUDIO')=='1'
def piper_mp3(text:str,language:str,speed:float=1.0)->bytes:
    if fake():return _fake_mp3(text)
    import lameenc
    from piper import SynthesisConfig
    voice=_voice(language)
    # length_scale is the phoneme duration: below 1 is faster, so a speed of 1.25 reads 25% quicker (piper-tts 1.8 SynthesisConfig).
    config=SynthesisConfig(length_scale=1/max(0.5,min(2.0,speed or 1.0)))
    encoder=lameenc.Encoder();encoder.set_bit_rate(64);encoder.set_in_sample_rate(voice.config.sample_rate);encoder.set_channels(1);encoder.set_quality(5)
    out=bytearray()
    with _lock:  # One synthesis at a time keeps the shared CPU responsive for everything else.
        for chunk in voice.synthesize(text,syn_config=config):out+=encoder.encode(chunk.audio_int16_bytes)
    out+=encoder.flush();return bytes(out)
def eleven_body(text:str,language:str,settings:dict|None,with_language:bool=True)->dict:
    """settings: voice, model, speed, stability, similarity, style, speakerBoost (all optional). The recommended defaults fill the rest."""
    s=settings or {}
    voice_settings={**ELEVEN_SETTINGS}
    for mine,theirs in (('stability','stability'),('similarity','similarity_boost'),('style','style'),('speakerBoost','use_speaker_boost'),('speed','speed')):
        if s.get(mine) is not None:voice_settings[theirs]=s[mine]
    body={'text':text,'model_id':s.get('model') or ELEVEN_MODEL,'voice_settings':voice_settings}
    if with_language:body['language_code']=language
    return body
async def eleven_mp3(text:str,language:str,key:str,voice:str,settings:dict|None=None)->bytes:
    if fake():return _fake_mp3(text)
    url='https://api.elevenlabs.io/v1/text-to-speech/'+(voice or (settings or {}).get('voice') or ELEVEN_DEFAULT_VOICE)
    async with httpx.AsyncClient(timeout=180) as client:
        r=await client.post(url,params={'output_format':ELEVEN_FORMAT},headers={'xi-api-key':key},json=eleven_body(text,language,settings))
        # Some models (multilingual v2) refuse language_code; the request is repeated once without it.
        if r.status_code in (400,422) and 'language' in r.text.lower():
            r=await client.post(url,params={'output_format':ELEVEN_FORMAT},headers={'xi-api-key':key},json=eleven_body(text,language,settings,False))
    if r.status_code in (401,403):raise PermissionError('ElevenLabs rejected your key.')
    if r.status_code==429:raise OverflowError('Your ElevenLabs quota is used up or the service is busy.')
    if r.status_code!=200 or not r.headers.get('content-type','').startswith('audio/'):
        try:
            detail=r.json().get('detail') or {}
            # ElevenLabs answers {"detail":{"message":...}} or, for validation errors, a list of {"msg":...}.
            detail=detail.get('message','') if isinstance(detail,dict) else '; '.join(str(d.get('msg','')) for d in detail if isinstance(d,dict)) if isinstance(detail,list) else str(detail)
        except (ValueError,AttributeError):detail=''
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
def eleven_long(text:str,language:str,key:str,voice:str,settings:dict|None=None)->bytes:
    """A whole chapter as one MP3: each part synthesized in turn, frames joined (same format, so players read it as one file)."""
    import asyncio
    return b''.join(asyncio.run(eleven_mp3(part,language,key,voice,settings=settings)) for part in split_text(text))
