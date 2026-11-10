import assert from'node:assert/strict';
import test from'node:test';
import{chapterParts,partLimit,reportComplete,reportHtml,reportKey,reportMarkdown,runBookReport}from'../src/book-summary.ts';
import type{Book,BookReport,Chapter,Overview,Settings,Summary}from'../src/types.ts';

const settings:Settings={depth:'detailed',purpose:'understand',language:'en',review:'off',fontSize:19,dark:false};
const chapter=(id:string,text='A qualified finding.'):Chapter=>({id,title:'Chapter '+id,blocks:[{id:id+'-b',text,location:'Paragraph 1',page:1}]});
const book=(chapters=[chapter('one'),chapter('two'),chapter('three')]):Book=>({id:'book',title:'A reading book',author:'An author',format:'TEXT',category:'book',chapters,warnings:[],addedAt:1,lastRead:0,chapterIndex:0,completed:[],color:0,hash:'source-version'});
const summary=(c:Chapter):Summary=>({paragraphs:[{heading:'Argument',text:'A source-grounded summary of '+c.title,evidence_ids:[c.blocks[0].id]}],review:[],processed_blocks:c.blocks.length,total_blocks:c.blocks.length,language:'en',mode:'ai',checked:true,model:'quality-pro'});
const overview=(ids:string[]):Overview=>({paragraphs:[{heading:'Central argument',text:'An overview of the supplied summaries.',evidence_ids:ids}],takeaways:[{text:'Retain qualifications.',evidence_ids:ids}],checked:true,language:'en',model:'quality-pro'});

test('long chapter partitioning preserves every character, page, and source ID',()=>{
 const original:Chapter={id:'long',title:'Long chapter',blocks:[{id:'first',text:'A first paragraph.',location:'PDF page 1',page:1},{id:'long-block',text:('Words and 😀 qualifications. ').repeat(25),location:'PDF page 2',page:2},{id:'last',text:'A final limitation.',location:'PDF page 3',page:3}]};
 const parts=chapterParts(original,70);
 assert.ok(parts.length>3);
 for(const source of original.blocks)assert.equal(parts.flatMap(p=>p.blocks).filter(b=>b.id===source.id).map(b=>b.text).join(''),source.text);
 for(const part of parts){assert.ok(part.blocks.reduce((n,b)=>n+b.text.length,0)<=70);for(const block of part.blocks){assert.ok(!/[\uD800-\uDBFF]$/.test(block.text));assert.equal(block.page,original.blocks.find(b=>b.id===block.id)?.page);}}
 assert.equal(new Set(parts.map(p=>p.id)).size,parts.length);
});

test('one run processes every chapter and synthesizes long parts and the whole book',async()=>{
 const source=book([chapter('one'),chapter('long','word '.repeat(50000)),chapter('three')]);const calls:string[]=[];const compositions:string[]=[];let saved:BookReport|undefined;
 const report=await runBookReport(source,settings,'quality-pro',undefined,{signal:new AbortController().signal,summarize:async c=>{calls.push(c.id);return summary(c);},compose:async(_,sections,kind)=>{compositions.push(kind);if(kind==='book')assert.deepEqual(sections.map(s=>s.id),source.chapters.map(c=>c.id));return overview(kind==='book'?sections.map(s=>s.id):sections.flatMap(s=>s.paragraphs.flatMap(p=>p.evidence_ids)));},save:async value=>{saved=structuredClone(value);},cacheChapter:async()=>{},progress:()=>{}});
 assert.equal(calls.length,2+chapterParts(source.chapters[1],partLimit('detailed')).length);assert.deepEqual(compositions,['chapter','book']);assert.ok(reportComplete(source,report));assert.ok(reportComplete(source,saved));assert.deepEqual(Object.keys(report.chapters),['one','long','three']);
});

test('a failed chapter can resume without paying to regenerate completed work',async()=>{
 const source=book();let saved:BookReport|undefined;const calls:string[]=[];
 const dependencies={signal:new AbortController().signal,summarize:async(c:Chapter)=>{calls.push(c.id);if(c.id==='two')throw Error('Provider unavailable');return summary(c);},compose:async()=>overview(['one']),save:async(value:BookReport)=>{saved=structuredClone(value);},cacheChapter:async()=>{},progress:()=>{}};
 await assert.rejects(runBookReport(source,settings,'quality-pro',undefined,dependencies),/Provider unavailable/);
 assert.deepEqual(calls,['one','two']);assert.ok(saved?.chapters.one);assert.equal(saved?.chapters.two,undefined);
 calls.length=0;
 const complete=await runBookReport(source,settings,'quality-pro',saved,{...dependencies,summarize:async c=>{calls.push(c.id);return summary(c);}});
 assert.deepEqual(calls,['two','three']);assert.ok(reportComplete(source,complete));
});

test('pausing stops before another chapter request and keeps completed chapters',async()=>{
 const source=book();const controller=new AbortController();const calls:string[]=[];let saved:BookReport|undefined;
 await assert.rejects(runBookReport(source,settings,'quality-pro',undefined,{signal:controller.signal,summarize:async c=>{calls.push(c.id);return summary(c);},compose:async()=>overview(['one']),save:async value=>{saved=structuredClone(value);if(value.chapters.one)controller.abort();},cacheChapter:async()=>{},progress:()=>{}}),{name:'AbortError'});
 assert.deepEqual(calls,['one']);assert.ok(saved?.chapters.one);
});

test('report caches distinguish model, language, and edited contents but ignore credentials and appearance',()=>{
 const source=book();const key=reportKey(source,settings,'quality-pro');
 assert.notEqual(key,reportKey(source,settings,'fast-model'));
 assert.notEqual(key,reportKey(source,{...settings,language:'fa'},'quality-pro'));
 assert.notEqual(key,reportKey({...source,chapters:[chapter('renamed')]},settings,'quality-pro'));
 assert.equal(key,reportKey(source,{...settings,fontSize:24,dark:true},'quality-pro'));
});

test('formatted exports escape source text, identify partial reports, and exclude credentials',()=>{
 const source=book([chapter('one')]);source.title='<script>alert(1)</script>';
 const report:BookReport={model:'quality-pro',language:'en',createdAt:1,updatedAt:1,parts:{},chapters:{one:summary(source.chapters[0])}};
 report.chapters.one.paragraphs[0].text='<img src=x onerror=alert(1)>';
 const partial=reportHtml(source,report);assert.match(partial,/Partial book summary/);assert.ok(!partial.includes('<script>'));assert.ok(!partial.includes('<img '));
 report.overview=overview(['one']);const html=reportHtml(source,report);assert.match(html,/Book overview/);assert.match(html,/Key takeaways/);assert.match(html,/href="#chapter-0"/);assert.match(html,/PDF page 1/);assert.ok(reportMarkdown(source,report).includes('## 1. Chapter one'));
});
