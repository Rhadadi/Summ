import type{Book,BookInfo,ImportedVersion,PubDoc,PubPara,Review,SummaryImage}from'./types.ts';
import type{BookData}from'./bookData.ts';
import{buildVersion}from'./imports.ts';
import{buildDoc,collectFigures,versionData,type Entry}from'./publish.ts';
import{mapChapters}from'./structured-import.ts';
import{sectionKind}from'./core.ts';
import{publishProblems,type ZipSummary}from'./replace-import.ts';

// The new-book wizard in data: a source (a summary ZIP, or a book file with summaries brought back into it), the editor's
// choices about its chapters, and the proposal that AI prepares and the editor polishes. One function turns them into the
// document that is published, so going back a step never loses what was already polished.
export interface Source{book:Book;versions:ImportedVersion[];data:BookData;images:SummaryImage[];cover:SummaryImage|null}
export interface ChapterChoice{id:string;include:boolean;title:string;group:'front'|'main'|'back'}
export interface Proposal{
 title:string;originalTitle:string;author:string;
 info:{year:string;publisher:string;pages:number|null;description:string;categories:string[]};
 /** Overview paragraphs that replace a version's own, by version index (the AI draft when the ZIP had none). */
 overviews:Record<number,PubPara[]>;
 review:Review|null;reviewApproved:boolean;
}
export const emptyData:BookData={summaries:{},loaded:true,titles:{},versions:[]};
export const coverInZip=(images:SummaryImage[])=>images.find(i=>/(^|[/_ -])(cover|front)[^/]*\.(png|jpe?g|webp)$/i.test(i.path))||null;

// A summary ZIP is a book of its own: its chapters come from the summary with the most of them, the others are matched by position.
export function sourceFromZip(found:ZipSummary[],images:SummaryImage[],sourcePath:string,now=Date.now()):Source{
 if(!found.length)throw Error('No chapters were found. Each chapter needs a heading such as “## 1. Title”.');
 const lead=[...found].sort((a,b)=>b.block.chapters.length-a.block.chapters.length)[0];
 const chapters=lead.block.chapters.map((c,i)=>({id:'z'+i,title:c.original||c.title,blocks:[]}));
 const seen=new Set<string>(),versions:ImportedVersion[]=[];
 for(const f of found){
  const id=f.lang+':'+f.type;if(seen.has(id))continue;seen.add(id);
  // the lead summary is the contents itself, chapter for chapter (an unnumbered introduction stays first)
  const mapped=f===lead?lead.block.chapters.map((parsed,i)=>({chapterId:'z'+i,parsed})):mapChapters(f.block.chapters,chapters,'position').mapped;
  versions.push(buildVersion(f.block,mapped,f.lang,f.type,{sourcePath,images}));
 }
 const book:Book={id:'new-'+now.toString(36),title:lead.block.bookTitle||lead.block.chapters[0].title,author:'Author not supplied',format:'SUMMARY',category:'book',chapters,warnings:[],addedAt:now,lastRead:0,chapterIndex:0,completed:[],color:now%4,hash:'summary:'+now.toString(36)};
 return{book,versions,data:emptyData,images,cover:coverInZip(images)};
}
// What the chapter step starts from: every chapter that has a summary, in its summary's own title, with the group guessed.
export function defaultChapters(s:Source):ChapterChoice[]{
 const all=s.book.chapters;
 return all.map((c,i)=>{
  const v=s.versions.find(x=>x.report.chapters[c.id]);
  return{id:c.id,include:!!v,title:(v?.titles[c.id]||c.title).trim(),group:sectionKind(c,i,all)};
 });
}
export const leadLanguage=(s:Source)=>s.versions[0]?.language||'en';
export const entriesOf=(s:Source):Entry[]=>s.versions.map(v=>({data:versionData(s.data,v),choice:{language:v.language,type:v.type,label:v.label}}));
// The text the AI reads to identify the book: the title, the overview and the chapters' original titles.
export function identifyText(s:Source):string{
 const v=s.versions[0],overview=(v?.report.overview?.paragraphs||[]).map(p=>p.text).join('\n').slice(0,5000);
 const originals=s.book.chapters.map(c=>c.title).slice(0,30).join('\n');
 return(overview+'\n\nChapters:\n'+originals).slice(0,8000);
}
// The chapter summaries the overview is drafted from, when the ZIP brought none.
export function overviewSource(s:Source,chapters:ChapterChoice[]):string{
 const v=s.versions[0];if(!v)return'';
 return chapters.filter(c=>c.include&&v.report.chapters[c.id]).map(c=>c.title+'\n'+v.report.chapters[c.id].paragraphs.slice(0,3).map(p=>p.text).join('\n')).join('\n\n').slice(0,24000);
}
export const hasOverview=(s:Source,i=0)=>!!s.versions[i]?.report.overview?.paragraphs.length;

export interface Composed{doc:PubDoc;figures:{name:string;image:SummaryImage}[];problems:string[];chars:Record<string,number>}
export function compose(s:Source,chapters:ChapterChoice[],p:Proposal):Composed{
 const include=new Set(chapters.filter(c=>c.include).map(c=>c.id));
 const entries=entriesOf(s);
 const figures=collectFigures(entries,include);
 const info={title:p.originalTitle||p.title,authors:p.author?[p.author]:[],year:p.info.year,publisher:p.info.publisher,pages:p.info.pages,categories:p.info.categories,description:p.info.description,ratings:[],readers:null,wikipedia:null,covers:[],links:[]} as BookInfo;
 const doc=buildDoc(s.book,entries,info,p.title,p.author,include,p.reviewApproved?p.review:null,{pages:false,figures:figures.names});
 const lang=leadLanguage(s);
 doc.title[lang]=p.title.trim()||doc.title[lang];
 if(p.originalTitle.trim()&&lang!=='en')doc.title.en=p.originalTitle.trim();
 for(const c of doc.chapters){const choice=chapters.find(x=>x.id===c.id);if(!choice)continue;c.group=choice.group;if(choice.title.trim())c.title[lang]=choice.title.trim();}
 // the published order is the order of the chapter step
 doc.chapters.sort((a,b)=>chapters.findIndex(c=>c.id===a.id)-chapters.findIndex(c=>c.id===b.id));
 for(const[i,paragraphs]of Object.entries(p.overviews)){const v=doc.versions[Number(i)];if(v&&paragraphs.some(x=>x.text.trim()))v.overview={paragraphs:paragraphs.filter(x=>x.text.trim()),takeaways:v.overview?.takeaways||[]};}
 const chars:Record<string,number>={};
 for(const v of doc.versions){const n=Object.values(v.chapters).reduce((m,c)=>m+c.paragraphs.reduce((k,x)=>k+(x.image?0:x.text.length),0),0)+(v.overview?.paragraphs.reduce((k,x)=>k+x.text.length,0)||0);chars[v.language]=Math.max(chars[v.language]||0,n);}
 const problems=[...publishProblems(doc),...(!doc.chapters.length?['Choose at least one chapter to publish.']:[]),...(!p.title.trim()?['Add a title.']:[])];
 return{doc,figures:figures.files,problems,chars};
}
