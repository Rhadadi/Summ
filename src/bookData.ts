import{useEffect,useState}from'react';
import type{Book,BookReport,ImportedVersion,Settings,Summary}from'./types';
import{store}from'./storage';
import{summaryKey}from'./api';
import{sectionKind}from'./core';
import{buildVersion,pickVersion}from'./imports';
import{mapChapters,parseBlock,splitBlocks}from'./structured-import';

// Everything summarized for a book: the whole-book report and each chapter's summary at the current settings.
// "titles" holds chapter titles in the summary's language, "versions" every summary imported from elsewhere.
export interface BookData{report?:BookReport;summaries:Record<string,Summary>;loaded:boolean;titles:Record<string,string>;versions:ImportedVersion[];version?:ImportedVersion}
export const emptyData:BookData={summaries:{},loaded:false,titles:{},versions:[]};
// Summaries imported before chapters were split apart are converted once, so they join the normal chapter list.
async function importedVersions(book:Book):Promise<ImportedVersion[]>{
 const saved=await store.imports(book.id).catch(()=>[]);
 if(saved.length)return saved;
 const legacy=await store.importedSummaries(book.id).catch(()=>null);
 if(!legacy)return[];
 const made:ImportedVersion[]=[];
 for(const[language,summary]of Object.entries(legacy.versions)){
  for(const part of splitBlocks(summary.markdown)){
   const block=parseBlock(part.text,part.type,language);
   const byPosition=mapChapters(block.chapters,book.chapters,'position'),byTitle=mapChapters(block.chapters,book.chapters,'title');
   const mapped=(byTitle.mapped.length>byPosition.mapped.length?byTitle:byPosition).mapped;
   if(mapped.length)made.push(buildVersion(block,mapped,block.language,part.type||'detailed'));
  }
 }
 return made.length?store.saveImports(book.id,made).catch(()=>made):[];
}
export async function loadBookData(book:Book,settings:Settings,model:string,pick?:string):Promise<BookData>{
 const key=await store.latestReport(book.id).catch(()=>undefined);
 const report=key?await store.report(key).catch(()=>undefined):undefined;
 const summaries:Record<string,Summary>={};
 await Promise.all(book.chapters.map(async c=>{const own=await store.summary(summaryKey(book.id,book.hash,c,settings,model)).catch(()=>undefined);const s=own||report?.chapters[c.id];if(s)summaries[c.id]=s;}));
 const versions=await importedVersions(book);
 const version=pickVersion(versions,settings.language,pick);
 // An import wins in its own language; with nothing generated yet it is shown whatever the language setting says.
 if(version&&(version.language===settings.language||!Object.keys(summaries).length)){
  return{report:version.report,summaries:{...summaries,...version.report.chapters},loaded:true,titles:version.titles,versions,version};
 }
 return{report,summaries,loaded:true,titles:{},versions};
}
export function useBookData(book:Book|undefined,settings:Settings,model:string,version:number,pick?:string):BookData{
 const[data,setData]=useState<BookData>(emptyData);
 useEffect(()=>{
  if(!book){setData(emptyData);return;}
  let live=true;loadBookData(book,settings,model,pick).then(d=>{if(live)setData(d);}).catch(()=>{if(live)setData({...emptyData,loaded:true});});
  return()=>{live=false;};
 },[book?.id,book?.hash,book?.chapters,settings.depth,settings.purpose,settings.language,settings.review,model,version,pick]);
 return data;
}
export const mainChapters=(book:Book)=>book.chapters.filter((c,i)=>sectionKind(c,i,book.chapters)==='main');
export const strip=(title:string)=>title.replace(/^\d+[.\s]+/,'');
// The chapter's title in the language of the summary being read, falling back to the book's own.
export const chapterTitle=(data:BookData,c:{id:string;title:string})=>data.titles[c.id]||strip(c.title);
// Narration plays the overview first, then every summarized chapter in book order.
export function narrationItems(book:Book,data:BookData){
 const say=(p:{heading?:string;text:string})=>(p.heading?p.heading+'. ':'')+p.text;
 return[
  ...(data.report?.overview?[{title:'Overview',text:data.report.overview.paragraphs.map(say).join('\n\n')}]:[]),
  ...book.chapters.filter(c=>data.summaries[c.id]).map(c=>({title:chapterTitle(data,c),chapterId:c.id,text:chapterTitle(data,c)+'.\n\n'+data.summaries[c.id].paragraphs.filter(p=>!p.image).map(say).join('\n\n')})),
 ];
}
