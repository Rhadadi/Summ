import assert from'node:assert/strict';
import test from'node:test';
import type{Review}from'../src/types.ts';
import{originalFor,quoteFor,quoteIsForeign,receptionView,splitVerdict,year}from'../src/reception-view.ts';

const base=():Review=>({verdict:'',pros:[],cons:[],quotes:[],sources:[],rating:null,model:'',createdAt:0});
const critic=(o:Partial<NonNullable<Review['critics']>[number]>)=>({publication:'P',reviewer:'',date:'',headline:'',stance:'' as const,excerpt:'',summary:'',url:null,...o});

test('the first sentence leads; a very short opening joins the next',()=>{
 assert.deepEqual(splitVerdict('A vivid, widely admired book. Some find it uneven. Most disagree.'),{lead:'A vivid, widely admired book.',rest:'Some find it uneven. Most disagree.'});
 assert.equal(splitVerdict('Yes. A rich and careful study of grief that many return to.').rest,'');
 assert.equal(splitVerdict('کتابی تأثیرگذار است؟ بله. بسیاری آن را ستوده‌اند.').lead,'کتابی تأثیرگذار است؟');
 assert.deepEqual(splitVerdict(''),{lead:'',rest:''});
});
test('the featured critic is verified, quoted and positive or mixed; else the first quoted',()=>{
 const r={...base(),critics:[critic({publication:'A',excerpt:'plain quote',stance:'positive'}),critic({publication:'B',excerpt:'a verified quote',stance:'negative',verified:true}),critic({publication:'C',excerpt:'verified and mixed',stance:'mixed',verified:true}),critic({publication:'D',summary:'only a summary'})]};
 const v=receptionView(r,[],'en');
 assert.equal(v.featured?.publication,'C');
 // verified first, then quoted, then summary-only; the featured card is not repeated
 assert.deepEqual(v.others.map(c=>c.publication),['B','A','D']);
 const neg=receptionView({...base(),critics:[critic({publication:'N',excerpt:'harsh',stance:'negative'})]},[],'en');
 assert.equal(neg.featured?.publication,'N');
 assert.equal(receptionView({...base(),critics:[critic({summary:'s'})]},[],'en').featured,null);
});
test('sources drop links already on cards or chips; scores merge, dedupe and cap at 3',()=>{
 const r={...base(),critics:[critic({url:'https://nyt.example/review/1',excerpt:'q'})],readers:[{name:'R',stars:5,excerpt:'x',summary:'',url:'https://gr.example/review/7'}],
  ratings:[{value:4.1,source:'Goodreads',count:900,url:'https://gr.example/book/1'}],sources:[{name:'NYT',url:'https://nyt.example/review/1'},{name:'Wiki',url:'https://en.wikipedia.org/wiki/Book'},{name:'Search',url:'https://x.example/search?q=a'}]};
 const v=receptionView(r,[{value:4.1,source:'goodreads',count:5,url:null},{value:4.4,source:'Audible',count:30,url:null},{value:3.9,source:'StoryGraph',count:9,url:null},{value:3,source:'Fourth',count:1,url:null}],'en');
 assert.deepEqual(v.sources.map(s=>s.name),['Wiki']);
 assert.deepEqual(v.scores.map(s=>s.source),['Goodreads','Audible','StoryGraph']);
});
test('year and quote choice follow the language',()=>{
 assert.equal(year('February 24, 2008','en'),'2008');assert.equal(year('2008-02-24','fa'),'۲۰۰۸');assert.equal(year('last spring','en'),'');
 const c={excerpt:'The excerpt.',translation:'ترجمه'};
 assert.equal(quoteFor(c,'fa'),'ترجمه');assert.equal(originalFor(c,'fa'),'The excerpt.');assert.equal(quoteFor(c,'en'),'The excerpt.');assert.equal(originalFor(c,'en'),'');
 assert.equal(quoteFor({excerpt:'Only English.'},'fa'),'Only English.');assert.equal(quoteIsForeign({excerpt:'Only English.'},'fa'),true);assert.equal(quoteIsForeign(c,'fa'),false);
});
test('top three points plus the full list, and what counts as empty',()=>{
 const v=receptionView({...base(),pros:['a','b','c','d'],cons:['x']},[],'en');
 assert.deepEqual(v.praise.top,['a','b','c']);assert.equal(v.praise.all.length,4);assert.equal(v.criticism.top.length,1);assert.equal(v.isEmpty,false);
 assert.equal(receptionView(null,[],'en').isEmpty,true);assert.equal(receptionView(base(),[],'en').isEmpty,true);
 assert.equal(receptionView(null,[{value:4,source:'Open Library',count:30,url:null}],'en').isEmpty,false);
 assert.equal(receptionView({...base(),quotes:[{text:'old',who:'W',source:'',url:null}]},[],'en').isEmpty,false);
});
