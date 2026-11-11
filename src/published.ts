import type{Book,BookReport,Chapter,PubBook,PubDoc,PubPara,PubVersion,Summary,SummaryParagraph}from'./types';
import type{BookData}from'./bookData';

export const versionKey=(v:{language:string;type:string})=>v.language+'|'+v.type;
const pageId=(n:number)=>'pg-'+n;
export function pickVersion(doc:PubDoc,preferred?:string,language?:string){
 return doc.versions.find(v=>versionKey(v)===preferred)||doc.versions.find(v=>v.language===language)||doc.versions[0];
}
// Turns a published document into the Book and BookData shapes the reader components already use.
// Chapters hold no text: only "page" markers so each paragraph can show where in the book it comes from.
export function adaptPublished(pub:PubBook,doc:PubDoc,version:PubVersion,position:{index:number;completed:string[];lastRead:number}):{book:Book;data:BookData}{
 const lang=version.language;
 const titleOf=(t:Record<string,string>)=>t[lang]||t[doc.originalLanguage]||Object.values(t)[0]||'';
 const toPara=(p:PubPara,chapter?:Chapter):SummaryParagraph=>({heading:p.heading,text:p.text,evidence_ids:chapter?(p.pages||[]).map(pageId):(p.chapters||[])});
 const chapters:Chapter[]=doc.chapters.map(c=>{
  const body=version.chapters[c.id];const pages=new Set<number>();
  for(const p of[...(body?.paragraphs||[]),...(body?.review||[])])for(const n of p.pages||[])pages.add(n);
  return{id:c.id,title:titleOf(c.title),blocks:[...pages].sort((a,b)=>a-b).map(n=>({id:pageId(n),text:'',location:'p. '+n,page:n}))};
 });
 const summaries:Record<string,Summary>={};
 for(const c of chapters){
  const body=version.chapters[c.id];if(!body)continue;
  summaries[c.id]={paragraphs:body.paragraphs.map(p=>toPara(p,c)),review:(body.review||[]).map(p=>toPara(p,c)),processed_blocks:0,total_blocks:0,language:lang,mode:'ai',checked:true,model:version.model};
 }
 const report:BookReport={model:version.model||'',language:lang,createdAt:version.createdAt||pub.updated*1000,updatedAt:pub.updated*1000,parts:{},chapters:summaries,
  overview:version.overview?{paragraphs:version.overview.paragraphs.map(p=>toPara(p)),takeaways:(version.overview.takeaways||[]).map(p=>toPara(p)),checked:true,language:lang,model:version.model||''}:undefined,
  guide:version.guide?{type:'published',type_label:version.guide.type_label,sections:version.guide.sections.map(s=>({kind:s.kind,title:s.title,items:s.items.map(p=>toPara(p))})),model:version.model||''}:undefined};
 const book:Book={id:'pub:'+pub.id,title:doc.title[lang]||doc.title[doc.originalLanguage]||pub.title,author:doc.author||'Author not supplied',format:'SUMMARY',category:'book',chapters,warnings:[],addedAt:pub.updated*1000,lastRead:position.lastRead,chapterIndex:Math.min(position.index,Math.max(0,chapters.length-1)),completed:position.completed,color:0,hash:'published:'+pub.updated};
 return{book,data:{report,summaries,loaded:true}};
}
// Reading position for published books stays in this browser only.
export const readPosition=(id:string)=>{try{const v=JSON.parse(localStorage.getItem('summ-pub:'+id)||'{}');return{index:Number(v.index)||0,completed:Array.isArray(v.completed)?v.completed.filter((x:unknown)=>typeof x==='string'):[],lastRead:Number(v.lastRead)||0};}catch{return{index:0,completed:[] as string[],lastRead:0};}};
export const savePosition=(id:string,p:{index:number;completed:string[];lastRead:number})=>{try{localStorage.setItem('summ-pub:'+id,JSON.stringify(p));}catch{/* private mode */}};
