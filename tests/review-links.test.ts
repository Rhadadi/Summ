import assert from'node:assert/strict';
import test from'node:test';
import type{Review}from'../src/types.ts';
import{directReviewPage,reviewSourceLinks}from'../src/review-links.ts';

test('read more contains only direct pages found for this book',()=>{
 const review={sources:[
  {name:'Goodreads search',url:'https://www.goodreads.com/search?q=%DA%A9%D8%AA%D8%A7%D8%A8'},
  {name:'NYT search',url:'https://www.nytimes.com/search?query=book'},
  {name:'Guardian search',url:'https://www.theguardian.com/search?q=book'},
  {name:'Goodreads',url:'https://www.goodreads.com/book/show/195458572-the-triathlete-s-training-bible'},
 ],critics:[{publication:'IMPACT',url:'https://impactmagazine.ca/gear/gear-reviews/the-triathletes-training-bible/'}]} as Review;
 assert.deepEqual(reviewSourceLinks(review).map(x=>x.name),['Goodreads','IMPACT']);
 assert.deepEqual(reviewSourceLinks(null),[]);
 assert.equal(directReviewPage('https://www.theguardian.com/books/2024/example'),true);
});
