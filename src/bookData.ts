import{useEffect,useState}from'react';
import type{Book,BookReport,Settings,Summary}from'./types';
import{store}from'./storage';
import{summaryKey}from'./api';
import{sectionKind}from'./core';

// Everything summarized for a book: the whole-book report and each chapter's summary at the current settings.
export interface BookData{report?:BookReport;summaries:Record<string,Summary>;loaded:boolean}
export async function loadBookData(book:Book,settings:Settings,model:string):Promise<BookData>{
 const key=await store.latestReport(book.id).catch(()=>undefined);
 const report=key?await store.report(key).catch(()=>undefined):undefined;
 const summaries:Record<string,Summary>={};
 await Promise.all(book.chapters.map(async c=>{const own=await store.summary(summaryKey(book.id,book.hash,c,settings,model)).catch(()=>undefined);const s=own||report?.chapters[c.id];if(s)summaries[c.id]=s;}));
 return{report,summaries,loaded:true};
}
export function useBookData(book:Book|undefined,settings:Settings,model:string,version:number):BookData{
 const[data,setData]=useState<BookData>({summaries:{},loaded:false});
 useEffect(()=>{
  if(!book){setData({summaries:{},loaded:false});return;}
  let live=true;loadBookData(book,settings,model).then(d=>{if(live)setData(d);}).catch(()=>{if(live)setData({summaries:{},loaded:true});});
  return()=>{live=false;};
 },[book?.id,book?.hash,book?.chapters,settings.depth,settings.purpose,settings.language,settings.review,model,version]);
 return data;
}
export const mainChapters=(book:Book)=>book.chapters.filter((c,i)=>sectionKind(c,i,book.chapters)==='main');
export const strip=(title:string)=>title.replace(/^\d+[.\s]+/,'');
// Narration plays the overview first, then every summarized chapter in book order.
export function narrationItems(book:Book,data:BookData){
 const say=(p:{heading?:string;text:string})=>(p.heading?p.heading+'. ':'')+p.text;
 return[
  ...(data.report?.overview?[{title:'Overview',text:data.report.overview.paragraphs.map(say).join('\n\n')}]:[]),
  ...book.chapters.filter(c=>data.summaries[c.id]).map(c=>({title:strip(c.title),chapterId:c.id,text:strip(c.title)+'.\n\n'+data.summaries[c.id].paragraphs.map(say).join('\n\n')})),
 ];
}
