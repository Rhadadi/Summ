import type{Chapter,PubPara}from'./types.ts';
import{detectSummaryLanguage,importedChapterHeadings}from'./summary-import.ts';

// Turns an AI-written Markdown summary into per-chapter summaries. The language, translated chapter titles,
// overview, takeaways and extra guide sections are all recovered from the headings.
// Figures and tables that came with the summary are kept beside the text.
export interface ParaIn extends Omit<PubPara,'image'|'table'|'quote'>{image?:{src:string;alt:string};table?:string[][];quote?:boolean}
// "range" is the chapter's first and last page and "original" its title as the book prints it, when the summary says so.
export interface ParsedChapter{n:number|null;title:string;paragraphs:ParaIn[];range?:[number,number];original?:string}
export interface ParsedBlock{type:string|null;language:string;bookTitle:string;overview:ParaIn[];takeaways:ParaIn[];sections:{title:string;items:ParaIn[]}[];chapters:ParsedChapter[]}
const DIGITS:Record<string,string>={'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
export const latinDigits=(text:string)=>text.replace(/[۰-۹٠-٩]/g,d=>DIGITS[d]);
const delimiter=/^\s*={3,}\s*INKLING\b(.*?)=*\s*$/i;
const overviewHead=/^(?:overview|(?:book |whole[- ]book |executive )?summary|summary of the (?:book|work)|نمای کلی|مرور(?: کلی)?|خلاصه(?:ٔ|‌)?(?: کلی| کتاب)?|نظرة عامة|ملخص)\s*[:：]?$/iu;
const takeawayHead=/^(?:key (?:take-?aways|points|ideas|lessons)|main take-?aways|take-?aways|نکات کلیدی|نکته‌های کلیدی|نکته‌های اصلی|برداشت‌های کلیدی|أهم النقاط|النقاط الرئيسية)\s*[:：]?$/iu;
const pageRef=/[\[(]\s*(?:pp?|pages?|ص|صص|صفحه|صفحات)\.?\s*([\d۰-۹٠-٩][\d۰-۹٠-٩\s,،–—-]*)[\])]/giu;
const headingLine=/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

function inline(text:string){
 return text.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*(.+?)\*\*/g,'$1').replace(/__(.+?)__/g,'$1').replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,;:!?]|$)/g,'$1$2').replace(/`([^`]+)`/g,'$1').replace(/\s+/g,' ').trim();
}
// "[p. 143]", "(pp. 10–12)" and "[ص ۱۴۳]" become page numbers; the markers are removed from the text.
export function extractPages(text:string):{text:string;pages:number[]}{
 const pages=new Set<number>();
 for(const m of text.matchAll(pageRef))for(const part of latinDigits(m[1]).split(/[,،]/)){
  const r=part.trim().match(/^(\d+)(?:\s*[–—-]\s*(\d+))?$/);if(!r)continue;
  const a=+r[1],b=r[2]?+r[2]:a;if(a<1||a>50000||b<a||b-a>60)continue;for(let n=a;n<=b&&pages.size<40;n++)pages.add(n);
 }
 return{text:text.replace(pageRef,'').replace(/\s+([.,;:!?،؛])/g,'$1').replace(/\s{2,}/g,' ').trim(),pages:[...pages].sort((a,b)=>a-b)};
}
function paragraphs(lines:string[]):ParaIn[]{
 const out:ParaIn[]=[];let pending:string[]=[];let heading:string|undefined;let rows:string[][]=[];
 const push=(raw:string)=>{
  // A figure linked in the middle of a sentence still becomes a figure of its own, right after that paragraph.
  const inlineImages=[...raw.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)/g)].map(m=>({src:m[2],alt:inline(m[1])}));
  const cleaned=inline(raw);if(!cleaned){for(const im of inlineImages)out.push({text:im.alt||'Figure',image:im});return;}
  const{text,pages}=extractPages(cleaned);if(!text)return;
  const p:ParaIn={text};if(heading){p.heading=heading;heading=undefined;}if(pages.length)p.pages=pages;out.push(p);
  for(const im of inlineImages)out.push({text:im.alt||'Figure',image:im});
 };
 const flush=()=>{if(pending.length)push(pending.join(' '));pending=[];};
 let quote:string[]=[];
 const flushQuote=()=>{if(!quote.length)return;const raw=inline(quote.join(' '));quote=[];if(!raw)return;const{text,pages}=extractPages(raw);if(!text)return;const p:ParaIn={text,quote:true};if(heading){p.heading=heading;heading=undefined;}if(pages.length)p.pages=pages;out.push(p);};
 const flushTable=()=>{if(!rows.length)return;const p:ParaIn={text:rows.map(r=>r.join(' · ')).join('\n'),table:rows};if(heading){p.heading=heading;heading=undefined;}out.push(p);rows=[];};
 for(const line of lines){
  if(/^\s*\|/.test(line)){flush();const cells=line.trim().replace(/^\||\|$/g,'').split('|').map(c=>inline(c));if(!cells.every(c=>/^:?-{2,}:?$/.test(c)||!c))rows.push(cells);continue;}
  if(/^\s*>/.test(line)){flush();quote.push(line.replace(/^\s*>\s?/,'').trim());continue;}
  flushQuote();
  flushTable();
  const h=line.match(headingLine);
  if(h){flush();heading=inline(h[2]);continue;}
  const img=line.match(/^\s*!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)\s*$/);
  if(img){flush();out.push({text:inline(img[1])||'Figure',image:{src:img[2],alt:inline(img[1])}});continue;}
  if(!line.trim()||/^\s*(?:---+|\*\*\*+)\s*$/.test(line)){flush();continue;}
  const bullet=line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
  if(bullet){flush();pending=[bullet[1]];flush();continue;}
  pending.push(line.replace(/^\s*>\s?/,'').trim());
 }
 flush();flushQuote();flushTable();return out;
}
// A pasted answer can hold several summaries, each introduced by a line like "=== INKLING: type=short; language=fa ===".
export function splitBlocks(markdown:string):{type:string|null;language:string|null;text:string}[]{
 const blocks:{type:string|null;language:string|null;lines:string[]}[]=[];let cur={type:null as string|null,language:null as string|null,lines:[] as string[]};
 for(const line of markdown.replace(/\r\n?/g,'\n').split('\n')){
  const m=line.match(delimiter);
  if(m){blocks.push(cur);cur={type:m[1].match(/type\s*[=:]\s*([\w-]+)/i)?.[1].toLowerCase()??null,language:m[1].match(/lang(?:uage)?\s*[=:]\s*([\w-]+)/i)?.[1].toLowerCase()??null,lines:[]};}
  else cur.lines.push(line);
 }
 blocks.push(cur);
 return blocks.map(b=>({type:b.type,language:b.language,text:b.lines.join('\n').trim()})).filter(b=>b.text);
}
const numbered=/^(?:(?:chapter|section|part|فصل|بخش)\s*)?([\d۰-۹٠-٩]+)\s*[.،:–—)-]*\s*/iu;
const worded=/^(?:chapter|section|part|فصل|بخش)\s+[^\s:.–—-]+\s*[.،:–—)-]*\s*/iu;
export function parseBlock(text:string,type:string|null=null,fallbackLanguage='en'):ParsedBlock{
 const raw=text.replace(/\r\n?/g,'\n').split('\n');
 const heads:{index:number;level:number;title:string}[]=[];let fence=false;
 raw.forEach((l,i)=>{if(/^\s*(```|~~~)/.test(l)){fence=!fence;return;}if(fence)return;const h=l.match(headingLine);if(h)heads.push({index:i,level:h[1].length,title:inline(h[2])});});
 const chapterAt=new Set(importedChapterHeadings(heads.map(h=>({level:h.level,title:latinDigits(h.title)}))));
 const block:ParsedBlock={type,language:detectSummaryLanguage(text,fallbackLanguage),bookTitle:'',overview:[],takeaways:[],sections:[],chapters:[]};
 const endOf=(i:number,stopAtChapter:boolean)=>{for(let j=i+1;j<heads.length;j++)if(heads[j].level<=heads[i].level||(stopAtChapter&&chapterAt.has(j)))return heads[j].index;return raw.length;};
 const body=(i:number,stop:boolean)=>raw.slice(heads[i].index+1,endOf(i,stop));
 let used=heads.length?heads[0].index:raw.length;
 const lead=paragraphs(raw.slice(0,used));
 for(let i=0;i<heads.length;i++){
  const h=heads[i];if(h.index<used)continue;
  if(chapterAt.has(i)){
   const n=latinDigits(h.title).match(numbered);
   const title=h.title.replace(/^(?:(?:chapter|section|part|فصل|بخش)\s*)?[\d۰-۹٠-٩]+\s*[.،:–—)-]*\s*/iu,'').replace(worded,'').trim()||h.title;
   const head=splitHeading(title);
   const body_=paragraphs(body(i,false));
   const orig=body_[0]&&!body_[0].heading&&body_[0].text.match(/^(?:original title|عنوان اصلی)\s*[:：]\s*(.+)$/i);
   if(orig)body_.shift();
   const original=orig?orig[1].trim():head.original;
   block.chapters.push({n:n?+n[1]:null,title:head.title||title,paragraphs:body_,...(head.range?{range:head.range}:{}),...(original?{original}:{})});used=endOf(i,false);continue;
  }
  if(i===0&&h.level===1&&heads.length>1&&heads[1].level>1&&heads.filter(x=>x.level===1).length===1){block.bookTitle=h.title.replace(/^(?:summary|study guide|خلاصه(?:ٔ)?)\s*[:：—–-]\s*/i,'');continue;}
  // "Chapter-by-chapter summary" only groups the chapters beneath it.
  if(chapterAt.has(i+1)&&heads[i+1].level>h.level)continue;
  const items=paragraphs(body(i,true));used=endOf(i,true);
  if(overviewHead.test(h.title)&&!block.overview.length)block.overview=items;
  else if(takeawayHead.test(h.title)&&!block.takeaways.length)block.takeaways=items;
  else if(items.length)block.sections.push({title:h.title,items});
 }
 if(!block.overview.length&&lead.length)block.overview=lead;
 return block;
}
// A chapter heading may carry its pages and the book's own title in many shapes:
// "خون و دیوها (pp. 35–128)", "«خون و دیوها» (Blood and Demons) — صص. ۳۵–۱۲۸", "Blood [pp. 35-128]".
export function splitHeading(heading:string):{title:string;range?:[number,number];original?:string}{
 let t=heading.trim(),range:[number,number]|undefined,original:string|undefined;
 const span=latinDigits(t).match(/[\s,،|—–-]*[(\[]?\s*(?:pp?|pages?|ص|صص|صفحه|صفحات|صفحه‌های)\.?\s*(\d+)\s*(?:[–—-]|تا|to)\s*(\d+)\s*[)\]]?\s*$/i);
 if(span&&span.index!==undefined){const a=+span[1],b=+span[2];if(a>0&&b>=a)range=[a,b];t=t.slice(0,span.index).trim();}
 // A Latin title in brackets after a Persian one is the book's original chapter title.
 const latin=t.match(/^(.*[\u0600-\u06FF].*?)\s*[(\[]\s*([A-Za-z][^()\[\]]{2,160})\s*[)\]]\s*$/);
 if(latin){t=latin[1].trim();original=latin[2].trim();}
 t=t.replace(/[\s—–-]+$/,'').trim();
 const quoted=t.match(/^(.*?)«(.+)»$/);if(quoted)t=(quoted[1]+quoted[2]).trim();
 return{title:t,...(range?{range}:{}),...(original?{original}:{})};
}
export interface Mapping{chapterId:string;parsed:ParsedChapter}
const bare=(t:string)=>latinDigits(t).replace(numbered,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// "position" numbers count the chapters listed in our prompt; "title" numbers are the ones inside the book's own titles.
const latinWords=(t:string)=>new Set(t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[a-z]{3,}/g)?.filter(w=>!['the','and','for','from','with'].includes(w))||[]);
// How much of a summary's original title the book's own chapter title shares.
export function titleMatch(a:string,b:string){const x=latinWords(a),y=latinWords(b);if(!x.size||!y.size)return 0;let n=0;for(const w of x)if(y.has(w))n++;return n/Math.min(x.size,y.size);}
// "smart": match by the chapter's original title, then by number among the book's main chapters, never into front matter.
export function mapChapters(parsed:ParsedChapter[],chapters:Chapter[],mode:'position'|'title'|'smart',main?:Chapter[]):{mapped:Mapping[];missing:Chapter[];extra:ParsedChapter[]}{
 if(mode==='smart'){
  const taken=new Set<string>(),mapped:Mapping[]=[],extra:ParsedChapter[]=[],pool=main&&main.length?main:chapters;
  const left:ParsedChapter[]=[];
  for(const p of parsed){
   const name=p.original||(/[a-z]/i.test(p.title)?p.title:'');
   let best:Chapter|undefined,score=0;
   if(name)for(const c of chapters){if(taken.has(c.id))continue;const s=titleMatch(name,c.title);if(s>score){score=s;best=c;}}
   if(best&&score>=.6){taken.add(best.id);mapped.push({chapterId:best.id,parsed:p});}else left.push(p);
  }
  for(const p of left){
   const target=(p.n!==null?pool[p.n-1]:undefined)??pool.find(c=>!taken.has(c.id));
   if(target&&!taken.has(target.id)){taken.add(target.id);mapped.push({chapterId:target.id,parsed:p});}else extra.push(p);
  }
  mapped.sort((a,b)=>chapters.findIndex(c=>c.id===a.chapterId)-chapters.findIndex(c=>c.id===b.chapterId));
  return{mapped,missing:pool.filter(c=>!taken.has(c.id)),extra};
 }
 const taken=new Set<string>();const mapped:Mapping[]=[];const extra:ParsedChapter[]=[];const pending:ParsedChapter[]=[];
 const byTitle=(n:number)=>chapters.find(c=>!taken.has(c.id)&&new RegExp('^\\s*(?:chapter\\s*)?0*'+n+'(?!\\d)','i').test(latinDigits(c.title)));
 for(const p of parsed){
  let target:Chapter|undefined;
  if(p.n!==null)target=mode==='position'?chapters[p.n-1]:byTitle(p.n);
  if(target&&taken.has(target.id))target=undefined;
  if(!target&&p.title){const want=bare(p.title);if(want)target=chapters.find(c=>!taken.has(c.id)&&bare(c.title)===want);}
  if(target){taken.add(target.id);mapped.push({chapterId:target.id,parsed:p});}else pending.push(p);
 }
 // Unnumbered leftovers follow the book's order.
 for(const p of pending){const target=p.n===null?chapters.find(c=>!taken.has(c.id)):undefined;if(target){taken.add(target.id);mapped.push({chapterId:target.id,parsed:p});}else extra.push(p);}
 return{mapped,missing:chapters.filter(c=>!taken.has(c.id)),extra};
}
