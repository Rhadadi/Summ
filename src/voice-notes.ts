// Voice notes for "In your own words": short recordings kept in this browser (IndexedDB), and their transcripts from
// ElevenLabs Scribe with the reader's own key. Neither the audio nor the key ever reaches the Inkling server.
import{useEffect,useState}from'react';
export interface ClipMeta{bookId:string;slug:string;bookTitle:string;chapterId:string;chapterTitle:string;lang:string}
export interface Clip extends ClipMeta{id:string;at:number;ms:number;type:string;blob:Blob;transcribed:boolean}
const DB='inkling-voice',STORE='clips',EVENT='inkling-voice';
export const noteKey=(bookId:string,chapterId:string)=>bookId+'|'+chapterId;
export const voiceSupported=()=>typeof window!=='undefined'&&!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined'&&typeof indexedDB!=='undefined';

function db():Promise<IDBDatabase>{
 return new Promise((ok,fail)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore(STORE,{keyPath:'id'});s.createIndex('note','note');};r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);});
}
async function run<T>(mode:IDBTransactionMode,work:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const d=await db();
 return new Promise((ok,fail)=>{const t=d.transaction(STORE,mode),q=work(t.objectStore(STORE));t.oncomplete=()=>ok(q.result);t.onerror=()=>fail(t.error);});
}
const changed=()=>window.dispatchEvent(new Event(EVENT));
export async function addClip(meta:ClipMeta,blob:Blob,ms:number):Promise<Clip>{
 const c:Clip={...meta,id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),at:Date.now(),ms,type:blob.type,blob,transcribed:false};
 await run('readwrite',s=>s.put({...c,note:noteKey(meta.bookId,meta.chapterId)}));changed();return c;
}
export async function deleteClip(id:string){await run('readwrite',s=>s.delete(id));changed();}
export async function markTranscribed(c:Clip){await run('readwrite',s=>s.put({...c,transcribed:true,note:noteKey(c.bookId,c.chapterId)}));changed();}
export async function clipsFor(bookId:string,chapterId:string):Promise<Clip[]>{
 if(typeof indexedDB==='undefined')return[];
 const all=await run<Clip[]>('readonly',s=>s.index('note').getAll(noteKey(bookId,chapterId)));
 return all.sort((a,b)=>a.at-b.at);
}
export async function allClips():Promise<Clip[]>{
 if(typeof indexedDB==='undefined')return[];
 try{return (await run<Clip[]>('readonly',s=>s.getAll())).sort((a,b)=>a.at-b.at);}catch{return[];}
}
/** The clips of one chapter (or of every chapter, without arguments), kept current. */
export function useClips(bookId?:string,chapterId?:string):Clip[]{
 const[list,setList]=useState<Clip[]>([]);
 useEffect(()=>{
  let live=true;
  const load=()=>{(bookId&&chapterId?clipsFor(bookId,chapterId):allClips()).then(l=>{if(live)setList(l);}).catch(()=>{});};
  load();window.addEventListener(EVENT,load);return()=>{live=false;window.removeEventListener(EVENT,load);};
 },[bookId,chapterId]);
 return list;
}

// The reader's ElevenLabs key, kept beside the AI key in this browser.
const KEY='inkling-voice-key-v1',KEY_EVENT='inkling-voice-key';
export const voiceKey=()=>{try{return localStorage.getItem(KEY)||'';}catch{return'';}};
export function setVoiceKey(k:string){try{if(k.trim())localStorage.setItem(KEY,k.trim());else localStorage.removeItem(KEY);}catch{/* private mode */}window.dispatchEvent(new Event(KEY_EVENT));}
export function useVoiceKey():string{
 const[k,setK]=useState(voiceKey);
 useEffect(()=>{const on=()=>setK(voiceKey());window.addEventListener(KEY_EVENT,on);window.addEventListener('storage',on);return()=>{window.removeEventListener(KEY_EVENT,on);window.removeEventListener('storage',on);};},[]);
 return k;
}

export class VoiceError extends Error{constructor(message:string,public kind:'key'|'limit'|'network'|'other'='other'){super(message);}}
/** Speech to text with ElevenLabs Scribe; filler words and sound tags left out, since this is a note. */
export async function transcribe(blob:Blob,lang:string,key:string):Promise<string>{
 const form=new FormData();
 form.append('model_id','scribe_v2');
 form.append('file',blob,'note.'+(blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm'));
 if(lang)form.append('language_code',lang);
 form.append('tag_audio_events','false');form.append('no_verbatim','true');
 let r:Response;
 try{r=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':key},body:form});}
 catch(e){throw new VoiceError((e as Error).message,'network');}
 if(!r.ok){
  let detail='';try{const j=await r.json();detail=typeof j.detail==='string'?j.detail:j.detail?.message||'';}catch{/* not JSON */}
  throw new VoiceError(detail||String(r.status),r.status===401||r.status===403?'key':r.status===429||r.status===402?'limit':'other');
 }
 const j=await r.json();
 return String(j.text||'').trim();
}

/** A recorder for one note: picks a format the browser can make and ElevenLabs can read. */
export function pickType(){
 for(const t of['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'])if(MediaRecorder.isTypeSupported?.(t))return t;
 return'';
}
export const clock=(ms:number)=>{const s=Math.round(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
