import type{Book,Chapter,Depth}from './types.ts';
export const depthLabels:Record<Depth,string>={glance:'Glance',overview:'Overview',detailed:'Detailed',close:'Close reading'};
export const languages=[{code:'en',label:'English'},{code:'fa',label:'فارسی · Persian'},{code:'de',label:'Deutsch'},{code:'ar',label:'العربية'},{code:'es',label:'Español'},{code:'fr',label:'Français'},{code:'tr',label:'Türkçe'},{code:'zh',label:'中文'}];
export const wordCount=(t:string)=>t.match(/[\p{L}\p{N}]+/gu)?.length??0;
export const chapterWords=(c:Chapter)=>c.blocks.reduce((n,b)=>n+wordCount(b.text),0);
export const bookWords=(b:Book)=>b.chapters.reduce((n,c)=>n+chapterWords(c),0);
export const minutes=(n:number)=>Math.max(1,Math.ceil(n/200));
export const progress=(b:Book)=>Math.round(b.completed.filter(id=>b.chapters.some(c=>c.id===id)).length/Math.max(1,b.chapters.length)*100);
export function sentenceSpans(t:string){return [...new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(t)].map(s=>s.segment.trim()).filter(Boolean);}
export function selectedPassages(c:Chapter,depth:Depth){
 if(depth==='close')return c.blocks.map(block=>({block,text:block.text}));
 const count=Math.max(1,Math.ceil(c.blocks.length*({glance:.16,overview:.34,detailed:.7}[depth])));
 const indices=new Set<number>();
 for(let i=0;i<count;i++)indices.add(count===1?0:Math.round(i*(c.blocks.length-1)/(count-1)));
 return [...indices].sort((a,b)=>a-b).map(i=>{
  const block=c.blocks[i];const sentences=sentenceSpans(block.text);const n=depth==='glance'?1:depth==='overview'?2:sentences.length;
  const last=sentences.slice(0,n).at(-1);
  return{block,text:last?block.text.slice(0,block.text.indexOf(last)+last.length):block.text};
 });
}
export function chaptersFromText(text:string,prefix='text'):Chapter[]{
 const result:Chapter[]=[];let title='Full text';let paragraphs:string[]=[];let pending:string[]=[];
 const flushParagraph=()=>{if(pending.length){paragraphs.push(pending.join('\n').trim());pending=[];}};
 const flushChapter=()=>{flushParagraph();if(!paragraphs.length)return;const ci=result.length;result.push({id:prefix+'-c'+ci,title,blocks:paragraphs.filter(Boolean).map((text,i)=>({id:prefix+'-c'+ci+'-b'+i,text,location:'Paragraph '+(i+1)}))});paragraphs=[];};
 for(const line of text.replace(/\r\n?/g,'\n').split('\n')){
  const s=line.trim();const heading=/^#{1,3}\s+(.+)$/.exec(s)?.[1]??(/^(?:chapter|part|section|فصل|بخش)\s+[\d\p{L}]+(?:[\s.:—–-].*)?$/iu.test(s)&&s.length<160?s:null);
  if(heading){flushChapter();title=heading;}else if(!s)flushParagraph();else pending.push(line);
 }flushChapter();return result;
}
export function markdownExport(book:Book,chapter:Chapter,items:ReturnType<typeof selectedPassages>){
 return '# '+book.title+'\n\n## '+chapter.title+'\n\nSelected original passages (not an AI summary).\n\n'+items.map(p=>'> '+p.text.replace(/\n/g,'\n> ')+'\n\n'+p.block.location).join('\n\n')+'\n\nSource version: '+book.hash+'\n';
}
// Footnotes stay readable in the original but are left out of AI input and highlights.
export function bodyChapter(c:Chapter):Chapter{const blocks=c.blocks.filter(b=>!b.note);return blocks.length?{...c,blocks}:c;}
// Short unpunctuated lines inside a chapter are section headings.
export const isHeading=(text:string)=>text.length<90&&!/[.!?:;,"”’)]$/.test(text)&&!/^[•\d]/.test(text);
const frontMatter=/^(?:contents|table of contents|acknowledg|list of|abbreviations|texts, transcriptions|map|maps|copyright|dedication|title page|half title|blank|front matter|пустая|series|also by|praise for|cover|صفحات عنوان|صفحهٔ عنوان|صفحه عنوان|فهرست مطالب|پیشگفتار|پیش‌گفتار)/i;
const backMatter=/^(?:afterword|works quoted|works cited|bibliography|references|index|notes|endnotes|about the author|glossary|پس[‌\s-]?گفتار)/i;
// Splits a book's sections into front matter, main chapters, and back matter for navigation.
export function sectionKind(c:Chapter,i:number,all:Chapter[]):'front'|'main'|'back'{
 const title=c.title.replace(/^\d+[.\s]+/,'').trim();
 const firstMain=all.findIndex(x=>!frontMatter.test(x.title.replace(/^\d+[.\s]+/,'').trim())&&chapterWords(x)>1500);
 if(backMatter.test(title))return'back';
 if(frontMatter.test(title)||(firstMain>=0&&i<firstMain))return'front';
 return'main';
}
export function readingTime(words:number){const m=minutes(words);if(m<90)return m+'-minute read';const h=Math.round(m/60);return'about '+h+'-hour read';}
export const displayName=(name:string)=>name&&name===name.toUpperCase()&&/\p{Lu}/u.test(name)?name.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu,(_,a,b)=>a+b.toUpperCase()):name;
