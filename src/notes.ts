// "In your own words": a reader's note per chapter, kept in this browser only. The notebook page lists them all.
import{useEffect,useState}from'react';
export interface Note{bookId:string;slug:string;bookTitle:string;chapterId:string;chapterTitle:string;text:string;at:number;lang:string}
const KEY='inkling-notes-v1',EVENT='inkling-notes';
const read=():Record<string,Note>=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return{};}};
const key=(bookId:string,chapterId:string)=>bookId+'|'+chapterId;
export const getNote=(bookId:string,chapterId:string)=>read()[key(bookId,chapterId)]?.text||'';
export function putNote(n:Omit<Note,'at'>){
 const all=read(),k=key(n.bookId,n.chapterId);
 if(n.text.trim())all[k]={...n,at:Date.now()};else delete all[k];
 try{localStorage.setItem(KEY,JSON.stringify(all));}catch{/* private mode */}
 window.dispatchEvent(new Event(EVENT));
}
export const allNotes=()=>Object.values(read()).sort((a,b)=>b.at-a.at);
export function useNotes():Note[]{
 const[list,setList]=useState(allNotes);
 useEffect(()=>{const on=()=>setList(allNotes());window.addEventListener(EVENT,on);window.addEventListener('storage',on);return()=>{window.removeEventListener(EVENT,on);window.removeEventListener('storage',on);};},[]);
 return list;
}
