// The owner's unsaved edits on the reading page. A draft is a patch of whole lists it replaces, never a second copy of the book,
// so re-applying it to a newer document after a conflict is well defined. Pure apart from the two localStorage helpers at the end.
import type{PubDoc,PubPara,PubVersion}from'./types.ts';
import{parseInline,serializeInline,splitSpans,concatSpans}from'./inline.ts';
import{versionKey}from'./published.ts';

// ch:<id>:p chapter paragraphs, ch:<id>:r chapter review, ov:p overview, ov:t takeaways, g:<n> guide items, gt:<n> guide title, t:<id> chapter title
export type Scope=`ch:${string}:p`|`ch:${string}:r`|'ov:p'|'ov:t'|`g:${number}`|`gt:${number}`|`t:${string}`;
export type Changes=Record<string,PubPara[]|string>;
export interface Draft{book:string;base:string;vk:string;changes:Changes;at:number}
export const HISTORY=100;

const version=(doc:PubDoc,vk:string):PubVersion|undefined=>doc.versions.find(v=>versionKey(v)===vk);
const part=(scope:string)=>scope.split(':');
const titleIn=(doc:PubDoc,id:string,lang:string)=>{const t=doc.chapters.find(c=>c.id===id)?.title;return t?(t[lang]??t[doc.originalLanguage]??Object.values(t)[0]??''):'';};
// What the page shows for this scope right now: the list (or text) a change would replace.
export function readScope(doc:PubDoc,vk:string,scope:string):PubPara[]|string{
 const v=version(doc,vk);if(!v)return[];
 const[kind,a,b]=part(scope);
 if(kind==='ch')return(b==='r'?v.chapters[a]?.review:v.chapters[a]?.paragraphs)||[];
 if(kind==='ov')return(a==='t'?v.overview?.takeaways:v.overview?.paragraphs)||[];
 if(kind==='g')return v.guide?.sections[+a]?.items||[];
 if(kind==='gt')return v.guide?.sections[+a]?.title||'';
 if(kind==='t')return titleIn(doc,a,v.language);
 return[];
}
// A scope whose chapter or section has since disappeared (after a conflict) is skipped, not resurrected.
const exists=(doc:PubDoc,v:PubVersion,scope:string)=>{
 const[kind,a]=part(scope);
 if(kind==='ch'||kind==='t')return doc.chapters.some(c=>c.id===a);
 if(kind==='g'||kind==='gt')return !!v.guide?.sections[+a];
 return kind==='ov';
};
// The document with the draft applied. Only the lists the draft names are copied.
export function applyDraft(doc:PubDoc,draft:Draft):PubDoc{
 const v=version(doc,draft.vk);if(!v||!Object.keys(draft.changes).length)return doc;
 const nv:PubVersion={...v,chapters:{...v.chapters}};let chapters=doc.chapters;
 for(const[scope,value]of Object.entries(draft.changes)){
  if(!exists(doc,v,scope))continue;
  const[kind,a,b]=part(scope);
  if(kind==='ch'){const old=nv.chapters[a]||{paragraphs:[]};nv.chapters[a]=b==='r'?{...old,review:value as PubPara[]}:{...old,paragraphs:value as PubPara[]};}
  else if(kind==='ov')nv.overview={paragraphs:[],...nv.overview,[a==='t'?'takeaways':'paragraphs']:value as PubPara[]};
  else if(kind==='g'||kind==='gt'){
   const sections=(nv.guide?.sections||[]).map(s=>s);const at=+a;
   sections[at]=kind==='g'?{...sections[at],items:value as PubPara[]}:{...sections[at],title:value as string};
   nv.guide={...nv.guide!,sections};
  }
  else if(kind==='t')chapters=chapters.map(c=>c.id===a?{...c,title:{...c.title,[v.language]:value as string}}:c);
 }
 return{...doc,chapters,versions:doc.versions.map(x=>x===v?nv:x)};
}
// 'overview' stands for the overview and its takeaways; the audio panel uses these to preselect what changed.
export function changedChapterIds(changes:Changes):string[]{
 const out=new Set<string>();
 for(const scope of Object.keys(changes)){const[kind,a]=part(scope);if(kind==='ch'||kind==='t')out.add(a);else if(kind==='ov')out.add('overview');}
 return[...out];
}
export const countChanges=(changes:Changes)=>Object.keys(changes).length;
// How many paragraphs (or titles) differ from the document: what the edit bar calls "unsaved changes".
export function diffCount(doc:PubDoc,draft:Draft):number{
 let n=0;
 for(const[scope,value]of Object.entries(draft.changes)){
  const was=readScope(doc,draft.vk,scope);
  if(typeof value==='string'||typeof was==='string'){if(value!==was)n++;continue;}
  const len=Math.max(value.length,was.length);
  for(let i=0;i<len;i++)if(JSON.stringify(value[i])!==JSON.stringify(was[i]))n++;
 }
 return n;
}
// Scopes the draft changed that someone else also changed since the draft's base: "your version will replace it".
export function overlaps(older:PubDoc,newer:PubDoc,draft:Draft):string[]{
 return Object.keys(draft.changes).filter(s=>JSON.stringify(readScope(older,draft.vk,s))!==JSON.stringify(readScope(newer,draft.vk,s)));
}
// A name for a scope in a sentence: the chapter's or the guide section's title; empty for the overview.
export function scopeName(doc:PubDoc,vk:string,scope:string):string{
 const v=version(doc,vk),[kind,a]=part(scope);if(!v)return'';
 if(kind==='ch'||kind==='t')return titleIn(doc,a,v.language);
 if(kind==='g'||kind==='gt')return v.guide?.sections[+a]?.title||'';
 return'';
}
// Empty paragraphs are dropped before saving (the server refuses them); figures and tables are never empty.
export function dropEmpty(doc:PubDoc):PubDoc{
 // An empty heading (added, never typed in) is not a heading.
 const tidy=(p:PubPara):PubPara=>p.heading!==undefined&&!p.heading.trim()?(({heading:_,...rest})=>rest)(p):p;
 const keep=(list?:PubPara[])=>list?.filter(p=>p.text.trim()||p.image||p.table).map(tidy);
 const clean=(list?:PubPara[])=>list&&(keep(list)!.length!==list.length||list.some((p,i)=>tidy(p)!==p))?keep(list):list;
 return{...doc,versions:doc.versions.map(v=>({...v,
  overview:v.overview&&{...v.overview,paragraphs:clean(v.overview.paragraphs)!,...(v.overview.takeaways?{takeaways:clean(v.overview.takeaways)}:{})},
  guide:v.guide&&{...v.guide,sections:v.guide.sections.map(s=>({...s,items:clean(s.items)!}))},
  chapters:Object.fromEntries(Object.entries(v.chapters).map(([id,c])=>[id,{...c,paragraphs:clean(c.paragraphs)!,...(c.review?{review:clean(c.review)}:{})}]))}))};
}

