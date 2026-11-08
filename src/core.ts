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
export function cleanApiUrl(value:string){
 const t=value.trim().replace(/\/$/,'');if(!t)return '';
 const u=new URL(t);if(u.username||u.password||u.search||u.hash)throw Error('Use a server URL without credentials, query parameters, or fragments.');
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Error('Use HTTPS, or HTTP on localhost for development.');
 return t;
}
export function markdownExport(book:Book,chapter:Chapter,items:ReturnType<typeof selectedPassages>){
 return '# '+book.title+'\n\n## '+chapter.title+'\n\nSelected original passages (not an AI summary).\n\n'+items.map(p=>'> '+p.text.replace(/\n/g,'\n> ')+'\n\n'+p.block.location).join('\n\n')+'\n\nSource version: '+book.hash+'\n';
}
