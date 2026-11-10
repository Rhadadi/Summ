import type{Book,BookReport,Chapter,Depth,Guide,Overview,Settings,Summary,SummaryParagraph,SummarySection,Usage}from'./types.ts';

export interface BookProgress{completed:number;total:number;chapter:string;part:number;parts:number;stage:'chapter'|'overview'|'guide'}
export const reportKey=(book:Book,s:Settings,model:string)=>[book.id,'book-report-v2',book.hash,model,s.language,s.depth,s.purpose,s.review,JSON.stringify(book.chapters.map(c=>[c.id,c.title,c.blocks.map(b=>b.id)]))].join(':');
// Deeper summaries return more text per source character; smaller parts keep each answer within the model's output limit.
export const partLimit=(depth:Depth)=>({glance:220000,overview:220000,detailed:120000,close:60000}[depth]);
export const addUsage=(...items:(Usage|undefined)[]):Usage=>items.reduce<Usage>((total,u)=>({input:total.input+(u?.input||0),output:total.output+(u?.output||0)}),{input:0,output:0});
export function combineParts(chapter:Chapter,results:Summary[],combined:Overview):Summary{
 return{...results[0],paragraphs:combined.paragraphs,review:results.flatMap(result=>result.review),processed_blocks:chapter.blocks.length,total_blocks:chapter.blocks.length,model:combined.model,usage:addUsage(...results.map(r=>r.usage),combined.usage)};
}
export async function summarizeChapter(chapter:Chapter,depth:Depth,summarize:(part:Chapter)=>Promise<Summary>,compose:(title:string,sections:SummarySection[])=>Promise<Overview>):Promise<Summary>{
 const parts=chapterParts(chapter,partLimit(depth));const results:Summary[]=[];
 for(const part of parts)results.push(await summarize(part));
 if(results.length===1)return results[0];
 return combineParts(chapter,results,await compose(chapter.title,parts.map((part,i)=>({id:part.id,title:part.title,paragraphs:results[i].paragraphs}))));
}

// Preserve complete paragraphs where possible. Oversized paragraphs are split
// at word/code-point boundaries, retaining every character and source ID.
export function chapterParts(chapter:Chapter,limit=220000):Chapter[]{
 if(limit<2)throw Error('Section size is too small.');
 const groups:Chapter['blocks'][]=[];let blocks:Chapter['blocks']=[];let size=0;
 const flush=()=>{if(blocks.length){groups.push(blocks);blocks=[];size=0;}};
 for(const block of chapter.blocks){
  if(block.text.length<=limit){if(size+block.text.length>limit||blocks.length>=1000)flush();blocks.push(block);size+=block.text.length;continue;}
  flush();let offset=0;
  while(offset<block.text.length){
   let end=Math.min(offset+limit,block.text.length);
   if(end<block.text.length){const space=block.text.lastIndexOf(' ',end-1);if(space>offset+limit*.7)end=space+1;const last=block.text.charCodeAt(end-1);if(last>=0xd800&&last<=0xdbff)end--;}
   groups.push([{...block,text:block.text.slice(offset,end)}]);offset=end;
  }
 }
 flush();
 return groups.map((blocks,i)=>({...chapter,id:groups.length===1?chapter.id:chapter.id+'-part-'+i,title:groups.length===1?chapter.title:chapter.title+' · Part '+(i+1)+' of '+groups.length,blocks}));
}

