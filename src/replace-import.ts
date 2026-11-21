import type{Chapter,PubChapter,PubDoc,PubPara,PubVersion,SummaryImage}from'./types.ts';
import type{Book}from'./types.ts';
import type{BookData}from'./bookData.ts';
import{buildVersion,versionLabel}from'./imports.ts';
import{buildDoc,collectFigures,versionData}from'./publish.ts';
import{mapChapters,parseBlock,splitBlocks,type ParsedBlock}from'./structured-import.ts';
import{readSummaryFiles,type SummaryDocument}from'./summary-import.ts';

// Putting a new summary ZIP into a book that is already published: the person ticks what is replaced (the overview, the key
// ideas, the study guide, each chapter) and which version it goes into; nothing is saved until they save the draft.
export interface ZipSummary{block:ParsedBlock;type:string;lang:string;label:string}
export interface ZipContents{summaries:ZipSummary[];images:SummaryImage[];sourcePath:string}

const typeIds=['comprehensive','detailed','concise','brief','standard','executive','study','quick'];
export function parseSummaries(documents:SummaryDocument[]):ZipSummary[]{
 const out:ZipSummary[]=[];
 for(const doc of documents){
  const byName=typeIds.find(t=>doc.name.toLowerCase().includes(t));
  for(const part of splitBlocks(doc.markdown)){
   const block=parseBlock(part.text,part.type||byName||null,part.language||'en');
   if(!block.chapters.length)continue;
   const type=part.type||byName||'detailed',lang=part.language||block.language;
   out.push({block,type,lang,label:versionLabel(type)});
  }
 }
 return out;
}
export async function readZip(file:File):Promise<ZipContents>{
 const r=await readSummaryFiles(file);
 const summaries=parseSummaries(r.documents);
 if(!summaries.length)throw Error('No chapters were found. Each chapter needs a heading such as “## 1. Title”.');
 return{summaries,images:r.images,sourcePath:r.documents[0].name};
}

export interface ReplacePlan{
 /** The index of the version that is changed, or "new" to add the summary as another version. */
 target:number|'new';
 overview:boolean;takeaways:boolean;guide:boolean;titles:boolean;
 /** For each chapter in the ZIP (by position), the id of the published chapter it replaces; "" leaves it out. */
 chapters:string[];
}
const titleFor=(names:Record<string,string>,lang:string)=>names[lang]||names.en||Object.values(names)[0]||'';
const asChapters=(doc:PubDoc,lang:string):Chapter[]=>doc.chapters.map(c=>({id:c.id,title:c.title.en||titleFor(c.title,lang),blocks:[]}));
// Which published chapter each chapter of the ZIP replaces: by the original title when it matches, otherwise by position.
export function matchChapters(doc:PubDoc,s:ZipSummary):string[]{
 const chapters=asChapters(doc,s.lang),main=chapters.filter((_,i)=>doc.chapters[i].group==='main');
 const {mapped}=mapChapters(s.block.chapters,chapters,'smart',main);
 return s.block.chapters.map(p=>mapped.find(m=>m.parsed===p)?.chapterId||'');
}
export function defaultPlan(doc:PubDoc,s:ZipSummary):ReplacePlan{
 const same=doc.versions.findIndex(v=>v.language===s.lang&&v.type===s.type),sameLang=doc.versions.findIndex(v=>v.language===s.lang);
 return{target:same>=0?same:sameLang>=0?sameLang:'new',overview:s.block.overview.length>0,takeaways:s.block.takeaways.length>0,guide:s.block.sections.length>0,titles:false,chapters:matchChapters(doc,s)};
}

