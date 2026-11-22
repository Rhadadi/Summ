import test from'node:test';
import assert from'node:assert/strict';
import{homeBooks,homeOrder,wallBooks}from'../src/home-order.ts';
import type{HomeConfig,PubBook}from'../src/types.ts';

const book=(id:string)=>({id,title:id})as unknown as PubBook;
const books=Array.from({length:13},(_,i)=>book('b'+i));
const cfg=(slides:HomeConfig['slides'])=>({seconds:3,slides,shelf:true,stars:true,autoplay:true,title:'',text:''})as HomeConfig;

test('the wall shows every book, not just the first 8 or 12',()=>{
 assert.equal(wallBooks(books,null).length,13);
});
test('unticked books leave the slideshow but stay on the wall',()=>{
 const c=cfg([{id:'b3',hidden:true,seconds:null},{id:'b1',hidden:false,seconds:null}]);
 assert.equal(homeBooks(books,c).some(b=>b.id==='b3'),false);
 assert.equal(wallBooks(books,c).some(b=>b.id==='b3'),true);
 assert.equal(wallBooks(books,c).length,13);
});
test('the wall follows the configured order, then the rest',()=>{
 const c=cfg([{id:'b5',hidden:false,seconds:null},{id:'b2',hidden:true,seconds:null}]);
 assert.deepEqual(wallBooks(books,c).slice(0,3).map(b=>b.id),['b5','b2','b0']);
 assert.deepEqual(homeOrder(books,c).map(b=>b.id),wallBooks(books,c).map(b=>b.id));
});
test('homeBooks keeps its order and indexes (they pick the automatic paintings)',()=>{
 const c=cfg([{id:'b2',hidden:true,seconds:null},{id:'b4',hidden:false,seconds:null}]);
 assert.deepEqual(homeBooks(books,c).slice(0,3).map(b=>b.id),['b4','b0','b1']);
 assert.equal(homeBooks(books,null).length,13);
});
