import test from'node:test';import assert from'node:assert/strict';
import{bookCategories,categoryCounts,inferCategories}from'../src/categories.ts';
test('categories are guessed from English or Persian subjects, in list order, at most three',()=>{
 assert.deepEqual(inferCategories(['PHILOSOPHY / Ethics','Quantum theory']),['philosophy','science']);
 assert.deepEqual(inferCategories(['تاریخ اسلام']),['religion','history']);
 assert.deepEqual(inferCategories(['روان‌شناسی','عشق','فلسفه','تاریخ']),['philosophy','psychology','history']);
 assert.deepEqual(inferCategories([]),[]);
});
test('a word inside a longer word does not count for health (شناسی is not شنا)',()=>{assert.deepEqual(inferCategories(['هستی‌شناسی']),['philosophy']);});
test("the editor's choice wins; an empty or unknown choice falls back to the guess",()=>{
 assert.deepEqual(bookCategories({categories:['health'],tags:['Philosophy']}),['health']);
 assert.deepEqual(bookCategories({categories:[],tags:['Philosophy']}),['philosophy']);
 assert.deepEqual(bookCategories({categories:['nope'],tags:['Philosophy']}),['philosophy']);
});
test('counts list only categories that hold a book',()=>{
 const c=categoryCounts([{tags:['Philosophy']},{categories:['philosophy','history']},{tags:['nothing here']}]);
 assert.deepEqual(c.map(x=>[x.category.id,x.count]),[['philosophy',2],['history',1]]);
});
