import assert from'node:assert/strict';
import test from'node:test';
import{costRange,effectivePrice,estimateBook,estimateChapter,estimateTokens,listPrice,money}from'../src/cost.ts';
import type{Book,BookReport,Chapter,Settings,Summary}from'../src/types.ts';

const settings:Settings={depth:'detailed',purpose:'understand',language:'en',review:'off',fontSize:19,theme:'paper'};
const chapter=(id:string,chars:number):Chapter=>({id,title:id,blocks:Array.from({length:Math.ceil(chars/1000)},(_,i)=>({id:id+'-'+i,text:'word '.repeat(200),location:''}))});
const book=(chapters:Chapter[]):Book=>({id:'b',title:'Book',author:'',format:'PDF',category:'book',chapters,warnings:[],addedAt:0,lastRead:0,chapterIndex:0,completed:[],color:0,hash:'h'});

test('list prices follow the published table and its January 2027 change',()=>{
 assert.deepEqual(listPrice('gemini-3.8-flash',new Date('2026-11-10')),{input:.75,output:3.75});
 assert.deepEqual(listPrice('gemini-3.8-flash',new Date('2027-02-01')),{input:1.5,output:7.5});
 assert.equal(listPrice('gemini-3.5-flash-lite')?.input,.3);
 assert.ok(listPrice('gemini-flash-latest')?.note);
 assert.equal(listPrice('some-unknown-model'),null);
 assert.deepEqual(effectivePrice({hint:'abcd',model:'gemini-3.8-flash',price_in:1,price_out:2}),{input:1,output:2,note:'Using the prices you entered.'});
});

test('Gemini Pro Latest shows a whole-book dollar estimate and accepts custom rates',()=>{
 const key={hint:'abcd',model:'gemini-pro-latest',price_in:null,price_out:null};
 const price=effectivePrice(key);
 assert.ok(price);
 assert.equal(price.input,2);
 assert.equal(price.output,12);
 const range=costRange({input:914036,output:170921},price);
 assert.deepEqual([range.likely,range.low,range.high].map(money),['$4.70','$3.70','$6.20']);
 assert.deepEqual(effectivePrice({...key,price_in:1,price_out:8}),{input:1,output:8,note:'Using the prices you entered.'});
});

test('non-Latin text counts as more tokens per character',()=>{
 assert.equal(estimateTokens('abcd'.repeat(100)),100);
 assert.ok(estimateTokens('این یک مثال است'.repeat(20))>estimateTokens('this is a test!'.repeat(20)));
});

test('short chapters cost two calls; long chapters add inventory batches',()=>{
 const short=estimateChapter(chapter('s',10000),settings);assert.equal(short.calls,2);
 const long=estimateChapter(chapter('l',100000),settings);assert.ok(long.calls>2);assert.ok(long.input>short.input*5);
 assert.ok(estimateChapter(chapter('s',10000),{...settings,depth:'close'}).output>estimateChapter(chapter('s',10000),{...settings,depth:'glance'}).output);
});

test('book estimates skip chapters the saved report already holds',()=>{
 const source=book([chapter('a',30000),chapter('b',30000)]);
 const done:Summary={paragraphs:[{text:'Summary.',evidence_ids:['a-0']}],review:[],processed_blocks:1,total_blocks:1,language:'en',mode:'ai',checked:true};
 const report:BookReport={model:'m',language:'en',createdAt:0,updatedAt:0,parts:{},chapters:{a:done}};
 assert.ok(estimateBook(source,settings,report).input<estimateBook(source,settings).input);
 assert.equal(estimateBook(source,settings,{...report,chapters:{a:done,b:done},overview:{paragraphs:[],takeaways:[],checked:true,language:'en',model:'m'},guide:{type:'fiction',type_label:'Fiction',sections:[],model:'m'}}).calls,0);
});

test('cost ranges bracket the likely value and format readably',()=>{
 const range=costRange({input:1_000_000,output:100_000},{input:1,output:10});
 assert.ok(range.low<range.likely&&range.likely<range.high);assert.equal(money(range.likely),'$2.40');assert.equal(money(.004),'< $0.01');
});