interface Runner{
 signal:AbortSignal;
 summarize:(chapter:Chapter)=>Promise<Summary>;
 compose:(title:string,sections:SummarySection[],kind:'chapter'|'book')=>Promise<Overview>;
 guide?:(sections:SummarySection[])=>Promise<Guide>;
 save:(report:BookReport)=>Promise<void>;
 cacheChapter:(chapter:Chapter,summary:Summary)=>Promise<void>;
 progress:(progress:BookProgress)=>void;
}
export async function runBookReport(book:Book,s:Settings,model:string,previous:BookReport|undefined,runner:Runner):Promise<BookReport>{
 if(!book.chapters.length)throw Error('This source has no readable chapters.');
 if(book.chapters.length>300)throw Error('This report supports up to 300 chapters. Merge very short sections in Edit contents first.');
 let report:BookReport=previous?{...previous,parts:{...previous.parts},chapters:{...previous.chapters}}:{model,language:s.language,createdAt:Date.now(),updatedAt:Date.now(),parts:{},chapters:{}};
 if(report.model!==model||report.language!==s.language)throw Error('The saved report uses different settings. Reopen the book summary.');
 const check=()=>{if(runner.signal.aborted)throw new DOMException('Summary paused.','AbortError');};
 const save=async()=>{check();report={...report,updatedAt:Date.now(),parts:{...report.parts},chapters:{...report.chapters}};await runner.save(report);};
 for(let index=0;index<book.chapters.length;index++){
  check();const chapter=book.chapters[index];if(report.chapters[chapter.id])continue;
  const parts=chapterParts(chapter,partLimit(s.depth));const results:Summary[]=[];
  for(let part=0;part<parts.length;part++){
   check();runner.progress({completed:index,total:book.chapters.length,chapter:chapter.title,part:part+1,parts:parts.length,stage:'chapter'});
   const partKey=chapter.id+':'+part;
   let summary=report.parts[partKey];
   if(!summary){summary=await runner.summarize(parts[part]);check();if(summary.model&&summary.model!==model)throw Error('The server model changed during processing. Reopen the summary to use the new model.');report.parts[partKey]=summary;await save();}
   results.push(summary);
  }
  check();let summary=results[0];
  if(results.length>1){
   const combined=await runner.compose(chapter.title,parts.map((part,i)=>({id:part.id,title:part.title,paragraphs:results[i].paragraphs})),'chapter');check();
   if(combined.model!==model)throw Error('The server model changed. Reopen the book summary before continuing.');
   summary=combineParts(chapter,results,combined);
  }
  report.chapters[chapter.id]=summary;await runner.cacheChapter(chapter,summary);await save();
 }
 check();runner.progress({completed:book.chapters.length,total:book.chapters.length,chapter:'Book overview',part:1,parts:1,stage:'overview'});
 const sections=book.chapters.map(chapter=>({id:chapter.id,title:chapter.title,paragraphs:report.chapters[chapter.id].paragraphs}));
 if(!report.overview){const overview=await runner.compose(book.title,sections,'book');check();if(overview.model!==model)throw Error('The server model changed. Reopen the book summary before continuing.');report.overview=overview;await save();}
 // The study guide (characters, themes, key ideas…) is built from the checked chapter summaries.
 if(runner.guide&&!report.guide){runner.progress({completed:book.chapters.length,total:book.chapters.length,chapter:'Study guide',part:1,parts:1,stage:'guide'});report.guide=await runner.guide(sections);await save();}
 return report;
}

