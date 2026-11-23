// Speak your note instead of typing it: a small mic in the corner of the note, recordings as quiet chips below it, and a
// transcript from ElevenLabs added to the note (right after recording when a key is set, or later from the chip).
import{useEffect,useRef,useState,type ReactNode}from'react';
import{TextField}from'@mui/material';
import{CloseRounded,MicNoneRounded,PauseRounded,PlayArrowRounded,StopRounded,ShortTextRounded}from'@mui/icons-material';
import{addClip,clock,deleteClip,markTranscribed,pickType,setVoiceKey,transcribe,transcribeWithAccount,useClips,useVoiceKey,voiceKey,voiceSupported,VoiceError,type Clip,type ClipMeta}from'./voice-notes';
import{tr}from'./i18n';
import{useAccountKeys}from'./account-keys';
const MAX=5*60e3;
const KEY_URL='https://elevenlabs.io/app/settings/api-keys';

/** Play, transcribe and remove recordings. Shared by the chapter note and the notebook. */
export function ClipChips({clips,lang,onTranscribe,busy}:{clips:Clip[];lang:string;onTranscribe?:(c:Clip)=>void;busy?:string}){
 const L=(t:string)=>tr(lang,t);
 const[playing,setPlaying]=useState(''),audio=useRef<HTMLAudioElement|null>(null),url=useRef('');
 const stop=()=>{audio.current?.pause();if(url.current)URL.revokeObjectURL(url.current);url.current='';setPlaying('');};
 useEffect(()=>stop,[]);
 function play(c:Clip){
  if(playing===c.id){stop();return;}
  stop();url.current=URL.createObjectURL(c.blob);
  const a=audio.current||(audio.current=new Audio());a.src=url.current;a.onended=stop;void a.play().catch(stop);setPlaying(c.id);
 }
 if(!clips.length)return null;
 return <div className="vn-clips">{clips.map(c=><span key={c.id} className={'vn-clip'+(playing===c.id?' on':'')}>
  <button type="button" aria-label={L(playing===c.id?'Pause':'Play')} onClick={()=>play(c)}>{playing===c.id?<PauseRounded/>:<PlayArrowRounded/>}</button>
  <span className="vn-len" dir="ltr">{clock(c.ms)}</span>
  {onTranscribe&&!c.transcribed&&<button type="button" className={busy===c.id?'spin':''} aria-label={L('Transcribe')} title={L('Transcribe')} disabled={!!busy} onClick={()=>onTranscribe(c)}><ShortTextRounded/></button>}
  <button type="button" aria-label={L('Delete recording')} title={L('Delete recording')} onClick={()=>{if(playing===c.id)stop();if(confirm(L('Delete this recording?')))void deleteClip(c.id);}}><CloseRounded/></button>
 </span>)}</div>;
}

/** The ElevenLabs key field, in Settings and (once, when needed) under the note. */
export function VoiceKeyField({lang,onSaved,account}:{lang:string;onSaved?:()=>void;account?:boolean}){
 const L=(t:string)=>tr(lang,t),key=useVoiceKey(),[v,setV]=useState(key);
 useEffect(()=>setV(key),[key]);
 if(account&&!key)return <p className="ai-form-note">{L('Voice notes are transcribed with the ElevenLabs key saved in your account.')}</p>;
 return <div className="vn-key">
  <TextField size="small" fullWidth type="password" autoComplete="off" label={L('ElevenLabs key · voice-note transcripts')} placeholder="sk_…" value={v}
   onChange={e=>{setV(e.target.value);if(!onSaved)setVoiceKey(e.target.value);}} slotProps={{htmlInput:{dir:'ltr',spellCheck:false}}}/>
  {onSaved&&<button type="button" className="vn-save" disabled={!v.trim()} onClick={()=>{setVoiceKey(v);onSaved();}}>{L('Save')}</button>}
  <a href={KEY_URL} target="_blank" rel="noreferrer">{L('Get a key')}</a>
 </div>;
}

interface Props{lang:string;meta:ClipMeta;onTranscript:(text:string)=>void;children:ReactNode}
export default function VoiceNote({lang,meta,onTranscript,children}:Props){
 const L=(t:string)=>tr(lang,t);
 const clips=useClips(meta.bookId,meta.chapterId),key=useVoiceKey(),acct=useAccountKeys();
 const[rec,setRec]=useState<number|null>(null),[now,setNow]=useState(0),[busy,setBusy]=useState(''),[ask,setAsk]=useState<Clip|null>(null),[err,setErr]=useState('');
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),keyRef=useRef(key),acctRef=useRef(acct.voice);
 keyRef.current=key;acctRef.current=acct.voice;
 useEffect(()=>{if(rec===null)return;const t=setInterval(()=>{const n=Date.now();setNow(n);if(n-rec>=MAX)recorder.current?.stop();},250);return()=>clearInterval(t);},[rec]);
 useEffect(()=>()=>{recorder.current?.state==='recording'&&recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());},[]);

 async function run(c:Clip){
  const k=keyRef.current;
  if(!k&&!acctRef.current){setAsk(c);return;}
  setBusy(c.id);setErr('');
  try{const text=k?await transcribe(c.blob,meta.lang,k):await transcribeWithAccount(c.blob,meta.lang);if(text)onTranscript(text);await markTranscribed(c);setAsk(null);}
  catch(e){const kind=e instanceof VoiceError?e.kind:'other';
   setErr(kind==='key'?L('ElevenLabs did not accept the key.'):kind==='limit'?L('ElevenLabs says the limit is reached. Try again later.'):kind==='network'?L('Could not reach ElevenLabs. The recording is kept; transcribe it later.'):L('Transcription failed')+': '+(e as Error).message);
   if(kind==='key')setAsk(c);}
  finally{setBusy('');}
 }
 async function start(){
  setErr('');
  let s:MediaStream;
  try{s=await navigator.mediaDevices.getUserMedia({audio:true});}catch{setErr(L('The microphone is not available. Allow it in the browser to record.'));return;}
  stream.current=s;
  const type=pickType(),r=new MediaRecorder(s,{...(type?{mimeType:type}:{}),audioBitsPerSecond:32000}),parts:Blob[]=[],t0=Date.now();
  r.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
  r.onstop=async()=>{
   s.getTracks().forEach(t=>t.stop());setRec(null);recorder.current=null;
   const ms=Date.now()-t0,blob=new Blob(parts,{type:r.mimeType||type||'audio/webm'});
   if(ms<700||!blob.size)return;
   try{const c=await addClip(meta,blob,ms);if(keyRef.current||acctRef.current)void run(c);}catch{setErr(L('Could not save the recording on this device.'));}
  };
  r.start(1000);recorder.current=r;setNow(t0);setRec(t0);
 }

 const can=voiceSupported();
 return <>
  <div className={"study-field"+(rec!==null?" recording":"")}>{children}
   {can&&(rec===null
    ?<button type="button" className="vn-mic" aria-label={L('Record your note')} title={L('Record your note')} onClick={()=>void start()}><MicNoneRounded/></button>
    :<button type="button" className="vn-rec" aria-label={L('Stop recording')} onClick={()=>recorder.current?.stop()}><i/><span dir="ltr">{clock(now-rec)}</span><StopRounded/></button>)}
  </div>
  <ClipChips clips={clips} lang={lang} onTranscribe={c=>void run(c)} busy={busy}/>
  {ask&&<VoiceKeyField lang={lang} onSaved={()=>{const c=ask;keyRef.current=voiceKey();void run(c);}}/>}
  {err&&<p className="vn-err" role="alert">{err}</p>}
 </>;
}
