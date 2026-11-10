import assert from'node:assert/strict';
import test from'node:test';
import{cleanPages,tidy}from'../src/pdf-clean.ts';

const body=(text:string)=>({text,size:10});
const note=(text:string)=>({text,size:8});

test('running heads and page numbers are dropped; footnotes are marked',()=>{
 const words=['first','second','third','fourth','fifth','sixth'];
 const pages=[1,2,3,4,5,6].map(n=>[body(n%2?'Sex as Crime   '+(130+n):(130+n)+'   Law Beyond Israel'),body('The '+words[n-1]+' page carries a long body paragraph about '+words[n-1]+' matters, written in the main type of the book.'),note(n+' Note on '+words[n-1]+'.'),body(String(n))]);
 const out=cleanPages(pages);
 assert.ok(out.flat().every(b=>!/Law Beyond Israel|Sex as Crime/.test(b.text)));
 assert.ok(out.flat().every(b=>!/^\d+$/.test(b.text)));
 assert.deepEqual(out[0].map(b=>!!b.note),[false,true]);
});

test('a paragraph split by a page break, even across a footnote, is rejoined',()=>{
 const out=cleanPages([[body('The argument begins here and contin-'),note('1 A note.')],[body('ues on the next page.'),body('A new paragraph.')]]);
 assert.equal(out[0][0].text,'The argument begins here and continues on the next page.');
 assert.deepEqual(out[1].map(b=>b.text),['A new paragraph.']);
});

test('line breaks, hyphenation and detached diacritics are repaired',()=>{
 assert.equal(tidy('pro-\nhibition of fāh ̣ isha,\n and more'),'prohibition of fāḥisha, and more');
});
