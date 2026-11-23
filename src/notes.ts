// "In your own words": a reader's note per chapter, kept in this browser and, through marks.ts, with the reader's account.
// The notebook page lists them all.
import{useEffect,useState}from'react';
import{getMark,noteId,putMark,receiveNotes,removeMark,type Mark}from'./marks';
export interface Note{bookId:string;slug:string;bookTitle:string;chapterId:string;chapterTitle:string;text:string;at:number;lang:string}
const KEY='inkling-notes-v1',EVENT='inkling-notes';
const read=():Record<string,Note>=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return{};}};
const key=(bookId:string,chapterId:string)=>bookId+'|'+chapterId;
export const getNote=(bookId:string,chapterId:string)=>read()[key(bookId,chapterId)]?.text||'';
function store(all:Record<string,Note>){try{localStorage.setItem(KEY,JSON.stringify(all));}catch{/* private mode */}window.dispatchEvent(new Event(EVENT));}
export function putNote(n:Omit<Note,'at'>){
 const all=read(),k=key(n.bookId,n.chapterId),id=noteId(n.bookId,n.chapterId);
 if(n.text.trim()){all[k]={...n,at:Date.now()};putMark({id,kind:'note',book:n.bookId,slug:n.slug,bookTitle:n.bookTitle,chapter:n.chapterId,chapterTitle:n.chapterTitle,lang:n.lang,note:n.text,quote:'',prefix:'',suffix:'',color:'yellow',source:'',model:'',created:all[k].at});}
 else{delete all[k];removeMark(id);}
 store(all);
}
// a note written or deleted on another device
receiveNotes((m:Mark)=>{
 const all=read(),k=key(m.book||'',m.chapter||''),mine=Object.entries(all).find(([,n])=>noteId(n.bookId,n.chapterId)===m.id);
 if(m.deleted){if(mine&&mine[1].at<=m.updated){delete all[mine[0]];store(all);}return;}
 if(mine&&mine[1].at>=m.updated)return;
 all[k]={bookId:m.book,slug:m.slug,bookTitle:m.bookTitle,chapterId:m.chapter,chapterTitle:m.chapterTitle,text:m.note,at:m.updated,lang:m.lang};store(all);
});
export const allNotes=()=>Object.values(read()).sort((a,b)=>b.at-a.at);
export function useNotes():Note[]{
 const[list,setList]=useState(allNotes);
 useEffect(()=>{const on=()=>setList(allNotes());window.addEventListener(EVENT,on);window.addEventListener('storage',on);return()=>{window.removeEventListener(EVENT,on);window.removeEventListener('storage',on);};},[]);
 return list;
}
// notes written before they were kept with the account: queue them once
if(typeof window!=='undefined')for(const n of Object.values(read()))if(!getMark(noteId(n.bookId,n.chapterId)))
 putMark({id:noteId(n.bookId,n.chapterId),kind:'note',book:n.bookId,slug:n.slug,bookTitle:n.bookTitle,chapter:n.chapterId,chapterTitle:n.chapterTitle,lang:n.lang,note:n.text,quote:'',prefix:'',suffix:'',color:'yellow',source:'',model:'',created:n.at});
