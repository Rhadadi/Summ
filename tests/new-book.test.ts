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

test('an introduction is required and very brief chapters are flagged for review',()=>{
 const s=source(),chapters=defaultChapters(s);
 s.versions[0].report.overview=undefined;
 const result=compose(s,chapters,proposal());
 assert.ok(result.problems.some(problem=>problem.includes('Add an overview')));
 assert.ok(result.warnings.some(warning=>warning.includes('brief chapter summaries')));
 assert.ok(!compose(s,chapters,proposal({info:{...proposal().info,description:'شرحی کوتاه از کتاب و موضوع اصلی آن.'}})).problems.some(problem=>problem.includes('Add an overview')));
});

test('images in nested summaries resolve relative to their own Markdown file',()=>{
 const first='=== INKLING: type=brief; language=fa ===\n# کتاب آزمایشی\n## فصل ۱: آغاز\n\nمتن فارسی.\n\n![نمودار](figure.png)';
 const second='=== INKLING: type=detailed; language=fa ===\n# کتاب آزمایشی\n## فصل ۱: آغاز\n\nمتن بیشتر.\n\n![نمونه](figure.png)';
 const docs=[{name:'short/brief.md',markdown:first},{name:'long/detailed.md',markdown:second}];
 const images=[{path:'short/figure.png',type:'image/png',data:new ArrayBuffer(3)},{path:'long/figure.png',type:'image/png',data:new ArrayBuffer(3)}];
 const s=sourceFromZip(parseSummaries(docs),images,docs[0].name,1000);
 assert.equal(s.versions.find(v=>v.type==='brief')?.report.chapters.z0.paragraphs.find(p=>p.image)?.image?.path,'short/figure.png');
 assert.equal(s.versions.find(v=>v.type==='detailed')?.report.chapters.z0.paragraphs.find(p=>p.image)?.image?.path,'long/figure.png');
});

test('a mixed-language ZIP publishes only Persian versions and keeps chapter matching by title',()=>{
 const first='=== INKLING: type=comprehensive; language=fa ===\n# کتاب آزمایشی\n## فصل ۱: آغاز\nعنوان اصلی: Opening\n\nخلاصهٔ روشن آغاز.\n## فصل ۲: ادامه\nعنوان اصلی: Continuation\n\nخلاصهٔ روشن ادامه.';
 const reordered='=== INKLING: type=brief; language=fa ===\n# کتاب آزمایشی\n## فصل ۲: ادامه\nعنوان اصلی: Continuation\n\nخلاصهٔ کوتاه ادامه.\n## فصل ۱: آغاز\nعنوان اصلی: Opening\n\nخلاصهٔ کوتاه آغاز.';
 const english='=== INKLING: type=detailed; language=en ===\n# A Test Book\n## Chapter 1: Opening\n\nAn English version that should not be public.';
 const s=sourceFromZip(parseSummaries([{name:'bundle.md',markdown:[first,reordered,english].join('\n')}]),[],'bundle.md',1000);
 assert.equal(s.versions.length,2);
 assert.ok(s.book.warnings.some(w=>w.includes('English summary versions')));
 const brief=s.versions.find(v=>v.type==='brief')!;
 assert.equal(brief.report.chapters.z0.paragraphs[0].text,'خلاصهٔ کوتاه آغاز.');
 assert.equal(brief.report.chapters.z1.paragraphs[0].text,'خلاصهٔ کوتاه ادامه.');
 assert.deepEqual(compose(s,defaultChapters(s),proposal({info:{...proposal().info,description:'معرفی کوتاه کتاب و مضمون آن.'}})).problems,[]);
});

test('unmatched chapters and a one-chapter ZIP are reported before publication',()=>{
 const full='=== INKLING: type=comprehensive; language=fa ===\n# کتاب آزمایشی\n## فصل ۱: آغاز\n\nمتن آغاز.\n## فصل ۲: پایان\n\nمتن پایان.';
 const partial='=== INKLING: type=brief; language=fa ===\n# کتاب آزمایشی\n## فصل ۱: آغاز\n\nمتن کوتاه آغاز.';
 const s=sourceFromZip(parseSummaries([{name:'partial.md',markdown:full+'\n'+partial}]),[],'partial.md',1000);
 assert.ok(s.book.warnings.some(w=>w.includes('could not match 1')));
 assert.ok(compose(s,defaultChapters(s),proposal()).problems.some(x=>x.includes('missing a written summary')));
 const one=sourceFromZip(parseSummaries([{name:'one.md',markdown:partial}]),[],'one.md',1000);
 assert.ok(one.book.warnings.some(w=>w.includes('Only one chapter')));
});

test('one Persian chapter cannot hide a fuller English outline in the same ZIP',()=>{
 const fa='=== INKLING: type=brief; language=fa ===\n# کتاب آزمایشی\n## فصل ۱: آغاز\n\nمتن فارسی.';
 const en='=== INKLING: type=brief; language=en ===\n# A Test Book\n## Chapter 1: Start\n\nStart.\n## Chapter 2: Middle\n\nMiddle.\n## Chapter 3: End\n\nEnd.';
 const s=sourceFromZip(parseSummaries([{name:'mixed.md',markdown:fa+'\n'+en}]),[],'mixed.md',1000);
 assert.equal(s.book.chapters.length,1);
 assert.ok(compose(s,defaultChapters(s),proposal()).problems.some(p=>p.includes('missing Persian chapters')));
});

test('substantial English prose in Persian reader fields blocks publication',()=>{
 const s=source(),choices=defaultChapters(s),english='The author explains at length why the relationship changes over time and gives several examples from everyday life.';
 let result=compose(s,choices,proposal({info:{...proposal().info,description:english}}));
 assert.deepEqual(result.problems,[]); // The Persian overview is visible instead of this catalogue fallback.
 s.versions[0].report.overview=undefined;
 result=compose(s,choices,proposal({info:{...proposal().info,description:english}}));
 assert.ok(result.problems.some(p=>p.includes('book description')));
 s.versions[0].report.chapters.z1.paragraphs[0].text=english;
 result=compose(s,choices,proposal());
 assert.ok(result.problems.some(p=>p.includes('Chapter')));
 s.versions[0].report.chapters.z1.paragraphs[0].text='The author explains how love changes over time.';
 result=compose(s,choices,proposal());
 assert.ok(result.problems.some(p=>p.includes('Chapter')));
});

test('English author names stay valid, while an approved English reception needs translation',()=>{
 const s=source(),choices=defaultChapters(s),english='Critics found the book engaging because its examples are clear, but several chapters repeat the same argument without adding evidence.';
 const review={verdict:english,pros:[],cons:[],quotes:[],sources:[],rating:null,model:'m',createdAt:1};
 assert.deepEqual(compose(s,choices,proposal({author:'John M. Gottman',review,reviewApproved:false})).problems,[]);
 assert.ok(compose(s,choices,proposal({author:'John M. Gottman',review,reviewApproved:true})).problems.some(p=>p.includes('reception verdict')));
});

test('public Persian book and chapter titles need Persian wording',()=>{
 const s=source(),choices=defaultChapters(s);
 assert.ok(compose(s,choices,proposal({title:'Midlife'})).problems.some(p=>p.includes('public book title')));
 choices[1].title='First chapter';
 assert.ok(compose(s,choices,proposal()).problems.some(p=>p.includes('needs a Persian title')));
});
