// Highlights and comments on the summary, and the chapter notes written "in your own words".
// Saved in this browser first (they work offline), then kept safe with the reader's Inkling account: every change is
// queued and sent to the server, which stores it encrypted and merges edits from the reader's other devices.
import{useEffect,useState}from'react';
import type{Anchor}from'./anchor';
export type Color='yellow'|'green'|'blue'|'pink';
export const COLORS:Color[]=['yellow','green','blue','pink'];
export interface Mark extends Anchor{
 id:string;updated:number;deleted?:boolean;kind?:'mark'|'note';
 book:string;slug:string;bookTitle:string;chapter:string;chapterTitle:string;lang:string;
 color:Color;note:string;source:''|'ai';model:string;created:number;
}
export type SyncState='synced'|'syncing'|'pending'|'local'|'offline'|'error';
interface Store{marks:Record<string,Mark>;dirty:string[];since:number}
const KEY='inkling-marks-v1',EVENT='inkling-marks';

function read():Store{try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&s.marks)return{marks:s.marks,dirty:s.dirty||[],since:s.since||0};}catch{/* unreadable */}return{marks:{},dirty:[],since:0};}
function write(s:Store){try{localStorage.setItem(KEY,JSON.stringify(s));}catch{/* full or private mode */}window.dispatchEvent(new Event(EVENT));}
export const newId=()=>Array.from(crypto.getRandomValues(new Uint8Array(10)),b=>(b%36).toString(36)).join('');

export const allMarks=()=>Object.values(read().marks).filter(m=>!m.deleted&&m.kind!=='note').sort((a,b)=>a.created-b.created);
export const marksFor=(book:string,chapter:string)=>allMarks().filter(m=>m.book===book&&m.chapter===chapter);
export const getMark=(id:string)=>{const m=read().marks[id];return m&&!m.deleted?m:null;};
/** Add or change a highlight (or a note record); it is sent to the account on the next sync. */
export function putMark(m:Omit<Mark,'updated'>){
 const s=read();s.marks[m.id]={...m,updated:Date.now()};if(!s.dirty.includes(m.id))s.dirty.push(m.id);write(s);soon();
}
export function updateMark(id:string,change:Partial<Mark>){const m=read().marks[id];if(m&&!m.deleted)putMark({...m,...change});}
export function removeMark(id:string){
 const s=read(),m=s.marks[id];if(!m)return;
 s.marks[id]={id,updated:Date.now(),deleted:true,kind:m.kind} as Mark;if(!s.dirty.includes(id))s.dirty.push(id);write(s);soon();
}
export function useMarks(book?:string,chapter?:string):Mark[]{
 const get=()=>book&&chapter?marksFor(book,chapter):allMarks();
 const[list,setList]=useState(get);
 useEffect(()=>{const on=()=>setList(get());on();window.addEventListener(EVENT,on);window.addEventListener('storage',on);return()=>{window.removeEventListener(EVENT,on);window.removeEventListener('storage',on);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[book,chapter]);
 return list;
}

// ---- chapter notes ride along as records of kind "note", one per chapter, with an id every device derives alike
export function noteId(book:string,chapter:string){
 let h=0xcbf29ce4|0,g=0x84222325|0;const k=book+'|'+chapter;
 for(let i=0;i<k.length;i++){const c=k.charCodeAt(i);h=Math.imul(h^c,16777619);g=Math.imul(g^c,2246822507);}
 return('note'+(h>>>0).toString(36)+(g>>>0).toString(36)).slice(0,40).padEnd(12,'0');
}
type NoteHook=(m:Mark)=>void;
let onRemoteNote:NoteHook|null=null;
/** notes.ts registers how a note from another device is applied here; notes that arrived before it loaded are applied now. */
export function receiveNotes(fn:NoteHook){onRemoteNote=fn;Object.values(read().marks).filter(m=>m.kind==='note').forEach(fn);}

// ---- sync with the account
let state:SyncState=read().dirty.length?'pending':'synced',timer=0,running=false;
const STATE_EVENT='inkling-marks-sync';
function setState(s:SyncState){state=s;window.dispatchEvent(new Event(STATE_EVENT));}
export function useSyncState():SyncState{
 const[s,set]=useState(state);
 useEffect(()=>{const on=()=>set(state);window.addEventListener(STATE_EVENT,on);return()=>window.removeEventListener(STATE_EVENT,on);},[]);
 return s;
}
function soon(){setState(state==='local'?'local':'pending');clearTimeout(timer);timer=window.setTimeout(()=>void sync(),1200);}
const send=(path:string,init?:RequestInit)=>fetch('/api/'+path,{credentials:'same-origin',...init,headers:{'Content-Type':'application/json','X-Summ-Request':'1',...(init?.headers||{})}});
export async function sync():Promise<void>{
 if(running){soon();return;}
 if(typeof navigator!=='undefined'&&!navigator.onLine){setState('offline');return;}
 running=true;setState('syncing');
 try{
  let s=read();
  for(let i=0;i<s.dirty.length;i+=100){
   const ids=s.dirty.slice(i,i+100),batch=ids.map(id=>s.marks[id]).filter(Boolean);
   const r=await send('marks',{method:'POST',body:JSON.stringify({marks:batch})});
   if(r.status===401){setState('local');return;}
   if(!r.ok)throw new Error(String(r.status));
   // done with these, unless they changed again while being sent
   const now=read();now.dirty=now.dirty.filter(id=>!ids.includes(id)||now.marks[id]?.updated!==s.marks[id]?.updated);write(now);
  }
  s=read();
  const r=await send('marks?since='+s.since);
  if(r.status===401){setState('local');return;}
  if(!r.ok)throw new Error(String(r.status));
  const got:{marks:Mark[];now:number}=await r.json();
  s=read();
  for(const m of got.marks){
   const mine=s.marks[m.id];
   if(mine&&mine.updated>=m.updated)continue;
   s.marks[m.id]=m;s.dirty=s.dirty.filter(id=>id!==m.id);
   if((m.kind==='note'||mine?.kind==='note')&&onRemoteNote)onRemoteNote(m);
  }
  s.since=got.now;write(s);
  setState(s.dirty.length?'pending':'synced');
 }catch{setState(navigator.onLine?'error':'offline');}
 finally{running=false;}
}
if(typeof window!=='undefined'){
 window.addEventListener('online',()=>void sync());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void sync();});
 window.addEventListener('inkling-account',()=>{const s=read();s.since=0;write(s);void sync();});
 setTimeout(()=>void sync(),1500);
}
