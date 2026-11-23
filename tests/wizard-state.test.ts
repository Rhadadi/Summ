import assert from'node:assert/strict';
import test from'node:test';
import{parseSummaries}from'../src/replace-import.ts';
import{compose,defaultChapters,sourceFromZip,type Proposal}from'../src/new-book.ts';
import{applyChapterEdits,chapterEditKey,withChapterParagraphs}from'../src/wizard-state.ts';

const markdown='=== INKLING: type=brief; language=fa ===\n# کتاب آزمایشی\n## فصل ۱: آغاز\n\nخلاصهٔ آغاز.\n## فصل ۲: پایان\n\nخلاصهٔ پایان.';
const source=()=>sourceFromZip(parseSummaries([{name:'summary.md',markdown}]),[],'summary.md',1000);
const proposal:Proposal={title:'کتاب آزمایشی',originalTitle:'Test Book',author:'A. Writer',info:{year:'2020',publisher:'',pages:null,description:'معرفی کوتاه کتاب و مضمون آن.',categories:[]},overviews:{},review:null,reviewApproved:false};

test('manual chapter text survives a saved-draft reparse and reaches the reader document',()=>{
 const before=source(),version=before.versions[0],chapter=before.book.chapters[1];
 const edited=[{text:'پایان تازه با جزئیات بیشتر.',evidence_ids:[]}];
 const changed=withChapterParagraphs(before,version.id,chapter.id,edited);
 assert.equal(changed.versions[0].report.chapters[chapter.id].paragraphs[0].text,edited[0].text);
 assert.equal(before.versions[0].report.chapters[chapter.id].paragraphs[0].text,'خلاصهٔ پایان.');
 const restored=applyChapterEdits(source(),{[chapterEditKey(version.id,chapter.id)]:edited});
 const result=compose(restored,defaultChapters(restored),proposal);
 assert.deepEqual(result.problems,[]);
 assert.equal(result.doc.versions[0].chapters[chapter.id].paragraphs[0].text,edited[0].text);
});
