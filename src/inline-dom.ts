// Reading a contentEditable block back into spans, and mapping the browser's selection to character offsets and back.
// Written against the minimal shape of DOM nodes (no globals), so node tests can drive it with plain objects.
import type{Span}from'./inline.ts';
export interface N{nodeType:number;nodeValue:string|null;tagName?:string;childNodes:ArrayLike<N>&Iterable<N>;parentNode?:N|null;style?:{fontWeight?:string;fontStyle?:string}}
const isBr=(n:N)=>n.nodeType===1&&n.tagName==='BR';
const flat=(t:string)=>t.replace(/[\n\r ]/g,' ');

// STRONG, B and heavy spans are bold; EM, I and italic spans are italic; a line break is a space; anything else gives its text only.
// The browser's own placeholder <br> at the very end of a block is not text.
export function spansFromDom(root:N):Span[]{
 const out:Span[]=[];
 const add=(text:string,b:boolean,i:boolean)=>{if(!text)return;const l=out[out.length-1];if(l&&!!l.b===b&&!!l.i===i)l.text+=text;else out.push({text,...(b?{b:true as const}:{}),...(i?{i:true as const}:{})});};
 const walk=(n:N,b:boolean,i:boolean,last:boolean)=>{
  if(n.nodeType===3){add(flat(n.nodeValue||''),b,i);return;}
  if(n.nodeType!==1)return;
  if(isBr(n)){if(!last)add(' ',b,i);return;}
  const tag=n.tagName,weight=n.style?.fontWeight,fs=n.style?.fontStyle;
  const nb=b||tag==='STRONG'||tag==='B'||weight==='bold'||weight==='bolder'||+(weight||0)>=600;
  const ni=i||tag==='EM'||tag==='I'||fs==='italic'||fs==='oblique';
  const kids=Array.from(n.childNodes);
  kids.forEach((c,k)=>walk(c,nb,ni,last&&k===kids.length-1));
 };
 const kids=Array.from(root.childNodes);
 kids.forEach((c,k)=>walk(c,false,false,k===kids.length-1));
 return out;
}
export const plainFromDom=(root:N)=>spansFromDom(root).map(x=>x.text).join('');
const size=(n:N):number=>n.nodeType===3?(n.nodeValue||'').length:isBr(n)?1:Array.from(n.childNodes).reduce((a,c)=>a+size(c),0);

// A (node, offset) boundary point as a character offset from the start of root.
export function pointOffset(root:N,node:N,off:number):number{
 let acc=0;
 const walk=(n:N):boolean=>{
  if(n===node){if(n.nodeType===3)acc+=off;else for(let k=0;k<off;k++)acc+=size(n.childNodes[k]);return true;}
  if(n.nodeType===3){acc+=(n.nodeValue||'').length;return false;}
  if(isBr(n)){acc+=1;return false;}
  for(const c of Array.from(n.childNodes))if(walk(c))return true;
  return false;
 };
 walk(root);return acc;
}
// The boundary point for a character offset: inside a text node where there is one, else beside the line break.
export function locate(root:N,pos:number):[N,number]{
 let acc=0;
 const walk=(n:N):[N,number]|null=>{
  if(n.nodeType===3){const len=(n.nodeValue||'').length;if(pos<=acc+len)return[n,pos-acc];acc+=len;return null;}
  if(isBr(n)){const at=Array.from(n.parentNode!.childNodes).indexOf(n);if(pos<=acc)return[n.parentNode!,at];acc+=1;return null;}
  for(const c of Array.from(n.childNodes)){const r=walk(c);if(r)return r;}
  return null;
 };
 return walk(root)||[root,root.childNodes.length];
}
