import assert from'node:assert/strict';
import test from'node:test';
import{locate,plainFromDom,pointOffset,spansFromDom}from'../src/inline-dom.ts';
import type{N}from'../src/inline-dom.ts';

const text=(v:string):N=>({nodeType:3,nodeValue:v,childNodes:[]});
const el=(tag:string,kids:N[],style?:N['style']):N=>{const n:N={nodeType:1,nodeValue:null,tagName:tag,childNodes:kids,style};for(const k of kids)k.parentNode=n;return n;};

test('strong, em, heavy and italic spans become marks; other elements give their text',()=>{
 const root=el('P',[text('a '),el('STRONG',[text('bold '),el('EM',[text('both')])]),text(' b'),el('SPAN',[text('x')],{fontWeight:'700'}),el('SPAN',[text('y')],{fontStyle:'italic'}),el('FONT',[text('z')])]);
 assert.deepEqual(spansFromDom(root),[{text:'a '},{text:'bold ',b:true},{text:'both',b:true,i:true},{text:' b'},{text:'x',b:true},{text:'y',i:true},{text:'z'}]);
});
test('line breaks and non-breaking spaces become spaces, the placeholder break at the end is ignored, half-spaces stay',()=>{
 assert.equal(plainFromDom(el('P',[text('one\ntwo three'),el('BR',[]),text('four'),el('BR',[])])),'one two three four');
 assert.equal(plainFromDom(el('P',[el('BR',[])])),'');
 assert.equal(plainFromDom(el('P',[text('می‌خواهم')])),'می‌خواهم');
});
test('offsets map to boundary points and back, across marks and line breaks',()=>{
 const t1=text('ab '),t2=text('cd'),t3=text('ef'),br=el('BR',[]);
 const strong=el('STRONG',[t2]);const root=el('P',[t1,strong,br,t3]);
 assert.equal(pointOffset(root,t1,1),1);assert.equal(pointOffset(root,t2,2),5);assert.equal(pointOffset(root,t3,1),7);
 assert.equal(pointOffset(root,root,2),5);assert.equal(pointOffset(root,strong,1),5);
 assert.deepEqual(locate(root,4),[t2,1]);assert.deepEqual(locate(root,3)[0],t1);assert.deepEqual(locate(root,6)[0],t3);
 assert.deepEqual(locate(root,99),[root,4]);
 for(const pos of[0,1,3,4,5,7])assert.equal(pointOffset(root,...locate(root,pos)),pos);
});
