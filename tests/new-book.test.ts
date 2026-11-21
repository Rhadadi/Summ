import assert from'node:assert/strict';
import test from'node:test';
import{parseSummaries}from'../src/replace-import.ts';
import{compose,defaultChapters,hasOverview,identifyText,leadLanguage,overviewSource,sourceFromZip,type Proposal}from'../src/new-book.ts';

const md='=== INKLING: type=comprehensive; language=fa ===\n\n# کتاب آزمایشی\n\n## مرور کلی\n\nنمای کلی دربارهٔ کتاب.\n\n## مقدمه: آغاز\nOriginal title: Introduction\n\nمتن مقدمه.\n\n## 1. فصل نخست\nOriginal title: First chapter\n\nخلاصهٔ فصل یک.\n\nبند دوم فصل یک.\n\n## 2. فصل دوم\nOriginal title: Second chapter\n\nخلاصهٔ فصل دو.';
const source=()=>sourceFromZip(parseSummaries([{name:'summary.md',markdown:md}]),[],'summary.md',1000);
const proposal=(patch:Partial<Proposal>={}):Proposal=>({title:'کتاب آزمایشی',originalTitle:'A Test Book',author:'A. Writer',info:{year:'2010',publisher:'P',pages:300,description:'',categories:['Religion']},overviews:{},review:null,reviewApproved:false,...patch});

test('a summary ZIP becomes a book whose chapters are the summary chapters',()=>{
 const s=source();
 assert.equal(leadLanguage(s),'fa');
 assert.equal(s.book.chapters.length,3);
 assert.ok(hasOverview(s));
 const chapters=defaultChapters(s);
 assert.deepEqual(chapters.map(c=>c.include),[true,true,true]);
 assert.match(identifyText(s),/First chapter/);
 assert.match(overviewSource(s,chapters),/خلاصهٔ فصل یک/);
});
test('the published document follows the chapter step: left out, renamed, regrouped, reordered',()=>{
 const s=source(),chapters=defaultChapters(s);
 chapters[0].group='front';chapters[2].title='فصل دوم، با نام تازه';chapters[1].include=false;
 chapters.reverse();
 const{doc,problems}=compose(s,chapters,proposal());
 assert.deepEqual(problems,[]);
 assert.equal(doc.chapters.length,2);
 assert.equal(doc.chapters[0].title.fa,'فصل دوم، با نام تازه');
 assert.equal(doc.chapters[1].group,'front');
 assert.equal(doc.title.fa,'کتاب آزمایشی');assert.equal(doc.title.en,'A Test Book');
 assert.equal(doc.author,'A. Writer');assert.equal(doc.info?.year,'2010');
 assert.equal(doc.versions[0].type,'comprehensive');
});
test('an edited overview replaces the one from the ZIP; a review is published only when approved',()=>{
 const s=source(),chapters=defaultChapters(s);
 const review={verdict:'خوب',pros:[],cons:[],quotes:[],sources:[],rating:null,model:'m',createdAt:1};
 let r=compose(s,chapters,proposal({overviews:{0:[{text:'نمای کلی ویرایش‌شده'}]},review}));
 assert.equal(r.doc.versions[0].overview?.paragraphs[0].text,'نمای کلی ویرایش‌شده');
 assert.equal(r.doc.review,undefined);
 r=compose(s,chapters,proposal({review,reviewApproved:true}));
 assert.equal(r.doc.review?.verdict,'خوب');
 assert.ok(r.chars.fa>10);
});
test('nothing to publish is said plainly',()=>{
 const s=source(),chapters=defaultChapters(s).map(c=>({...c,include:false}));
 assert.deepEqual(compose(s,chapters,proposal({title:' '})).problems,['Choose at least one chapter to publish.','Add a title.']);
});