export interface Replaced{doc:PubDoc;versionIndex:number;figures:{name:string;image:SummaryImage}[];lines:string[]}
const noData:BookData={summaries:{},loaded:true,titles:{},versions:[]};
// The published form of the ZIP's summary, with its chapters keyed to the published chapters it replaces.
export function applyReplacement(doc:PubDoc,s:ZipSummary,images:SummaryImage[],sourcePath:string,plan:ReplacePlan,stamp=Date.now().toString(36)):Replaced{
 const chapters=asChapters(doc,s.lang);
 const mapped=s.block.chapters.flatMap((parsed,i)=>plan.chapters[i]?[{chapterId:plan.chapters[i],parsed}]:[]);
 const iv=buildVersion(s.block,mapped,s.lang,s.type,{sourcePath,images});
 const book={id:'replace',title:'',author:'',format:'SUMMARY',category:'book',chapters,warnings:[],addedAt:0,lastRead:0,chapterIndex:0,completed:[],color:0,hash:''} as Book;
 const include=new Set(mapped.map(m=>m.chapterId));
 const entry={data:versionData(noData,iv),choice:{language:s.lang,type:s.type,label:s.label}};
 const figures=collectFigures([entry],include);
 const built=buildDoc(book,[entry],null,doc.title[s.lang]||titleFor(doc.title,s.lang),doc.author,include,null,{pages:false,figures:figures.names});
 const nv=built.versions[0];
 // The new figures get names of their own, so none of the book's existing figures is overwritten.
 const rename=new Map(figures.files.map(f=>[f.name,stamp+f.name]));
 const renamed=(list:PubPara[]|undefined)=>(list||[]).map(p=>p.image&&rename.has(p.image.name)?{...p,image:{...p.image,name:rename.get(p.image.name)!}}:p);
 const out=structuredClone(doc);
 let v:PubVersion;
 if(plan.target==='new'){
  let type=s.type,n=2;while(out.versions.some(x=>x.language===s.lang&&x.type===type))type=s.type+'-'+n++;
  v={language:s.lang,type,label:s.label,model:'imported',createdAt:Date.now(),chapters:{}};out.versions.push(v);
  if(!out.title[s.lang]&&s.block.bookTitle)out.title[s.lang]=s.block.bookTitle;
 }else v=out.versions[plan.target];
 const lines:string[]=[],used=new Set<string>();
 const note=(list:PubPara[]|undefined)=>{for(const p of list||[])if(p.image)used.add(p.image.name);};
 if(plan.overview&&nv.overview?.paragraphs.length){const paragraphs=renamed(nv.overview.paragraphs);note(paragraphs);v.overview={paragraphs,takeaways:v.overview?.takeaways||[]};lines.push('Overview: '+paragraphs.length+' paragraphs');}
 if(plan.takeaways&&nv.overview?.takeaways?.length){const takeaways=renamed(nv.overview.takeaways);v.overview={paragraphs:v.overview?.paragraphs||[],takeaways};lines.push('Key ideas: '+takeaways.length);}
 if(plan.guide&&nv.guide?.sections.length){v.guide={...nv.guide,sections:nv.guide.sections.map(x=>({...x,items:renamed(x.items)}))};v.guide.sections.forEach(x=>note(x.items));lines.push('Study guide: '+v.guide.sections.length+' sections');}
 for(const m of mapped){
  const next=nv.chapters[m.chapterId];if(!next)continue;
  const old=v.chapters[m.chapterId],paragraphs=renamed(next.paragraphs);note(paragraphs);
  v.chapters[m.chapterId]={paragraphs,...(next.review?.length?{review:renamed(next.review)}:old?.review?.length?{review:old.review}:{})};
  const at=out.chapters.find(c=>c.id===m.chapterId);
  if(plan.titles&&at&&m.parsed.title)at.title={...at.title,[s.lang]:m.parsed.title};
  lines.push((at?titleFor(at.title,s.lang):m.chapterId)+': '+paragraphs.length+' paragraphs');
 }
 const keep=figures.files.map(f=>({name:rename.get(f.name)!,image:f.image})).filter(f=>used.has(f.name));
 return{doc:out,versionIndex:plan.target==='new'?out.versions.length-1:plan.target,figures:keep,lines};
}

// What the server accepts, in the terms a person can act on: checked before publishing, so a refusal never reads "422".
export const LIMITS={chapterParagraphs:400,chapterReview:200,overview:200,takeaways:30,guideSections:20,guideItems:200,text:12000};
export function publishProblems(doc:PubDoc):string[]{
 const out:string[]=[];
 const chapterName=(id:string,lang:string)=>{const i=doc.chapters.findIndex(c=>c.id===id);return i<0?id:(i+1)+'. '+titleFor((doc.chapters[i] as PubChapter).title,lang);};
 const paras=(where:string,list:PubPara[]|undefined,max:number)=>{
  if(!list)return;
  if(list.length>max)out.push(where+' has '+list.length+' paragraphs; at most '+max+' are allowed. Merge some of them.');
  const long=list.findIndex(p=>p.text.length>LIMITS.text);
  if(long>=0)out.push(where+', paragraph '+(long+1)+' is longer than '+LIMITS.text+' characters. Split it.');
 };
 for(const v of doc.versions){
  const tag=v.label+' · '+v.language+': ';
  paras(tag+'the overview',v.overview?.paragraphs,LIMITS.overview);paras(tag+'the key ideas',v.overview?.takeaways,LIMITS.takeaways);
  if((v.guide?.sections.length||0)>LIMITS.guideSections)out.push(tag+'the study guide has '+v.guide!.sections.length+' sections; at most '+LIMITS.guideSections+' are allowed.');
  for(const x of v.guide?.sections||[])paras(tag+'the guide section “'+x.title+'”',x.items,LIMITS.guideItems);
  for(const[id,c]of Object.entries(v.chapters)){paras(tag+'chapter '+chapterName(id,v.language),c.paragraphs,LIMITS.chapterParagraphs);paras(tag+'the review of chapter '+chapterName(id,v.language),c.review,LIMITS.chapterReview);}
 }
 return out;
}
