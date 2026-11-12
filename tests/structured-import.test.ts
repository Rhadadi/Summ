import assert from 'node:assert/strict';
import test from 'node:test';
import{extractPages,mapChapters,parseBlock,splitBlocks}from '../src/structured-import.ts';

const fa=`# خلاصهٔ کتاب قانون

## نمای کلی

این کتاب درباره قانون است. [ص ۱۲]

## نکات کلیدی

- قانون باید روشن باشد.
- دولت تابع قانون است (ص. ۴۵–۴۶)

## فصل ۱: آغاز قانون

متن فصل اول. [p. 3]

### جزئیات

بخش دوم فصل.

## فصل ۲: پایان

متن فصل دوم.

## مفاهیم کلیدی

اصطلاحات مهم.
`;
test('Persian summary yields translated chapter titles, overview, takeaways and sections',()=>{
 const b=parseBlock(fa,null,'en');
 assert.equal(b.language,'fa');
 assert.equal(b.bookTitle,'خلاصهٔ کتاب قانون');
 assert.deepEqual(b.chapters.map(c=>[c.n,c.title]),[[1,'آغاز قانون'],[2,'پایان']]);
 assert.deepEqual(b.chapters[0].paragraphs.map(p=>p.heading),[undefined,'جزئیات']);
 assert.deepEqual(b.chapters[0].paragraphs[0].pages,[3]);
 assert.equal(b.overview[0].text,'این کتاب درباره قانون است.');assert.deepEqual(b.overview[0].pages,[12]);
 assert.equal(b.takeaways.length,2);assert.deepEqual(b.takeaways[1].pages,[45,46]);
 assert.deepEqual(b.sections.map(s=>s.title),['مفاهیم کلیدی']);
});
test('chapters grouped under a chapter-by-chapter heading are found',()=>{
 const b=parseBlock('# Guide\n\n## Overview\n\nHi.\n\n## Chapter-by-chapter summary\n\n### Chapter 1: Start\n\nOne.\n\n### Chapter 2: End\n\nTwo.\n\n## Key takeaways\n\n- A',null,'en');
 assert.deepEqual(b.chapters.map(c=>c.title),['Start','End']);assert.equal(b.takeaways.length,1);assert.equal(b.sections.length,0);
});
test('delimiters split several summaries',()=>{
 const parts=splitBlocks('=== INKLING: type=short; language=fa ===\n# A\n\nx\n\n=== INKLING: type=detailed; language=fa ===\n# B\n\ny');
 assert.deepEqual(parts.map(p=>[p.type,p.language]),[['short','fa'],['detailed','fa']]);
 assert.equal(splitBlocks('# plain').length,1);
});
test('chapters map by prompt position or by title number',()=>{
 const chapters=[{id:'a',title:'Contents',blocks:[]},{id:'b',title:'1. Law',blocks:[]},{id:'c',title:'2. Duty',blocks:[]}];
 const parsed=parseBlock(fa,null,'fa').chapters;
 assert.deepEqual(mapChapters(parsed,chapters,'position').mapped.map(m=>m.chapterId),['a','b']);
 assert.deepEqual(mapChapters(parsed,chapters,'title').mapped.map(m=>m.chapterId),['b','c']);
 assert.deepEqual(mapChapters(parsed,chapters,'title').missing.map(c=>c.id),['a']);
});
test('page markers are removed from the prose',()=>{
 assert.deepEqual(extractPages('Claim (pp. 10–12, 20).'),{text:'Claim.',pages:[10,11,12,20]});
});
import{buildPrompt,defaultOptions}from '../src/prompt-builder.ts';
import{buildVersion,pickVersion}from '../src/imports.ts';
test('the prompt changes with every choice',()=>{
 const book={title:'Law',author:'A. Writer',chapters:[{id:'a',title:'Contents',blocks:[]},{id:'b',title:'Duty',blocks:[{id:'1',text:'x',location:'',page:12},{id:'2',text:'y',location:'',page:30}]},{id:'c',title:'Rights',blocks:[]}]};
 const base={...defaultOptions({code:'en',name:'English'}),chapterMode:'list' as const,chapters:[1,2]};
 const a=buildPrompt(book,base);
 assert.match(a,/3\. Rights/);assert.match(a,/2\. Duty \(pp\. 12–30\)/);assert.doesNotMatch(a,/Contents/);assert.match(a,/type=detailed; language=en/);
 const b=buildPrompt(book,{...base,chapters:[2],types:['short'.replace('short','glance'),'academic'],languages:[{code:'fa',name:'Persian'}],pageRefs:false,quotes:true,notes:'Focus on ethics'});
 assert.doesNotMatch(b,/Duty/);assert.match(b,/type=glance; language=fa/);assert.match(b,/type=academic; language=fa/);assert.match(b,/Persian/);assert.doesNotMatch(b,/\[p\. 143\]/);assert.match(b,/pull-quote/);assert.doesNotMatch(buildPrompt(book,{...base,quotes:false}),/pull-quote/);assert.match(buildPrompt(book,{...base,chapterMode:'ai'}),/identify the book's real chapters/i);assert.doesNotMatch(a,/\d+–\d+ words/);assert.match(b,/Focus on ethics/);assert.match(b,/continue/);
 assert.notEqual(a,b);
});
test('an imported version carries translated titles and is chosen by language',()=>{
 const block=parseBlock(fa,null,'fa');const chapters=[{id:'b',title:'1. Law',blocks:[]},{id:'c',title:'2. Duty',blocks:[]}];
 const v=buildVersion(block,mapChapters(block.chapters,chapters,'title').mapped,'fa','detailed');
 assert.deepEqual(v.titles,{b:'آغاز قانون',c:'پایان'});assert.equal(v.report.chapters.b.paragraphs[0].pages?.[0],3);assert.ok(v.report.overview);
 assert.equal(pickVersion([v],'en')?.id,'fa:detailed');assert.equal(pickVersion([],'fa'),undefined);
});
test('a top-level "Summary" heading is the document title, not the overview',()=>{
 const b=parseBlock('# خلاصهٔ کتاب\n\n## نمای کلی\n\nاین کتاب.\n\n## نکات کلیدی\n\n- پرسش.\n\n## 1. اصل اول\n\nمتن.\n',null,'fa');
 assert.deepEqual([b.overview.length,b.takeaways.length,b.chapters.length,b.bookTitle],[1,1,1,'خلاصهٔ کتاب']);
});
test('figures and tables stay with the chapter they were written in',()=>{
 const b=parseBlock('# T\n\n## 1. First\n\nText.\n\n![A chart](images/c.png)\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nMore.\n',null,'en');
 const ps=b.chapters[0].paragraphs;
 assert.deepEqual(ps.map(p=>!!p.image||!!p.table),[false,true,true,false]);
 assert.deepEqual(ps[2].table,[['A','B'],['1','2']]);
 const v=buildVersion(b,[{chapterId:'a',parsed:b.chapters[0]}],'en','detailed',{sourcePath:'summary.md',images:[{path:'images/c.png',type:'image/png',data:new ArrayBuffer(3)}]});
 assert.equal(v.report.chapters.a.paragraphs[1].image?.path,'images/c.png');assert.equal(v.images?.length,1);
});
test('the prompt asks for a ZIP with images only when figures are wanted',()=>{
 const book={title:'T',author:'A',chapters:[{id:'a',title:'1',blocks:[]}]};
 const o={...defaultOptions({code:'fa',name:'Persian (Farsi)'}),chapters:[0]};
 assert.match(buildPrompt(book,o),/inkling-summary\.zip/);assert.match(buildPrompt(book,{...o,chapterMode:"list"}),/1\. Chapter 1/);
 assert.doesNotMatch(buildPrompt(book,{...o,figures:false}),/zip named/i);
});
test('chapter page ranges, original titles and pull-quotes are read',()=>{
 const b=parseBlock('# T\n\n## 1. Facing death (pp. 15–48)\n\nOriginal title: Facing Death\n\nA case history [p. 20].\n\n> “Death is the mother of beauty.” — Stevens, p. 30\n\nMore.\n',null,'en');
 const c=b.chapters[0];
 assert.equal(c.title,'Facing death');assert.deepEqual(c.range,[15,48]);assert.equal(c.original,'Facing Death');
 assert.deepEqual(c.paragraphs.map(p=>!!p.quote),[false,true,false]);
 const fa=parseBlock('# T\n\n## ۲. مواجهه با مرگ (ص ۱۵–۴۸)\n\nمتن.\n',null,'fa');assert.deepEqual(fa.chapters[0].range,[15,48]);assert.equal(fa.chapters[0].title,'مواجهه با مرگ');
});
import{rechapter}from '../src/rechapter.ts';
test('a book is cut into the chapters a summary found, by page',()=>{
 const blocks=[1,2,5,9,12,20,30].map(p=>({id:'b'+p,text:'x',location:'',page:p}));
 const book={chapters:[{id:'all',title:'1',blocks}]};
 const plan=rechapter(book,[{title:'Two',start:10,end:25},{title:'One',original:'Uno',start:4,end:9}])!;
 assert.deepEqual(plan.chapters.map(c=>[c.title,c.blocks.length]),[['Front matter',2],['Uno',2],['Two',2],['Notes and index',1]]);
 assert.equal(plan.main.length,2);assert.equal(rechapter({chapters:[{id:'a',title:'t',blocks:[{id:'x',text:'',location:''}]}]},[{title:'a',start:1,end:2},{title:'b',start:3,end:4}]),null);
});
test('headings with Persian page spans and English originals map to the real chapters, not the front matter',()=>{
 const md='# قانون\n\n## 1. مقدمه: «قانون برای یهودیان و قانون برای غیراسرائیلیان» — صص. ۱–۳۴\n\nمتن.\n\n## 2. «خون و دیوان» (Blood and Demons) — صص. ۳۵–۱۲۸\n\nمتن.\n\n## 3. «رابطهٔ جنسی به‌مثابه جرم» (Sex as Crime) — صص. ۱۲۹–۲۱۸\n\nمتن.\n';
 const b=parseBlock(md,null,'fa');
 assert.deepEqual(b.chapters.map(c=>[c.title,c.range,c.original]),[['مقدمه: قانون برای یهودیان و قانون برای غیراسرائیلیان',[1,34],undefined],['خون و دیوان',[35,128],'Blood and Demons'],['رابطهٔ جنسی به‌مثابه جرم',[129,218],'Sex as Crime']]);
 const words=(n:number)=>Array.from({length:n},(_,i)=>({id:'b'+i,text:'word '.repeat(400),location:''}));
 const chapters=[{id:'f1',title:'Contents',blocks:words(1)},{id:'f2',title:'Map of Arabia',blocks:words(1)},{id:'c1',title:'Introduction: Law for Jews and Law for Gentiles',blocks:words(5)},{id:'c2',title:'1. Blood and Demons: Genesis 9 and Leviticus 17',blocks:words(5)},{id:'c3',title:'2. Sex as Crime: Leviticus 18',blocks:words(5)}];
 const main=chapters.slice(2);
 const r=mapChapters(b.chapters,chapters,'smart',main);
 assert.deepEqual(r.mapped.map(m=>[m.chapterId,m.parsed.title]),[['c1','مقدمه: قانون برای یهودیان و قانون برای غیراسرائیلیان'],['c2','خون و دیوان'],['c3','رابطهٔ جنسی به‌مثابه جرم']]);
});
