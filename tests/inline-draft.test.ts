import assert from'node:assert/strict';
import test from'node:test';
import type{PubDoc,PubPara}from'../src/types.ts';
import{applyDraft,changedChapterIds,countChanges,diffCount,dropEmpty,emptyHistory,HISTORY,mergePara,overlaps,pushHistory,readScope,redo,scopeName,splitPara,undo}from'../src/inline-draft.ts';
import type{Draft}from'../src/inline-draft.ts';
import{editorProblems}from'../src/replace-import.ts';

const para=(text:string,o:Partial<PubPara>={}):PubPara=>({text,...o});
const doc=():PubDoc=>({title:{fa:'کتاب'},author:'',originalLanguage:'fa',chapters:[{id:'c1',title:{fa:'فصل یک'},group:'main'},{id:'c2',title:{fa:'فصل دو'},group:'main'}],
 versions:[{language:'fa',type:'standard',label:'S',overview:{paragraphs:[para('مقدمه')],takeaways:[para('نکته')]},guide:{type_label:'g',sections:[{kind:'k',title:'راهنما',items:[para('آیتم')]}]},
  chapters:{c1:{paragraphs:[para('یک',{pages:[3]}),para('دو',{pages:[4]})],review:[para('نقد')]},c2:{paragraphs:[para('سه')]}}},
 {language:'en',type:'standard',label:'E',chapters:{c1:{paragraphs:[para('one')]}}}]});
const draft=(changes:Draft['changes']):Draft=>({book:'b',base:'r1',vk:'fa|standard',changes,at:1});

test('a draft replaces only the lists it names and leaves the rest of the document alone',()=>{
 const d=doc(),next=applyDraft(d,draft({'ch:c1:p':[para('**یک**',{pages:[3]})],'t:c2':'فصل دوم','ov:t':[para('تازه')]}));
 assert.equal(next.versions[0].chapters.c1.paragraphs[0].text,'**یک**');
 assert.deepEqual(next.versions[0].chapters.c1.review,d.versions[0].chapters.c1.review);
 assert.equal(next.versions[0].chapters.c2,d.versions[0].chapters.c2);
 assert.equal(next.chapters[1].title.fa,'فصل دوم');assert.equal(d.chapters[1].title.fa,'فصل دو');  // the source is not mutated
 assert.equal(next.versions[0].overview!.takeaways![0].text,'تازه');assert.equal(next.versions[0].overview!.paragraphs[0].text,'مقدمه');
 assert.equal(next.versions[1],d.versions[1]);  // another language is untouched
});
test('guide items, guide title and review scopes',()=>{
 const next=applyDraft(doc(),draft({'g:0':[para('x')],'gt:0':'عنوان','ch:c1:r':[para('y')]}));
 assert.equal(next.versions[0].guide!.sections[0].items[0].text,'x');assert.equal(next.versions[0].guide!.sections[0].title,'عنوان');assert.equal(next.versions[0].chapters.c1.review![0].text,'y');
 assert.equal(readScope(doc(),'fa|standard','gt:0'),'راهنما');assert.equal(readScope(doc(),'fa|standard','t:c1'),'فصل یک');assert.equal(readScope(doc(),'fa|standard','ch:zz:p').length,0);
});
test('re-applying a draft to a newer document keeps the newer edits elsewhere and skips what is gone',()=>{
 const newer=doc();newer.versions[0].chapters.c2.paragraphs[0].text='سه (تغییر کرده)';newer.versions[0].overview!.paragraphs[0].text='مقدمهٔ تازه';
 const d=draft({'ch:c1:p':[para('ویرایش من')],'ch:c9:p':[para('ghost')]});
 const next=applyDraft(newer,d);
 assert.equal(next.versions[0].chapters.c1.paragraphs[0].text,'ویرایش من');assert.equal(next.versions[0].chapters.c2.paragraphs[0].text,'سه (تغییر کرده)');
 assert.equal(next.versions[0].chapters.c9,undefined);
 // Sections both sides changed are named, so the owner is warned.
 const older=doc(),theirs=doc();theirs.versions[0].chapters.c1.paragraphs[0].text='دیگری';
 assert.deepEqual(overlaps(older,theirs,d),['ch:c1:p']);assert.deepEqual(overlaps(older,newer,d),[]);
 assert.equal(scopeName(older,'fa|standard','ch:c1:p'),'فصل یک');
});
test('which chapters changed, and how many changes there are',()=>{
 const c={'ch:c1:p':[],'ch:c1:r':[],'t:c2':'x','ov:p':[],'ov:t':[],'g:0':[]} as Draft['changes'];
 assert.deepEqual(changedChapterIds(c).sort(),['c1','c2','overview']);assert.equal(countChanges(c),6);
 assert.equal(diffCount(doc(),draft({'ch:c1:p':[para('یک',{pages:[3]}),para('دو!',{pages:[4]})],'t:c1':'فصل یک'})),1);
});
test('splitting copies the pages to both halves and keeps the heading on the first',()=>{
 const[l,r]=splitPara(para('hello **big world**',{heading:'H',pages:[5,6],quote:true}),10)!;
 assert.deepEqual(l,{text:'hello **big** ',heading:'H',pages:[5,6],quote:true});assert.deepEqual(r,{text:'**world**',pages:[5,6],quote:true});
 assert.equal(splitPara(para('x',{image:{name:'a.png',alt:''}}),0),null);assert.equal(splitPara(para('x',{table:[['a']]}),0),null);
});
test('merging joins the text (marks included), unites the pages and tells where the caret goes',()=>{
 const m=mergePara(para('one **two**',{pages:[4,2]}),para('**three** four',{pages:[2,9]}))!;
 assert.equal(m.para.text,'one **twothree** four');assert.equal(m.at,7);assert.deepEqual(m.para.pages,[2,4,9]);
 assert.equal(mergePara(para('a'),para('b',{image:{name:'f.png',alt:''}})),null);
});
test('empty paragraphs are dropped before saving and the checks name what is wrong',()=>{
 const d=doc();d.versions[0].chapters.c1.paragraphs.push(para('  '));
 assert.ok(editorProblems(d).includes('Finish or remove empty paragraphs before saving.'));
 const clean=dropEmpty(d);assert.equal(clean.versions[0].chapters.c1.paragraphs.length,2);assert.deepEqual(editorProblems(clean),[]);
 const bad=doc();bad.title={fa:' '};bad.chapters=[];assert.deepEqual(editorProblems(bad).slice(0,2),['Add a title.','Keep at least one chapter.']);
});
test('undo and redo walk whole snapshots, capped at the history size',()=>{
 let h=emptyHistory();let now:Draft['changes']={};
 for(let i=0;i<HISTORY+20;i++){h=pushHistory(h,now);now={...now,['t:c'+i]:'x'};}
 assert.equal(h.past.length,HISTORY);
 const u=undo(h,now)!;assert.equal(countChanges(u.changes),HISTORY+19);
 const r=redo(u.history,u.changes)!;assert.equal(countChanges(r.changes),HISTORY+20);
 assert.equal(undo(emptyHistory(),{}),null);assert.equal(redo(emptyHistory(),{}),null);
 assert.equal(pushHistory(u.history,u.changes).future.length,0);  // a new edit ends the redo line
});
