import type{Book,BookInfo,Chapter,ImportedVersion,Review,SummaryImage,PubChapter,PubDoc,PubPara,PubVersion,Summary,SummaryParagraph}from'./types';
import type{BookData}from'./bookData';
import{depthLabels,sectionKind}from'./core';

const arabic=/[؀-ۿ]/;
export const guessLanguage=(text:string)=>arabic.test(text)?'fa':'en';
const clean=(title:string)=>title.replace(/\s+/g,' ').trim();
// What a published paragraph may carry: page numbers and figures only when the owner chooses them.
export interface Extras{pages:boolean;figures:Map<string,string>|null}
const noExtras:Extras={pages:false,figures:null};
// Pages point into the original book; the owner decides whether readers see them.
function pagesOf(p:SummaryParagraph,chapter?:Chapter){
 if(!chapter)return[];
 return[...new Set([...p.evidence_ids.map(id=>chapter.blocks.find(b=>b.id===id)?.page),...(p.pages||[])].filter((n):n is number=>!!n))].sort((a,b)=>a-b).slice(0,40);
}
function para(p:SummaryParagraph,chapter:Chapter|undefined,included:Set<string>,extras:Extras):PubPara|null{
 const out:PubPara={text:p.text};if(p.heading)out.heading=p.heading;
 if(p.image){const name=extras.figures?.get(p.image.path);if(!name)return null;out.image={name,alt:p.image.alt};}
 if(p.table)out.table=p.table;if(p.quote)out.quote=true;
 if(extras.pages){const pages=pagesOf(p,chapter);if(pages.length)out.pages=pages;}
 // Overview and guide paragraphs cite chapters, not passages.
 if(!chapter){const refs=p.evidence_ids.filter(id=>included.has(id));if(refs.length)out.chapters=refs.slice(0,40);}
 return out;
}
const paras=(items:SummaryParagraph[],chapter:Chapter|undefined,included:Set<string>,extras:Extras)=>items.map(p=>para(p,chapter,included,extras)).filter((p):p is PubPara=>!!p);
export interface Choice{language:string;type:string;label?:string}
export interface Entry{data:BookData;choice:Choice}
// Which summaries exist, by language, for the settings the owner is working with.
export function availableVersions(data:BookData):string[]{
 const langs=new Set<string>();for(const s of Object.values(data.summaries))langs.add(s.language);if(data.report?.overview)langs.add(data.report.overview.language);for(const v of data.versions)langs.add(v.language);return[...langs];
}
// The data a single imported version contributes, shaped like the book's current data.
export const versionData=(data:BookData,v:ImportedVersion):BookData=>({...data,report:v.report,summaries:v.report.chapters,titles:v.titles,version:v});
// One published book can carry several languages and styles; chapter titles are kept per language.
export function buildDoc(book:Book,entries:Entry[],info:BookInfo|null,title:string,author:string,include:Set<string>,review:Review|null=null,extras:Extras=noExtras):PubDoc{
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
  for(const c of picked){const s:Summary=data.summaries[c.id];version.chapters[c.id]={paragraphs:paras(s.paragraphs,c,ids,extras),...(s.review.length?{review:paras(s.review,c,ids,extras)}:{})};}
  const rep=data.report;
  if(rep?.overview&&rep.language===choice.language)version.overview={paragraphs:paras(rep.overview.paragraphs,undefined,ids,extras),takeaways:paras(rep.overview.takeaways,undefined,ids,extras)};
  if(rep?.guide&&rep.language===choice.language)version.guide={type_label:rep.guide.type_label,sections:rep.guide.sections.map(s=>({kind:s.kind,title:s.title,items:paras(s.items,undefined,ids,extras)}))};
  if(data.version?.bookTitle&&choice.language!==original)titles[choice.language]=clean(data.version.bookTitle);
  return version;
 });
 const{covers:_c,links:_l,google_edition:_g,...safeInfo}=(info||{}) as BookInfo;
 return{title:titles,author:author.trim(),originalLanguage:original,chapters,versions,info:info?{...safeInfo,links:info.links}:null,...(review?{review}:{})};
}
// Covers are published as modest JPEGs; the server accepts up to 1.5 MB.
export async function coverBlob(blob:Blob):Promise<Blob>{
 const bitmap=await createImageBitmap(blob);const scale=Math.min(1,700/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare the cover.')),'image/jpeg',.85));
}
// Every figure the chosen summaries use, with the short file name it will have on the server.
export function collectFigures(entries:Entry[],include:Set<string>):{names:Map<string,string>;files:{name:string;image:SummaryImage}[]}{
 const names=new Map<string,string>(),files:{name:string;image:SummaryImage}[]=[];
 for(const{data}of entries)for(const image of data.version?.images||[]){
  if(names.has(image.path))continue;
  if(!Object.entries(data.summaries).some(([id,s])=>include.has(id)&&s.paragraphs.some(p=>p.image?.path===image.path)))continue;
  const ext=image.type==='image/png'?'png':image.type==='image/webp'?'webp':'jpg';
  const name='f'+(files.length+1)+'.'+ext;names.set(image.path,name);files.push({name,image});
 }
 return{names,files};
}
// Figures go up as PNG or JPEG under the server's 1.5 MB limit, scaled down when they are larger.
export async function figureBlob(image:SummaryImage):Promise<Blob>{
 const blob=new Blob([image.data],{type:image.type});
 if(blob.size<=1_400_000&&/png|jpe?g|webp/.test(image.type))return blob;
 const bitmap=await createImageBitmap(blob);const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare a figure.')),'image/jpeg',.85));
}
