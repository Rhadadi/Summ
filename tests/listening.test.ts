import test from'node:test';
import assert from'node:assert/strict';
import{audioFor,canListenTo}from'../src/listening.ts';

const track=(chapterId:string|null)=>({chapterId});
test('until the status arrives the book list decides, without a flicker',()=>{
 assert.equal(audioFor(null,['fa'],'fa','detailed').book,true);
 assert.equal(audioFor(null,['en'],'fa','detailed').book,false);
 assert.equal(audioFor(null,undefined,'fa','detailed').book,false);
 const a=audioFor(null,['fa'],'fa','detailed');
 assert.equal(canListenTo(a,'c1'),true);   // not known yet: do not hide per chapter
});
test('no tracks means no Listen, even while the first run is going',()=>{
 for(const status of['none','running','failed'])assert.equal(audioFor({status,tracks:[]},['fa'],'fa','detailed').book,false);
});
test('a regeneration or a failed rerun keeps Listen because the old audio is kept',()=>{
 assert.equal(audioFor({status:'running',type:'detailed',tracks:[track(null),track('c1')]},['fa'],'fa','detailed').book,true);
 assert.equal(audioFor({status:'failed',type:'detailed',tracks:[track('c1')]},['fa'],'fa','detailed').book,true);
});
test('the audio must be for this version; old rows without a type match any',()=>{
 assert.equal(audioFor({status:'ready',type:'brief',tracks:[track('c1')]},['fa'],'fa','detailed').book,false);
 assert.equal(audioFor({status:'ready',type:'',tracks:[track('c1')]},['fa'],'fa','detailed').book,true);
 assert.equal(audioFor({status:'ready',tracks:[track('c1')]},['fa'],'fa','brief').book,true);
});
test('chapter and overview buttons need their own track',()=>{
 const a=audioFor({status:'ready',type:'detailed',tracks:[track(null),track('c1'),track('c1'),track('c3')]},['fa'],'fa','detailed');
 assert.equal(a.overview,true);
 assert.deepEqual([...a.chapters].sort(),['c1','c3']);
 assert.equal(canListenTo(a,'c1'),true);
 assert.equal(canListenTo(a,'c2'),false);
 assert.equal(canListenTo(a,null),true);
 const none=audioFor({status:'ready',type:'detailed',tracks:[track('c1')]},['fa'],'fa','detailed');
 assert.equal(none.overview,false);assert.equal(canListenTo(none,null),false);
 const gone=audioFor({status:'none',tracks:[]},[],'fa','detailed');
 assert.equal(canListenTo(gone,'c1'),false);
});
