import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import{importedChapterHeadings,importedSummaryVersions,readSummaryFile,summaryImagePath}from '../src/summary-import.ts';

async function archive(files:Record<string,string>){
 const zip=new JSZip();
 for(const [name,content] of Object.entries(files))zip.file(name,content);
 return new File([await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'})],'summary.zip');
}

test('a Markdown bundle keeps image bytes and resolves paths relative to the summary',async()=>{
 const summary=await readSummaryFile(await archive({
  'notes/summary.md':'# Study guide\n\n![Chart](../images/chart%201.png)',
  'images/chart 1.png':'image bytes',
  'notes/chart 1.png':'other image bytes',
 }));
 const path=summaryImagePath(summary.sourcePath,'../images/chart%201.png');
 assert.equal(path,'images/chart 1.png');
 const image=summary.images.find(image=>image.path===path);
 assert.equal(image?.type,'image/png');
 assert.equal(new TextDecoder().decode(image?.data),'image bytes');
 assert.equal(summaryImagePath(summary.sourcePath,'../../escape.png'),null);
 assert.equal(summaryImagePath(summary.sourcePath,'sandbox:/mnt/data/chart%201.png'),'chart 1.png');
});

test('saved Persian Markdown remains readable and its chapter outline excludes subsections',()=>{
 const saved={markdown:'# خلاصهٔ کتاب\n\nاین خلاصه به زبان فارسی نوشته شده است.',sourcePath:'',images:[]};
 assert.deepEqual(importedSummaryVersions(saved),{latestLanguage:'fa',versions:{fa:saved}});
 const headings=[
  {level:1,title:'خلاصهٔ کتاب'},{level:2,title:'خلاصهٔ فصل‌ها'},
  {level:3,title:'فصل اول: آغاز'},{level:4,title:'بخش اول: جزئیات'},
  {level:3,title:'Chapter 2: Discussion'},{level:2,title:'نکته‌های کلیدی'},
 ];
 assert.deepEqual(importedChapterHeadings(headings),[2,4]);
});

test('oversized compressed Markdown is rejected before it can be saved',async()=>{
 const file=await archive({'summary.md':'a'.repeat(2*1024*1024+1)});
 assert.ok(file.size<4000);
 await assert.rejects(readSummaryFile(file),/exceeds the Markdown or image size limit/);
});
