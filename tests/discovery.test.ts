import assert from 'node:assert/strict';
import test from 'node:test';
import {matchesBook,normalizeSearch,publicTitle} from '../src/discovery.ts';
import {validPlace,partTitle} from '../src/listening.ts';
import type {PubBook} from '../src/types.ts';
const book={id:'test',slug:'test',visibility:'public',cover:null,updated:1,languages:['fa'],types:['detailed'],chapters:6,title:'Midlife',titles:{fa:'میان‌سالی',en:'Midlife'},author:'Kieran Setiya'} as PubBook;
test('public search matches translated titles, normalized Persian and author',()=>{
 for(const q of ['Midlife','MIDLife','ميان سالي','میان‌سالی','Kieran','Setiya'])assert.ok(matchesBook(book,q),q);
 assert.ok(!matchesBook(book,'zzzz-no-book'));assert.ok(matchesBook(book,''));
 assert.equal(normalizeSearch('كِتاب'),'کتاب');assert.equal(publicTitle(book,'fa'),'میان‌سالی');
});
test('audio resume rejects changed publications and malformed storage',()=>{
 const p={signature:'a',index:1,seconds:4,rate:1.25};assert.deepEqual(validPlace(p,'a',2),p);
 for(const v of [null,{}, {...p,index:5},{...p,seconds:-1},{...p,seconds:Infinity},{...p,rate:0},{...p,signature:'old'}])assert.equal(validPlace(v,'a',2),null);
});
test('playlist distinguishes chunks without renaming unique chapters',()=>{
 const tracks=[{title:'Overview',chapterId:null},{title:'فصل',chapterId:'c1'},{title:'فصل',chapterId:'c1'}];
 assert.equal(partTitle(tracks,0,'fa'),'مرور کلی');assert.equal(partTitle(tracks,1,'fa'),'فصل — بخش ۱ از ۲');assert.equal(partTitle(tracks,2,'fa'),'فصل — بخش ۲ از ۲');
});
