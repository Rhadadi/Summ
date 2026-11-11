import type{Book,BookInfo,Chapter,ImportedVersion,PubChapter,PubDoc,PubPara,PubVersion,Summary,SummaryParagraph}from'./types';
import type{BookData}from'./bookData';
import{depthLabels,sectionKind}from'./core';

const arabic=/[؀-ۿ]/;
export const guessLanguage=(text:string)=>arabic.test(text)?'fa':'en';
const clean=(title:string)=>title.replace(/\s+/g,' ').trim();
// Pages are the only trace of the original that a published summary keeps.
function pagesOf(p:SummaryParagraph,chapter?:Chapter){
 if(!chapter)return[];
 return[...new Set([...p.evidence_ids.map(id=>chapter.blocks.find(b=>b.id===id)?.page),...(p.pages||[])].filter((n):n is number=>!!n))].sort((a,b)=>a-b).slice(0,40);
}
function para(p:SummaryParagraph,chapter:Chapter|undefined,included:Set<string>):PubPara{
 const out:PubPara={text:p.text};if(p.heading)out.heading=p.heading;
 const pages=pagesOf(p,chapter);if(pages.length)out.pages=pages;
 // Overview and guide paragraphs cite chapters, not passages.
 if(!chapter){const refs=p.evidence_ids.filter(id=>included.has(id));if(refs.length)out.chapters=refs.slice(0,40);}
 return out;
}
export interface Choice{language:string;type:string;label?:string}
export interface Entry{data:BookData;choice:Choice}
// Which summaries exist, by language, for the settings the owner is working with.
export function availableVersions(data:BookData):string[]{
 const langs=new Set<string>();for(const s of Object.values(data.summaries))langs.add(s.language);if(data.report?.overview)langs.add(data.report.overview.language);for(const v of data.versions)langs.add(v.language);return[...langs];
}
// The data a single imported version contributes, shaped like the book's current data.
export const versionData=(data:BookData,v:ImportedVersion):BookData=>({...data,report:v.report,summaries:v.report.chapters,titles:v.titles,version:v});
// One published book can carry several languages and styles; chapter titles are kept per language.
export function buildDoc(book:Book,entries:Entry[],info:BookInfo|null,title:string,author:string,include:Set<string>):PubDoc{
 const kinds=book.chapters.map((c,i)=>sectionKind(c,i,book.chapters));
 const original=guessLanguage(book.title);
 const forEntry=({data,choice}:Entry)=>book.chapters.filter(c=>include.has(c.id)&&data.summaries[c.id]&&data.summaries[c.id].language===choice.language);
 const ids=new Set(entries.flatMap(e=>forEntry(e).map(c=>c.id)));
 const chapters:PubChapter[]=book.chapters.filter(c=>ids.has(c.id)).map(c=>{
  const names:Record<string,string>={[original]:clean(c.title)};
  for(const e of entries)if(e.data.titles[c.id]&&e.data.summaries[c.id]?.language===e.choice.language)names[e.choice.language]=clean(e.data.titles[c.id]);
  return{id:c.id,title:names,group:kinds[book.chapters.indexOf(c)]};
 });
 const titles:Record<string,string>={[original]:clean(title||book.title)};
 const versions:PubVersion[]=entries.map(e=>{
  const{data,choice}=e,picked=forEntry(e);
  const version:PubVersion={language:choice.language,type:choice.type,label:choice.label||depthLabels[choice.type as keyof typeof depthLabels]||choice.type,model:data.report?.model||Object.values(data.summaries)[0]?.model||'',createdAt:Date.now(),chapters:{}};
  for(const c of picked){const s:Summary=data.summaries[c.id];version.chapters[c.id]={paragraphs:s.paragraphs.filter(p=>!p.image).map(p=>para(p,c,ids)),...(s.review.length?{review:s.review.map(p=>para(p,c,ids))}:{})};}
  const rep=data.report;
  if(rep?.overview&&rep.language===choice.language)version.overview={paragraphs:rep.overview.paragraphs.map(p=>para(p,undefined,ids)),takeaways:rep.overview.takeaways.map(p=>para(p,undefined,ids))};
  if(rep?.guide&&rep.language===choice.language)version.guide={type_label:rep.guide.type_label,sections:rep.guide.sections.map(s=>({kind:s.kind,title:s.title,items:s.items.map(p=>para(p,undefined,ids))}))};
  if(data.version?.bookTitle&&choice.language!==original)titles[choice.language]=clean(data.version.bookTitle);
  return version;
 });
 const{covers:_c,links:_l,google_edition:_g,...safeInfo}=(info||{}) as BookInfo;
 return{title:titles,author:author.trim(),originalLanguage:original,chapters,versions,info:info?{...safeInfo,links:info.links}:null};
}
// Covers are published as modest JPEGs; the server accepts up to 1.5 MB.
export async function coverBlob(blob:Blob):Promise<Blob>{
 const bitmap=await createImageBitmap(blob);const scale=Math.min(1,700/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare the cover.')),'image/jpeg',.85));
}
