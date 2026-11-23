import type{Book,BookInfo,ImportedVersion,PubDoc,PubPara,Review,SummaryImage}from'./types.ts';
import type{BookData}from'./bookData.ts';
import{buildVersion}from'./imports.ts';
import{buildDoc,collectFigures,versionData,type Entry}from'./publish.ts';
import{latinDigits,type ParsedChapter}from'./structured-import.ts';
import{sectionKind}from'./core.ts';
import{publishProblems,type ZipSummary}from'./replace-import.ts';
import{persianPublicFieldProblems}from'./persian-import.ts';

// The new-book wizard in data: a source (a summary ZIP, or a book file with summaries brought back into it), the editor's
// choices about its chapters, and the proposal that AI prepares and the editor polishes. One function turns them into the
// document that is published, so going back a step never loses what was already polished.
export interface Source{book:Book;versions:ImportedVersion[];data:BookData;images:SummaryImage[];cover:SummaryImage|null;importProblems?:string[]}
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

// Match another version to the lead summary by printed/original title first, then by an unambiguous chapter number.
// An uncertain match is left empty for the editor to fix rather than silently putting text under the wrong chapter.
const zipTitle=(text:string)=>latinDigits(text).normalize('NFKC').toLocaleLowerCase().replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u0670\u200c\u200d]/g,' ').replace(/^(?:(?:chapter|section|part|فصل|بخش)\s*)?\d+\s*[.،:–—)-]*\s*/iu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const titleKeys=(c:ParsedChapter)=>[c.original,c.title].filter((x):x is string=>!!x).map(zipTitle).filter(Boolean);
function alignZipChapters(reference:ParsedChapter[],incoming:ParsedChapter[]){
 const mapped:{chapterId:string;parsed:ParsedChapter}[]=[],taken=new Set<number>(),left:ParsedChapter[]=[];
 const ambiguous:string[]=[];
 for(const p of incoming){
  const keys=titleKeys(p),hits=reference.map((c,i)=>({i,match:!taken.has(i)&&titleKeys(c).some(k=>keys.includes(k))})).filter(x=>x.match);
  if(hits.length===1){taken.add(hits[0].i);mapped.push({chapterId:'z'+hits[0].i,parsed:p});}
  else{left.push(p);if(hits.length>1)ambiguous.push(p.title);}
 }
 for(const p of left){
  const hits=p.n===null?reference.map((c,i)=>({c,i})).filter(x=>x.c.n===null&&!taken.has(x.i)):
   reference.map((c,i)=>({c,i})).filter(x=>x.c.n===p.n&&!taken.has(x.i));
  if(hits.length===1){taken.add(hits[0].i);mapped.push({chapterId:'z'+hits[0].i,parsed:p});}
  else ambiguous.push(p.title);
 }
 return{mapped,missing:reference.filter((_,i)=>!taken.has(i)),ambiguous:[...new Set(ambiguous)]};
}

