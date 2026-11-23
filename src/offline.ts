// Reading and listening without a connection. The service worker (public/sw.js) serves the app and whatever was seen
// lately; a book the reader saves is copied whole into the "inkling-saved" cache: its text, cover, paintings, figures
// and audio. This file holds the list of saved books (in this browser only) and does the copying.
import{useEffect,useState}from'react';
import type{NarrationStatus,PubBook,PubDoc}from'./types';
import{sized,srcSet}from'./img.ts';

const SAVED='inkling-saved',KEY='inkling-offline-v1',EVENT='inkling-offline';
export interface SavedBook{id:string;slug:string;title:string;language:string;at:number;bytes:number;urls:string[];audio:boolean}

export function registerOffline(){
 if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
 window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});
}
export const offlineSupported=()=>typeof caches!=='undefined'&&typeof navigator!=='undefined'&&'serviceWorker' in navigator;

function read():Record<string,SavedBook>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return{};}}
function write(all:Record<string,SavedBook>){try{localStorage.setItem(KEY,JSON.stringify(all));}catch{/* private mode */}window.dispatchEvent(new Event(EVENT));}
export const savedBooks=()=>Object.values(read()).sort((a,b)=>b.at-a.at);
export const isSaved=(id:string)=>!!read()[id];

/** Every address a book needs to open offline: the page, its data, pictures and (when there is any) audio. */
export function bookUrls(pub:PubBook&{doc:PubDoc},language:string,status:NarrationStatus|null,art:string[]=[]):string[]{
 const id=pub.id,lib='/api/library/';
 const urls=[ '/b/'+encodeURIComponent(pub.slug),lib+encodeURIComponent(pub.slug),lib+id,lib+id+'/narration/'+language,
  lib+id+'/related?lang='+encodeURIComponent(language),lib+id+'/reception?lang='+encodeURIComponent(language)];
 const pics=(u:string)=>[sized(u,1280),...(srcSet(u)||'').split(', ').filter(Boolean).map(x=>x.split(' ')[0])];
 if(pub.cover)urls.push(pub.cover,...[320,480,800].map(w=>sized(pub.cover!,w)));
 for(const v of pub.doc.versions){if(v.language!==language)continue;
  const paras=[...(v.overview?.paragraphs||[]),...Object.values(v.chapters).flatMap(c=>c.paragraphs)];
  for(const p of paras)if(p.image)urls.push(...pics(lib+id+'/figure/'+p.image.name));}
 urls.push(...art);
 if(status?.status==='ready')urls.push(...status.tracks.map(t=>t.url+'?v='+pub.updated));
 return [...new Set(urls)];
}

/** Copy a book into the saved cache. onProgress gets (done, total). A failed address is skipped, not fatal, except the book itself. */
export async function saveBook(pub:PubBook&{doc:PubDoc},language:string,status:NarrationStatus|null,art:string[],onProgress?:(done:number,total:number)=>void):Promise<SavedBook>{
 const cache=await caches.open(SAVED),urls=bookUrls(pub,language,status,art);
 let bytes=0,done=0;const kept:string[]=[];
 const one=async(u:string)=>{
  try{const r=await fetch(u,{credentials:'same-origin'});if(r.ok){const b=await r.clone().blob();bytes+=b.size;await cache.put(u,r);kept.push(u);}else if(u.endsWith('/'+pub.id))throw new Error('This book could not be saved.');}
  catch(e){if(u.endsWith('/'+pub.id))throw e;}
  onProgress?.(++done,urls.length);
 };
 // four at a time: audio files are large, and the page stays usable while they copy
 const queue=[...urls];await Promise.all(Array.from({length:4},async()=>{while(queue.length)await one(queue.shift()!);}));
 const entry:SavedBook={id:pub.id,slug:pub.slug,title:pub.titles[language]||pub.title,language,at:Date.now(),bytes,urls:kept,audio:status?.status==='ready'&&!!status.tracks.length};
 write({...read(),[pub.id]:entry});
 return entry;
}
export async function removeBook(id:string){
 const all=read(),entry=all[id];if(!entry)return;
 try{const cache=await caches.open(SAVED);await Promise.all(entry.urls.map(u=>cache.delete(u)));}catch{/* nothing to delete */}
 delete all[id];write(all);
}
export function useSaved():SavedBook[]{
 const[list,setList]=useState(savedBooks);
 useEffect(()=>{const on=()=>setList(savedBooks());window.addEventListener(EVENT,on);window.addEventListener('storage',on);return()=>{window.removeEventListener(EVENT,on);window.removeEventListener('storage',on);};},[]);
 return list;
}
export function useOnline():boolean{
 const[online,setOnline]=useState(()=>typeof navigator==='undefined'||navigator.onLine);
 useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[]);
 return online;
}
export const sizeLabel=(bytes:number)=>bytes>1e6?(bytes/1e6).toFixed(bytes>1e7?0:1)+' MB':Math.max(1,Math.round(bytes/1e3))+' KB';
