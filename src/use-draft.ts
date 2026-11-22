// The reading page's unsaved edits as React state: the draft, its undo history, and the small counters that tell a block to redraw itself.
// Kept apart from the editor UI so PublishedBook can own it without loading the editor.
import{useEffect,useRef,useState}from'react';
import type{PubDoc,PubPara}from'./types';
import{emptyHistory,pushHistory,readScope,redo as redoStep,storeDraft,undo as undoStep,type Changes,type History}from'./inline-draft.ts';

export type How='typing'|'step';
// Where the caret goes once the blocks have been redrawn (after Enter, a merge, a format).
export interface Caret{scope:string;index:number;part:string;start:number;end?:number}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export function useDraft(doc:PubDoc|null,pubId:string,base:string,vk:string){
 const[changes,setChanges]=useState<Changes>({}),[epoch,setEpoch]=useState(0);
 const r=useRef({changes:{} as Changes,history:emptyHistory() as History,scope:'',at:0,revs:{} as Record<string,number>,pending:new Set<()=>void>(),caret:null as Caret|null,doc,vk,pubId,base});
 r.current.doc=doc;r.current.vk=vk;r.current.pubId=pubId;r.current.base=base;
 const put=(c:Changes)=>{r.current.changes=c;setChanges(c);};
 const api={
  changes,epoch,vk,
  canUndo:r.current.history.past.length>0,canRedo:r.current.history.future.length>0,
  // What the page shows for a scope: the draft's list if it has one, else the saved one.
  value:(scope:string):PubPara[]|string=>r.current.changes[scope]??(r.current.doc?readScope(r.current.doc,r.current.vk,scope):[]),
  // Typing joins one undo step until 800 ms pass; anything structural is a step of its own.
  commit(scope:string,value:PubPara[]|string,how:How='step',bump:string[]=[]){
   const s=r.current,now=Date.now(),was=api.value(scope);
   if(same(was,value)&&how==='typing')return;
   if(how==='step'||s.scope!==scope||now-s.at>800)s.history=pushHistory(s.history,s.changes);
   s.scope=how==='typing'?scope:'';s.at=now;
   for(const k of bump)s.revs[k]=(s.revs[k]||0)+1;
   const next={...s.changes};
   if(s.doc&&same(readScope(s.doc,s.vk,scope),value))delete next[scope];else next[scope]=value;  // back to the saved text is no change at all
   put(next);
  },
  rev:(key:string)=>r.current.revs[key]||0,
  bump(key:string){r.current.revs[key]=(r.current.revs[key]||0)+1;put({...r.current.changes});},
  // Blocks with typing not yet committed register here; flush makes the draft current before anything structural.
  onPending(fn:()=>void){r.current.pending.add(fn);return()=>{r.current.pending.delete(fn);};},
  flush(){for(const fn of[...r.current.pending])fn();},
  undo(){api.flush();const x=undoStep(r.current.history,r.current.changes);if(!x)return;r.current.history=x.history;r.current.scope='';put(x.changes);setEpoch(e=>e+1);},
  redo(){api.flush();const x=redoStep(r.current.history,r.current.changes);if(!x)return;r.current.history=x.history;r.current.scope='';put(x.changes);setEpoch(e=>e+1);},
  // A fresh start (after a save, a discard, a restore or a conflict): history is cleared and every block redraws.
  reset(next:Changes={}){r.current.history=emptyHistory();r.current.scope='';put(next);setEpoch(e=>e+1);},
  setCaret(c:Caret|null){r.current.caret=c;},
  takeCaret(scope:string,index:number,part:string):Caret|null{const c=r.current.caret;if(c&&c.scope===scope&&c.index===index&&c.part===part){r.current.caret=null;return c;}return null;},
  get live(){return r.current.changes;}
 };
 // Kept on this device while the owner works; an empty draft is cleared by the callers that mean it (save, discard).
 useEffect(()=>{
  if(!pubId||!Object.keys(changes).length)return;
  const t=setTimeout(()=>storeDraft(pubId,{book:pubId,base,vk,changes,at:Date.now()}),800);
  return()=>clearTimeout(t);
 },[changes,pubId,base,vk]);
 useEffect(()=>()=>{const s=r.current;if(s.pubId&&Object.keys(s.changes).length)storeDraft(s.pubId,{book:s.pubId,base:s.base,vk:s.vk,changes:s.changes,at:Date.now()});},[]);
 return api;
}
export type Drafting=ReturnType<typeof useDraft>;
