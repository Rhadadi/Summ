import assert from'node:assert/strict';
import test from'node:test';
import type{PubDoc}from'../src/types.ts';
import{applyReplacement,defaultPlan,parseSummaries,publishProblems}from'../src/replace-import.ts';

const doc=():PubDoc=>({title:{fa:'کتاب آزمایشی',en:'A Test Book'},author:'A',originalLanguage:'en',
 chapters:[{id:'c1',title:{fa:'فصل نخست',en:'First chapter'},group:'main'},{id:'c2',title:{fa:'فصل دوم',en:'Second chapter'},group:'main'}],
 versions:[{language:'fa',type:'detailed',label:'Detailed',overview:{paragraphs:[{text:'نمای کلی قدیمی'}],takeaways:[{text:'نکتهٔ قدیمی'}]},
  chapters:{c1:{paragraphs:[{text:'خلاصهٔ قدیمی فصل یک'}],review:[{text:'نقد قدیمی'}]},c2:{paragraphs:[{text:'خلاصهٔ قدیمی فصل دو'}]}}}]});
const md='=== INKLING: type=detailed; language=fa ===\n\n# کتاب آزمایشی\n\n## نمای کلی\n\nنمای کلی تازه دربارهٔ کتاب.\n\n## فصل ۱: نخست\n\nعنوان اصلی: First chapter\n\nخلاصهٔ تازهٔ فصل یک که متن بلندتری دارد.\n\n## فصل ۲: دوم\n\nعنوان اصلی: Second chapter\n\nخلاصهٔ تازهٔ فصل دو.\n\nبند دوم از فصل دو.';
const summary=()=>parseSummaries([{name:'summary.md',markdown:md}])[0];

test('a ZIP summary is matched to the published chapters and the same version',()=>{
 const s=summary(),plan=defaultPlan(doc(),s);
 assert.equal(plan.target,0);
 assert.deepEqual(plan.chapters,['c1','c2']);
 assert.ok(plan.overview);
});
test('only what is ticked is replaced; the rest of the book stays as it was',()=>{
 const s=summary(),plan={...defaultPlan(doc(),s),chapters:['','c2'],takeaways:false};
 const r=applyReplacement(doc(),s,[],'summary.md',plan);
 const v=r.doc.versions[0];
 assert.equal(v.chapters.c1.paragraphs[0].text,'خلاصهٔ قدیمی فصل یک'); // not ticked: unchanged
 assert.equal(v.chapters.c1.review?.[0].text,'نقد قدیمی');
 assert.equal(v.chapters.c2.paragraphs.length,2);                       // ticked: replaced
 assert.match(v.chapters.c2.paragraphs[0].text,/تازهٔ فصل دو/);
 assert.match(v.overview!.paragraphs[0].text,/نمای کلی تازه/);          // the overview was ticked
 assert.equal(v.overview!.takeaways![0].text,'نکتهٔ قدیمی');            // the key ideas were not
});
test('the summary can be added as another version instead of replacing one',()=>{
 const s=summary(),r=applyReplacement(doc(),s,[],'summary.md',{...defaultPlan(doc(),s),target:'new'});
 assert.equal(r.doc.versions.length,2);assert.equal(r.versionIndex,1);
 assert.notEqual(r.doc.versions[1].type,r.doc.versions[0].type);       // two versions never share a language and style
 assert.match(r.doc.versions[0].chapters.c1.paragraphs[0].text,/قدیمی/);
});
test('a refusal-to-be is described before publishing, in plain words',()=>{
 const d=doc();d.versions[0].chapters.c2.paragraphs=Array.from({length:401},(_,i)=>({text:'بند '+i}));
 const problems=publishProblems(d);
 assert.equal(problems.length,1);assert.match(problems[0],/chapter 2\. فصل دوم has 401 paragraphs; at most 400/);
 d.versions[0].chapters.c2.paragraphs.length=237;assert.deepEqual(publishProblems(d),[]);
});