// Enter splits a paragraph at the caret. The first half keeps everything (heading, quote, pages); the second is a plain paragraph of the same kind with the same pages.
export function splitPara(p:PubPara,at:number):[PubPara,PubPara]|null{
 if(p.image||p.table)return null;
 const[l,r]=splitSpans(parseInline(p.text),at);
 return[{...p,text:serializeInline(l)},{text:serializeInline(r),...(p.quote?{quote:true}:{}),...(p.pages?{pages:[...p.pages]}:{}),...(p.chapters?{chapters:[...p.chapters]}:{})}];
}
// Backspace at the start joins a paragraph to the one before it: pages are the union. `at` is where the caret goes.
export function mergePara(a:PubPara,b:PubPara):{para:PubPara;at:number}|null{
 if(a.image||a.table||b.image||b.table)return null;
 const sa=parseInline(a.text),at=sa.reduce((n,x)=>n+x.text.length,0);
 const union=<T,>(x?:T[],y?:T[])=>[...new Set([...(x||[]),...(y||[])])];
 const pages=union(a.pages,b.pages).sort((p,q)=>(p as number)-(q as number)),chapters=union(a.chapters,b.chapters);
 return{para:{...a,text:serializeInline(concatSpans(sa,parseInline(b.text))),...(pages.length?{pages}:{}),...(chapters.length?{chapters}:{})},at};
}

// Undo history: whole `changes` snapshots, newest last, at most HISTORY of them.
export interface History{past:Changes[];future:Changes[]}
export const emptyHistory=():History=>({past:[],future:[]});
export const pushHistory=(h:History,before:Changes):History=>({past:[...h.past,before].slice(-HISTORY),future:[]});
export function undo(h:History,now:Changes):{history:History;changes:Changes}|null{
 if(!h.past.length)return null;
 return{history:{past:h.past.slice(0,-1),future:[...h.future,now]},changes:h.past[h.past.length-1]};
}
export function redo(h:History,now:Changes):{history:History;changes:Changes}|null{
 if(!h.future.length)return null;
 return{history:{past:[...h.past,now].slice(-HISTORY),future:h.future.slice(0,-1)},changes:h.future[h.future.length-1]};
}

// ---- kept on this device, under inkling-edit:<pubId>, until the owner saves or discards
export const draftKey=(pubId:string)=>'inkling-edit:'+pubId;
export function loadDraft(pubId:string):Draft|null{
 try{const d=JSON.parse(localStorage.getItem(draftKey(pubId))||'null');return d&&typeof d.vk==='string'&&d.changes&&typeof d.changes==='object'&&Object.keys(d.changes).length?d as Draft:null;}catch{return null;}
}
export function storeDraft(pubId:string,draft:Draft|null){
 try{if(draft&&Object.keys(draft.changes).length)localStorage.setItem(draftKey(pubId),JSON.stringify(draft));else localStorage.removeItem(draftKey(pubId));}catch{/* private mode or full: the page still holds the draft */}
}
