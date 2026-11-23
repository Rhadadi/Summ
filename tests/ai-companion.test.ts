import test from'node:test';import assert from'node:assert/strict';
import{systemPrompt,chapterText,starters}from'../src/ai-prompt.ts';

const ctx={bookTitle:'Can Love Last?',author:'Stephen Mitchell',chapterTitle:'Security and Adventure',lang:'fa',paragraphs:[{heading:'Home',text:'**Romance** fades as safety grows.'},{text:'Second *point*.'}],takeaways:['Desire needs distance.']};
test('the prompt carries the book, the chapter text without markers, and the mode',()=>{
 const s=systemPrompt(ctx,'quiz');
 assert.match(s,/"Can Love Last\?" by Stephen Mitchell: "Security and Adventure"/);
 assert.match(s,/<chapter_summary>\n## Home\nRomance fades as safety grows\.\n\nSecond point\.\n<\/chapter_summary>/);
 assert.match(s,/Quiz the reader/);assert.match(s,/Reply in Persian/);assert.match(s,/- Desire needs distance\./);
 assert.doesNotMatch(s.slice(s.indexOf('<chapter_summary>')),/\*/);
 assert.match(systemPrompt({...ctx,lang:'en',takeaways:[]},'explain'),/Reply in the language the reader writes in/);
});
test('the chapter comes last, so the instructions stay the same from chapter to chapter',()=>{
 assert.ok(systemPrompt(ctx,'explain').trimEnd().endsWith('</chapter_summary>'));
 assert.equal(chapterText({...ctx,paragraphs:[]}),'');
});
test('starter questions follow the page language',()=>{assert.match(starters('fa')[0],/ایده/);assert.match(starters('en')[0],/main idea/);});
