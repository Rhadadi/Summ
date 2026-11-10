"""Narration: Piper voices run offline on the server's CPU; ElevenLabs uses each user's own key."""
from __future__ import annotations
import os,threading
from pathlib import Path
import httpx
# Medium voices keep synthesis faster than real time on an old 4-core CPU; Persian has no high-quality Piper voice.
PIPER_VOICES={'en':'en_US-lessac-medium','fa':'fa_IR-gyro-medium','de':'de_DE-thorsten-medium','es':'es_ES-davefx-medium','fr':'fr_FR-siwis-medium','tr':'tr_TR-dfki-medium','zh':'zh_CN-huayan-medium','ar':'ar_JO-kareem-medium'}
# eleven_v3 is the ElevenLabs model that covers Persian; multilingual v2 is steadier for the others.
ELEVEN_MODELS={'fa':'eleven_v3'}
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
        r=await client.post('https://api.elevenlabs.io/v1/text-to-speech/'+(voice or ELEVEN_DEFAULT_VOICE),params={'output_format':'mp3_44100_64'},headers={'xi-api-key':key},json={'text':text,'model_id':ELEVEN_MODELS.get(language,'eleven_multilingual_v2')})
    if r.status_code in (401,403):raise PermissionError('ElevenLabs rejected your key.')
    if r.status_code==429:raise OverflowError('Your ElevenLabs quota is used up or the service is busy.')
    if r.status_code!=200 or not r.headers.get('content-type','').startswith('audio/'):raise ConnectionError('ElevenLabs could not create audio (HTTP '+str(r.status_code)+').')
    return r.content