export const reportComplete=(book:Book,report?:BookReport)=>!!report?.overview&&book.chapters.every(chapter=>!!report.chapters[chapter.id]);
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const rtl=(language:string)=>['fa','ar'].includes(language);
export function referenceLabels(book:Book,chapter:Chapter|undefined,paragraph:SummaryParagraph):string[]{
 return [...new Set(paragraph.evidence_ids.map(id=>{const block=chapter?.blocks.find(block=>block.id===id);return block?(block.page?'PDF page '+block.page:block.location):book.chapters.find(chapter=>chapter.id===id)?.title||id;}))];
}
export const reportStyles=`
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#f4f2f7;color:#252331;font-family:Arial,sans-serif;line-height:1.75}.report{max-width:880px;margin:40px auto;padding:64px;background:white;border:1px solid #e4dfeb;border-radius:20px}.report-cover{border-bottom:2px solid #6552a8;padding-bottom:30px;margin-bottom:32px}.report-kicker{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#6552a8;font-weight:bold}.report h1{font-family:Georgia,serif;font-size:38px;line-height:1.25;margin:18px 0;overflow-wrap:anywhere}.report-author{font-size:17px;color:#5d586b}.report-meta,.report-notice,.report-ref{font-size:11px;color:#6b6577}.report h2{font-family:Georgia,serif;font-size:25px;line-height:1.35;margin:38px 0 18px;break-after:avoid}.report h3{font-size:16px;margin:24px 0 10px;break-after:avoid}.report p{margin:10px 0 16px;white-space:pre-wrap;overflow-wrap:anywhere}.report li{margin-bottom:10px}.report a{color:#6552a8;text-decoration:none}.report-contents{padding:22px 26px;background:#f5f2fa;border-radius:12px;margin:32px 0}.report-contents h2{margin-top:0;font-family:Arial,sans-serif;font-size:16px}.report-chapter{border-top:1px solid #e4dfeb;margin-top:36px;padding-top:4px}.report-ref{margin-top:-9px;margin-bottom:22px}.report-notice{border-top:1px solid #e4dfeb;padding-top:18px;margin-top:32px}@media(max-width:650px){.report{margin:0;padding:28px 22px;border:0;border-radius:0}.report h1{font-size:29px}.report h2{font-size:23px}}@page{size:A4;margin:18mm}@media print{body{background:white}.report{max-width:none;margin:0;padding:0;border:0;border-radius:0;font-size:11pt}.report h1{font-size:28pt}.report h2{font-size:20pt}.report-ref{font-size:8pt}.report-chapter{break-before:page}.report-contents{background:transparent;border:1px solid #ddd}p,li{orphans:3;widows:3}a{color:inherit}}
`;
export function reportHtml(book:Book,report:BookReport):string{
 const complete=reportComplete(book,report);const ready=book.chapters.filter(chapter=>report.chapters[chapter.id]).length;const label=complete?'Whole-book summary':'Partial book summary';
 const paragraphs=(items:SummaryParagraph[],chapter?:Chapter)=>items.map(p=>(p.heading?'<h3 dir="auto">'+esc(p.heading)+'</h3>':'')+'<p dir="auto">'+esc(p.text)+'</p><div class="report-ref">'+esc(referenceLabels(book,chapter,p).join(' · '))+'</div>').join('');
 const date=new Intl.DateTimeFormat(report.language,{dateStyle:'long'}).format(report.updatedAt);
 const contents=book.chapters.map((chapter,i)=>'<li>'+(report.chapters[chapter.id]?'<a href="#chapter-'+i+'">'+esc(chapter.title)+'</a>':esc(chapter.title)+' — pending')+'</li>').join('');
 const chapters=book.chapters.map((chapter,i)=>{const summary=report.chapters[chapter.id];return summary?'<section class="report-chapter" id="chapter-'+i+'"><h2 dir="auto">'+(i+1)+'. '+esc(chapter.title)+'</h2>'+paragraphs(summary.paragraphs,chapter)+(summary.review.length?'<h3>Internal analysis</h3>'+paragraphs(summary.review,chapter):'')+'</section>':'';}).join('');
 const overview=report.overview?'<section><h2>Book overview</h2>'+paragraphs(report.overview.paragraphs)+'<h2>Key takeaways</h2><ul>'+report.overview.takeaways.map(p=>'<li dir="auto">'+esc(p.text)+'</li>').join('')+'</ul></section>':'';
 return '<!doctype html><html lang="'+esc(report.language)+'" dir="'+(rtl(report.language)?'rtl':'ltr')+'"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(book.title)+' — '+label+'</title><style>'+reportStyles+'</style></head><body><main class="report"><header class="report-cover"><div class="report-kicker">Summ · '+label+'</div><h1 dir="auto">'+esc(book.title)+'</h1><div class="report-author" dir="auto">'+esc(book.author)+'</div><p class="report-meta">'+esc(date)+' · '+ready+' of '+book.chapters.length+' chapters · '+esc(report.model)+'</p></header>'+overview+'<nav class="report-contents"><h2>Contents</h2><ol>'+contents+'</ol></nav>'+chapters+'<footer class="report-notice">AI-generated summary. Chapter summaries are checked against supplied passages; the book overview is synthesized and checked against those summaries. These automated checks do not guarantee accuracy or completeness. Refer to the original text. Source version: '+esc(book.hash)+'</footer></main></body></html>';
}
export function reportMarkdown(book:Book,report:BookReport):string{
 const safe=(s:string)=>s.replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const paras=(items:SummaryParagraph[],chapter?:Chapter)=>items.map(p=>(p.heading?'### '+safe(p.heading)+'\n\n':'')+safe(p.text)+'\n\n*'+safe(referenceLabels(book,chapter,p).join(' · '))+'*').join('\n\n');
 return '# '+safe(book.title)+'\n\n'+safe(book.author)+'\n\nWhole-book summary · '+report.model+'\n\n'+(report.overview?'## Book overview\n\n'+paras(report.overview.paragraphs)+'\n\n## Key takeaways\n\n'+report.overview.takeaways.map(p=>'- '+safe(p.text)).join('\n')+'\n\n':'')+book.chapters.map((chapter,i)=>{const summary=report.chapters[chapter.id];return summary?'## '+(i+1)+'. '+safe(chapter.title)+'\n\n'+paras(summary.paragraphs,chapter)+(summary.review.length?'\n\n### Internal analysis\n\n'+paras(summary.review,chapter):''):'';}).filter(Boolean).join('\n\n')+'\n\n---\nAI-generated. Verify against the original source. Source version: '+book.hash+'\n';
}
