import test from'node:test';
import assert from'node:assert/strict';
import{chapterHint,editorRoute,editorTarget,leaveVisitor,visitorRoute}from'../src/view-switch.ts';

const ctx={
 published:[{id:'p1',slug:'midlife',visibility:'public'},{id:'p2',slug:'secret',visibility:'unlisted'}],
 local:[{id:'l1',published:{slug:'midlife',visibility:'public'}},{id:'l2',published:null},{id:'l3'}]
};
test('every row of the mapping table',()=>{
 assert.equal(visitorRoute('/edit/p1',ctx),'/b/midlife');
 assert.equal(visitorRoute('/edit/p1/chapters/c9',ctx),'/b/midlife/read/c:c9');
 assert.equal(visitorRoute('/edit/p1/guide',ctx),'/b/midlife');
 assert.equal(visitorRoute('/edit/p2',ctx),'/library');
 assert.equal(visitorRoute('/edit/p2/chapters/c1',ctx),'/library');
 assert.equal(visitorRoute('/edit/nope',ctx),'/library');
 assert.equal(visitorRoute('/workspace',ctx),'/library');
 assert.equal(visitorRoute('/book/l1',ctx),'/b/midlife');
 assert.equal(visitorRoute('/read/l1',ctx),'/b/midlife/read');
 assert.equal(visitorRoute('/read/l1/some%20section',ctx),'/b/midlife/read');
 assert.equal(visitorRoute('/book/l2',ctx),'/');
 assert.equal(visitorRoute('/read/l3',ctx),'/');
 assert.equal(visitorRoute('/book/unknown',ctx),'/');
 assert.equal(visitorRoute('/saved',ctx),'/');
 assert.equal(visitorRoute('/mailing',ctx),'/');
});
test('routes visitors already have stay put',()=>{
 for(const r of['/','/library','/library/listen','/b/midlife','/b/midlife/read','/b/midlife/read/c:c2','/b/midlife/listen'])assert.equal(visitorRoute(r,ctx),r);
 assert.equal(visitorRoute('/edit/p1',{published:null,local:[]}),'/library');
});
test('round trip: back to the exact editor route only while still on the visitor page',()=>{
 const from='/edit/p1/chapters/c3',to=visitorRoute(from,ctx);
 assert.equal(leaveVisitor(to,{from,to}),from);
 assert.equal(leaveVisitor('/library',{from,to}),null);
 assert.equal(leaveVisitor(to,null),null);
 // Toggling on a page that does not change (the reader) never navigates.
 assert.equal(leaveVisitor('/b/midlife/read',{from:'/b/midlife/read',to:'/b/midlife/read'}),null);
});
test('chapter hints and editor targets',()=>{
 assert.equal(chapterHint('c:abc'),'abc');
 assert.equal(chapterHint('overview'),null);
 assert.equal(chapterHint('c:'),null);
 assert.deepEqual(editorTarget(['','edit','p1','chapters','c3']),{tab:'chapters',chapter:'c3'});
 assert.deepEqual(editorTarget(['','edit','p1','guide','c3']),{tab:'guide',chapter:''});
 assert.deepEqual(editorTarget(['','edit','p1','bogus']),{tab:'details',chapter:''});
 assert.deepEqual(editorTarget(['','edit','p1']),{tab:'details',chapter:''});
 assert.equal(editorRoute('p1','chapters','c3'),'/edit/p1/chapters/c3');
 assert.equal(editorRoute('p1'),'/edit/p1');
});
