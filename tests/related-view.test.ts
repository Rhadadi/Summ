import assert from'node:assert/strict';
import test from'node:test';
import type{RelatedBook}from'../src/types.ts';
import{relatedTitle,relatedView,showRating}from'../src/related-view.ts';

const book=(o:Partial<RelatedBook>):RelatedBook=>({title:'Some Book',author:'A. Writer',year:'2001',cover:'c.jpg',url:'https://openlibrary.org/works/OL1W',rating:4.2,why:'',source:'similar',...o});
const L=(t:string)=>'fa:'+t;

test('the dictionary overrides, then the local title, then the original in LTR',()=>{
 assert.deepEqual(relatedTitle(book({title:'The Art of Loving',localTitle:'x'}),'fa'),{title:'هنر عشق‌ورزیدن',original:'The Art of Loving',author:'اریک فروم',ltr:false});
 assert.equal(relatedTitle(book({localTitle:'کتابی',localAuthor:'نویسنده'}),'fa').title,'کتابی');
 assert.equal(relatedTitle(book({titles:{fa:'عنوان کتابخانه'},localTitle:'y'}),'fa').title,'عنوان کتابخانه');
 const plain=relatedTitle(book({}),'fa');assert.equal(plain.title,'Some Book');assert.equal(plain.ltr,true);assert.equal(plain.original,'');
 assert.equal(relatedTitle(book({localTitle:'کتابی'}),'en').title,'Some Book');
});
test('no card is dropped for lacking a Persian title',()=>{
 const cards=relatedView([book({title:'One'}),book({title:'Two'}),book({title:'Three'})],'fa',L);
 assert.equal(cards.length,3);assert.ok(cards.every(c=>c.ltr));
});
test('fewer than two cards hides the shelf',()=>{
 assert.deepEqual(relatedView([],'fa',L),[]);assert.deepEqual(relatedView([book({})],'en',L),[]);
 assert.equal(relatedView([book({title:'A'}),book({title:'B'})],'en',L).length,2);
});
test('books of this library explain themselves in the page language and link by slug',()=>{
 const [a,b]=relatedView([book({slug:'s1',reason:'author',source:'library',url:null}),book({slug:'s2',reason:'subject',subject:'psychology',source:'library',url:null}),book({why:'English why'})],'fa',L);
 assert.equal(a.why,'fa:Also by this author');assert.equal(b.why,'fa:Also about psychology');assert.equal(a.inLibrary,true);assert.equal(a.slug,'s1');
 assert.equal(relatedView([book({why:'English why'}),book({})],'fa',L)[0].why,'');
 assert.equal(relatedView([book({why:'English why'}),book({})],'en',L)[0].why,'English why');
});
test('stars need at least 20 ratings; the shelf holds at most 8',()=>{
 const [a,b]=relatedView([book({rating:4.5,count:19}),book({rating:4.5,count:20})],'en',L);
 assert.equal(showRating(a),false);assert.equal(showRating(b),true);
 assert.equal(relatedView(Array.from({length:12},(_,i)=>book({title:'T'+i})),'en',L).length,8);
});
