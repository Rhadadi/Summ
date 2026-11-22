import assert from'node:assert/strict';
import test from'node:test';
import{readFileSync}from'node:fs';
import{clearMarks,concatSpans,hasMark,parseInline,plainInline,serializeInline,snapToWords,splitSpans,spansToHtml,toggleMark}from'../src/inline.ts';
import type{Span}from'../src/inline.ts';

const fixtures=JSON.parse(readFileSync(new URL('./fixtures/inline.json',import.meta.url),'utf8')) as{cases:{in:string;spans:Span[];plain:string;out:string}[]};
test('every shared fixture parses, strips and serializes as written',()=>{
 for(const c of fixtures.cases){
  assert.deepEqual(parseInline(c.in),c.spans,c.in);
  assert.equal(plainInline(c.in),c.plain,c.in);
  assert.equal(serializeInline(c.spans),c.out,c.in);
  assert.deepEqual(parseInline(serializeInline(c.spans)),c.spans,'round trip '+c.in);
 }
});
test('toggling bold over a selection and back',()=>{
 const sp=parseInline('one two three');
 const on=toggleMark(sp,4,7,'b');
 assert.equal(serializeInline(on),'one **two** three');
 assert.ok(hasMark(on,4,7,'b'));assert.ok(!hasMark(on,0,7,'b'));
 assert.equal(serializeInline(toggleMark(on,4,7,'b')),'one two three');
 // Partly bold: bold the rest of it first.
 assert.equal(serializeInline(toggleMark(on,0,7,'b')),'**one two** three');
});
test('italic inside bold nests, and crossing marks are cut to nest',()=>{
 const sp=toggleMark(toggleMark(parseInline('aa bb cc dd'),0,5,'b'),3,11,'i');
 const text=serializeInline(sp);
 assert.equal(text,'**aa *bb*** *cc dd*');
 assert.equal(plainInline(text),'aa bb cc dd');
 assert.equal(serializeInline(parseInline(text)),text);
});
test('clear formatting and splitting keep the marks on each side',()=>{
 const sp=parseInline('**one two** *three*');
 assert.equal(serializeInline(clearMarks(sp,0,7)),'one two *three*');
 const[l,r]=splitSpans(sp,4);
 assert.equal(serializeInline(l),'**one** ');assert.equal(serializeInline(r),'**two** *three*');
 assert.equal(serializeInline(concatSpans(l,r)),'**one two** *three*');
});
test('marks are never left inside a word or against a space',()=>{
 assert.equal(serializeInline(toggleMark(parseInline('abcdef ghi'),2,4,'b')),'**abcdef** ghi');
 assert.equal(serializeInline(toggleMark(parseInline('one two'),0,4,'b')),'**one** two');
 assert.deepEqual(snapToWords('abc def',1,2),[0,3]);
 assert.deepEqual(snapToWords('abc def',3,5),[4,7]);
});
test('persian words keep their half-spaces',()=>{
 const t='می‌خواهم این را';
 assert.equal(serializeInline(toggleMark(parseInline(t),0,8,'b')),'**می‌خواهم** این را');
});
test('html is escaped and nested strong around em',()=>{
 assert.equal(spansToHtml(parseInline('a <b> & **x *y***')),'a &lt;b&gt; &amp; <strong>x </strong><strong><em>y</em></strong>');
 assert.equal(spansToHtml([{text:'"q\'',i:true}]),'<em>&quot;q&#39;</em>');
});
test('random formatting always reads back the same',()=>{
 let seed=7;const rnd=(n:number)=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed%n;};
 const words=['alpha','beta','گاما','دلتا','x*y','a\\b','one'];
 for(let k=0;k<300;k++){
  const text=Array.from({length:2+rnd(6)},()=>words[rnd(words.length)]).join(' ');
  let sp:Span[]=parseInline(text.replace(/[*\\]/g,m=>'\\'+m));
  for(let j=0;j<rnd(4);j++){const a=rnd(text.length),z=a+1+rnd(text.length-a);[sp]=[toggleMark(sp,...snapToWords(text,a,z),rnd(2)?'b':'i')];}
  const s=serializeInline(sp);
  const back=parseInline(s);
  assert.equal(back.map(x=>x.text).join(''),text,'text of '+s);
  assert.equal(serializeInline(back),s,'stable '+s);
 }
});
