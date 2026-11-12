import assert from'node:assert/strict';import test from'node:test';
import{sectionKind,chaptersFromText,selectedPassages,sentenceSpans,wordCount}from'../src/core.ts';
test('chapter boundaries preserve every paragraph and qualification',()=>{
 const c=chaptersFromText('# First\n\nCount fell from 40 to 25.\n\nThis does not establish causation.\n\n# Second\n\nOnly one team was studied.');
 assert.equal(c.length,2);assert.deepEqual(c.flatMap(x=>x.blocks).map(b=>b.text),['Count fell from 40 to 25.','This does not establish causation.','Only one team was studied.']);
 assert.equal(new Set(c.flatMap(x=>x.blocks).map(b=>b.id)).size,3);
});
test('all reading depths use exact source spans; close reading retains full text',()=>{
 const[c]=chaptersFromText('One finding. A qualification follows.\n\nThe value is 3.5, not 35.\n\nA final limitation.');
 for(const d of ['glance','overview','detailed','close']as const)for(const p of selectedPassages(c,d))assert.ok(p.block.text.includes(p.text));
 assert.deepEqual(selectedPassages(c,'close').map(p=>p.text),c.blocks.map(b=>b.text));
});
test('Persian paragraphs and punctuation survive extraction',()=>{
 const text='این یک مثال است. آیا نتیجه قطعی است؟\n\nخیر، این داده‌ها کافی نیستند.';const[c]=chaptersFromText(text);
 assert.equal(c.blocks.length,2);assert.ok(wordCount(text)>5);assert.ok(sentenceSpans(text).length>=2);
 assert.equal(selectedPassages(c,'close')[1].text,'خیر، این داده‌ها کافی نیستند.');
});

test('Persian title pages remain front matter even after the substantive chapters',()=>{
 const all=chaptersFromText('# فصل یک\n\nمتن\n\n# صفحات عنوان، پیشگفتار و مقدمه\n\nمتن');
 assert.equal(sectionKind(all[0],0,all),'main');assert.equal(sectionKind(all[1],1,all),'front');
});