// A summary ZIP is a book of its own. A Persian block is the public version when a ZIP contains both languages.
export function sourceFromZip(found:ZipSummary[],images:SummaryImage[],sourcePath:string,now=Date.now()):Source{
 if(!found.length)throw Error('No chapters were found. Each chapter needs a heading such as “## 1. Title”.');
 const persian=found.filter(f=>f.lang==='fa'),selected=persian.length?persian:found;
 const lead=[...selected].sort((a,b)=>b.block.chapters.length-a.block.chapters.length)[0];
 const chapters=lead.block.chapters.map((c,i)=>({id:'z'+i,title:c.original||c.title,blocks:[]}));
 const seen=new Set<string>(),versions:ImportedVersion[]=[],warnings:string[]=[],importProblems:string[]=[];
 if(persian.length&&persian.length<found.length)warnings.push('English summary versions in this ZIP were not added. Only the Persian translation will be published.');
 if(persian.length){
  const longestOther=Math.max(0,...found.filter(f=>f.lang!=='fa').map(f=>f.block.chapters.length));
  const missing=longestOther-lead.block.chapters.length;
  if(missing>=2)importProblems.push('The Persian summary has '+lead.block.chapters.length+' chapter'+(lead.block.chapters.length===1?'':'s')+', but another version in the ZIP has '+longestOther+'. Add the missing Persian chapters and import the corrected ZIP.');
  else if(missing===1)warnings.push('Another version in the ZIP has one more chapter than the Persian summary. Check whether a Persian chapter is missing.');
 }
 if(lead.block.chapters.length===1)warnings.push('Only one chapter was found in this summary. Check its headings against the book before publishing.');
 for(const f of selected){
  const id=f.lang+':'+f.type;if(seen.has(id)){warnings.push('A second '+f.lang+' '+f.type+' summary was skipped. Check that the intended version was imported.');continue;}seen.add(id);
  // The lead summary defines the contents. Other versions are matched by title, then by chapter number.
  const alignment=f===lead?null:alignZipChapters(lead.block.chapters,f.block.chapters);
  const mapped=alignment?.mapped||lead.block.chapters.map((parsed,i)=>({chapterId:'z'+i,parsed}));
  if(alignment?.missing.length)warnings.push(f.label+' · '+f.lang+' could not match '+alignment.missing.length+' of '+lead.block.chapters.length+' chapters. Check the chapter titles and summaries.');
  if(alignment?.ambiguous.length)warnings.push(f.label+' · '+f.lang+' has unmatched chapter titles: '+alignment.ambiguous.slice(0,3).join('، ')+(alignment.ambiguous.length>3?'…':''));
  versions.push(buildVersion(f.block,mapped,f.lang,f.type,{sourcePath:f.sourcePath||sourcePath,images}));
 }
 const book:Book={id:'new-'+now.toString(36),title:lead.block.bookTitle||lead.block.chapters[0].title,author:'Author not supplied',format:'SUMMARY',category:'book',chapters,warnings,addedAt:now,lastRead:0,chapterIndex:0,completed:[],color:now%4,hash:'summary:'+now.toString(36)};
 return{book,versions,data:emptyData,images,cover:coverInZip(images),importProblems};
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
const readableLanguage=(code:string)=>({fa:'Persian',en:'English',de:'German',es:'Spanish',fr:'French',tr:'Turkish',zh:'Chinese',ar:'Arabic'} as Record<string,string>)[code]||code;
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

export interface Composed{doc:PubDoc;figures:{name:string;image:SummaryImage}[];problems:string[];warnings:string[];chars:Record<string,number>}
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
 const problems=[...publishProblems(doc),...(!doc.chapters.length?['Choose at least one chapter to publish.']:[]),...(!p.title.trim()?['Add a title.']:[]),...(s.importProblems||[])];
 if(!doc.versions.some(v=>v.overview?.paragraphs.some(paragraph=>paragraph.text.trim()))&&!p.info.description.trim())problems.push('Add an overview or book description for the introduction page.');
 const warnings=[...s.book.warnings];
 for(const v of doc.versions){
  const missing=doc.chapters.filter(c=>!v.chapters[c.id]?.paragraphs.some(y=>y.text.trim()&&!y.image));
  if(missing.length)problems.push(v.label+' · '+readableLanguage(v.language)+' is missing a written summary for '+missing.length+' chapter'+(missing.length===1?'':'s')+': '+missing.slice(0,3).map(c=>c.title[v.language]||Object.values(c.title)[0]).join('، ')+(missing.length>3?'…':'')+'.');
  const thin=doc.chapters.filter(c=>{
   const paragraphs=v.chapters[c.id]?.paragraphs||[];
   return paragraphs.reduce((length,paragraph)=>length+(paragraph.image?0:paragraph.text.trim().length),0)<180;
  });
  if(thin.length)warnings.push(v.label+' · '+readableLanguage(v.language)+' has '+thin.length+' brief chapter '+(thin.length===1?'summary':'summaries')+'. Check that the book’s main ideas and examples are represented.');
 }
 problems.push(...persianPublicFieldProblems(doc));
 return{doc,figures:figures.files,problems,warnings,chars};
}
