import test from'node:test';import assert from'node:assert/strict';
import{concepts,lead,pullQuote,readingMinutes,selfCheck,starts}from'../src/study.ts';
import{epubFiles,inlineHtml,sectionHtml}from'../src/export-book.ts';
import{seekIn}from'../src/listening.ts';

const paras=[{heading:'Trust',text:'**Trust** grows in small moments. It is built by turning toward a partner.'},{text:'More on *bids*.'},{heading:'Conflict',text:'Most **conflict** is perpetual. Couples learn to live with it.'},{text:'“Love is a verb,” he writes.',quote:true}];
test('concepts are the bold terms, once each, never a bold label, and at least two',()=>{assert.deepEqual(concepts(paras),['Trust','conflict']);
 assert.deepEqual(concepts([{text:'**Key question:** why? **Alpha** and **Beta**'}]),['Alpha','Beta']);assert.deepEqual(concepts([{text:'**Only** one'}]),[]);});
test('numbered paragraphs with a short title become questions when there are no headings',()=>{
 const q=selfCheck([{text:'۱. بازخوانی فروید. میچل از مقاله بهره می‌گیرد.'},{text:'2. Home and away: the pull of both. More.'}],'en');
 assert.equal(q.length,2);assert.match(q[0].question,/بازخوانی فروید/);assert.equal(q[0].answer,'میچل از مقاله بهره می‌گیرد.');assert.match(q[1].question,/Home and away/);});
test('self-check asks one question per headed section and answers with its opening',()=>{
 const q=selfCheck(paras,'en');assert.equal(q.length,2);assert.match(q[0].question,/Trust/);assert.equal(q[0].answer,'Trust grows in small moments. It is built by turning toward a partner.');
 assert.match(selfCheck(paras,'fa')[1].question,/«Conflict»/);
 assert.deepEqual(selfCheck([paras[0]],'en'),[]);
});
test('lead keeps whole sentences',()=>{assert.equal(lead('One. Two two. Three.',8),'One.');});
test('starts are shares of the text and begin at zero',()=>{const s=starts(paras);assert.equal(s[0],0);assert.ok(s[1]>0&&s[1]<s[2]&&s[3]<1);});
test('pull-quote is the first short quotation',()=>{assert.equal(pullQuote(paras),'“Love is a verb,” he writes.');assert.equal(pullQuote([{text:'x'}]),null);});
test('reading time counts words',()=>{assert.equal(readingMinutes([{text:'w '.repeat(460)}],'en'),2);});
test('a share of a chapter maps onto its tracks by length',()=>{
 const t=[{chapterId:null,seconds:100},{chapterId:'a',seconds:60},{chapterId:'a',seconds:40},{chapterId:'b',seconds:30}];
 assert.deepEqual(seekIn(t,'a',0),{index:1,seconds:0});
 assert.deepEqual(seekIn(t,'a',.5),{index:1,seconds:49});
 assert.deepEqual(seekIn(t,'a',.8),{index:2,seconds:19});
 assert.equal(seekIn([{chapterId:'a',seconds:null}],'a',.5),null);
});
test('exports escape text and keep bold and italic',()=>{
 assert.equal(inlineHtml('a <b> & **c** *d*'),'a &lt;b&gt; &amp; <strong>c</strong> <em>d</em>');
 assert.match(sectionHtml({id:'x',title:'T',paragraphs:[{text:'q',quote:true},{heading:'H',text:'p'}],takeaways:['k']}),/<h1>T<\/h1>\n<ul class="takeaways"><li>k<\/li><\/ul>\n<blockquote>q<\/blockquote>\n<h2>H<\/h2>\n<p>p<\/p>/);
});
test('an EPUB starts with its mimetype and lists every section in the spine, right to left for Persian',()=>{
 const files=epubFiles({id:'b1',title:'کتاب',author:'نویسنده',language:'fa',rtl:true,url:'https://x/b/k',note:'n'},[{id:'c1',title:'یک',paragraphs:[{text:'متن'}]},{id:'c2',title:'دو',paragraphs:[]}],{data:new Uint8Array([1]),type:'image/jpeg'});
 assert.deepEqual(files[0],['mimetype','application/epub+zip']);
 const opf=String(files.find(f=>f[0]==='OEBPS/content.opf')![1]);
 assert.match(opf,/page-progression-direction="rtl"/);assert.match(opf,/idref="s1"\/><itemref idref="s2"/);assert.match(opf,/properties="cover-image"/);
 assert.match(String(files.find(f=>f[0]==='OEBPS/s1.xhtml')![1]),/dir="rtl"[\s\S]*<p>متن<\/p>/);
});
