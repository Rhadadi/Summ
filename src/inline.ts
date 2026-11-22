// Bold and italic inside a paragraph's text: **bold**, *italic*, \* and \\ for literal characters.
// The stored schema does not change; the markers are what the page, the narration and the emails read.
// Pure: no React, no DOM. server/inline.py is the twin of parseInline's plain-text half; tests/fixtures/inline.json keeps them in step.
export interface Span{text:string;b?:true;i?:true}
export type Mark='b'|'i';

const OPENERS=/[\s(\[«"“„'‘]/,SPACE=/\s/,WORD=/[\p{L}\p{N}]/u;
interface Tok{ch?:string;k?:Mark;open?:boolean;hit?:boolean}
// An opening marker comes at the start or after a space or opening punctuation and is followed by a non-space; a closing marker follows a
// non-space and comes before the end, a space or punctuation. Anything else, and any marker without a partner, stays a literal asterisk.
// That is why a sentence like "2 * 3 * 4" or "a*b" is never changed.
export function parseInline(s:string):Span[]{
 const toks:Tok[]=[],stack:number[]=[];
 let prev='';
 for(let i=0;i<s.length;){
  const c=s[i];
  if(c==='\\'&&(s[i+1]==='*'||s[i+1]==='\\')){toks.push({ch:s[i+1]});prev='x';i+=2;continue;}
  if(c!=='*'){toks.push({ch:c});prev=c;i++;continue;}
  let n=0;while(s[i+n]==='*')n++;
  const next=s[i+n]||'',run=s.slice(i,i+n);
  if(n>3){for(const ch of run)toks.push({ch});prev='*';i+=n;continue;}
  const canOpen=next!==''&&!SPACE.test(next)&&(prev===''||OPENERS.test(prev)),canClose=prev!==''&&!SPACE.test(prev)&&(next===''||!WORD.test(next));
  const kinds:Mark[]=n===1?['i']:n===2?['b']:['b','i'];
  // Which way a run goes is decided unit by unit, so "*a **b***" closes both of its marks.
  const closing=canClose&&(!canOpen||kinds.some(k=>stack.some(j=>toks[j].k===k)));
  if(closing){
   for(const k of (n===3?['i','b'] as Mark[]:kinds)){
    const at=stack.map(j=>toks[j].k).lastIndexOf(k);
    if(at<0){toks.push({ch:k==='b'?'**':'*'});continue;}
    const j=stack[at];stack.length=at;  // anything opened after it never closed: it stays literal
    toks[j].hit=true;toks.push({k,open:false,hit:true});
   }
  }else if(canOpen){for(const k of kinds){stack.push(toks.length);toks.push({k,open:true});}}
  else toks.push({ch:run});
  prev='*';i+=n;
 }
 const out:Span[]=[];let b=false,i=false;
 const add=(text:string)=>{if(!text)return;const l=out[out.length-1];if(l&&!!l.b===b&&!!l.i===i)l.text+=text;else out.push({text,...(b?{b:true as const}:{}),...(i?{i:true as const}:{})});};
 for(const t of toks){
  if(t.k){if(!t.hit){add(t.k==='b'?'**':'*');continue;}if(t.k==='b')b=!!t.open;else i=!!t.open;}
  else add(t.ch!);
 }
 return out;
}
export const plainInline=(s:string)=>parseInline(s).map(x=>x.text).join('');

const clean=(sp:Span[]):Span[]=>concatSpans(sp,[]);
export function concatSpans(a:Span[],b:Span[]):Span[]{
 const out:Span[]=[];
 for(const x of[...a,...b]){
  if(!x.text)continue;const l=out[out.length-1];
  if(l&&!!l.b===!!x.b&&!!l.i===!!x.i)l.text+=x.text;else out.push({...x});
 }
 return out;
}
export function splitSpans(sp:Span[],at:number):[Span[],Span[]]{
 const left:Span[]=[],right:Span[]=[];let pos=0;
 for(const x of sp){
  const end=pos+x.text.length;
  if(end<=at)left.push({...x});else if(pos>=at)right.push({...x});else{left.push({...x,text:x.text.slice(0,at-pos)});right.push({...x,text:x.text.slice(at-pos)});}
  pos=end;
 }
 return[clean(left),clean(right)];
}
const lengthOf=(sp:Span[])=>sp.reduce((n,x)=>n+x.text.length,0);
// Apply fn to each character's marks inside [start,end).
function remark(sp:Span[],start:number,end:number,fn:(x:Span)=>Span):Span[]{
 const[a,rest]=splitSpans(sp,start),[mid,z]=splitSpans(rest,end-start);
 return concatSpans(concatSpans(a,mid.map(fn)),z);
}
const without=(x:Span,m:Mark):Span=>{const{[m]:_,...rest}=x;return rest as Span;};
export function hasMark(sp:Span[],start:number,end:number,m:Mark):boolean{
 if(end<=start)return false;
 const[,rest]=splitSpans(sp,start),[mid]=splitSpans(rest,end-start);
 return mid.length>0&&lengthOf(mid)===end-start&&mid.every(x=>!!x[m]);
}
// All on: switch it off for the selection; otherwise switch it on for all of it.
export function toggleMark(sp:Span[],start:number,end:number,m:Mark):Span[]{
 if(end<=start)return clean(sp);
 return hasMark(sp,start,end,m)?remark(sp,start,end,x=>without(x,m)):remark(sp,start,end,x=>({...x,[m]:true}));
}
export const clearMarks=(sp:Span[],start:number,end:number):Span[]=>end<=start?clean(sp):remark(sp,start,end,x=>({text:x.text}));
// What the markers can express: a mark never touches a space, starts only at the start of a word and ends only at its end (the markers
// could not be read back otherwise). The editor widens a selection this way before it formats, and serializeInline does the same as a safeguard.
export function snapToWords(text:string,start:number,end:number):[number,number]{
 while(start<end&&SPACE.test(text[start]))start++;
 while(end>start&&SPACE.test(text[end-1]))end--;
 if(end<=start)return[start,start];
 while(start>0&&!OPENERS.test(text[start-1]))start--;
 while(end<text.length&&WORD.test(text[end]))end++;
 return[start,end];
}

// The word the caret is in (letters, digits and the Persian half-space): what Mod+B formats when nothing is selected.
export function wordAt(text:string,pos:number):[number,number]{
 const w=(i:number)=>i>=0&&i<text.length&&(WORD.test(text[i])||text[i]==='\u200c');
 let a=pos,z=pos;
 while(w(a-1))a--;while(w(z))z++;
 while(a<z&&text[a]==='\u200c')a++;while(z>a&&text[z-1]==='\u200c')z--;
 return[a,z];
}

export function spansToHtml(sp:Span[]):string{
 const esc=(t:string)=>t.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return sp.map(x=>{let h=esc(x.text);if(x.i)h='<em>'+h+'</em>';if(x.b)h='<strong>'+h+'</strong>';return h;}).join('');
}

// Back to markers. Marks never touch spaces or the inside of a word, and two marks that cross are cut so that they nest.
export function serializeInline(sp:Span[]):string{
 const text=sp.map(x=>x.text).join(''),n=text.length;
 const marks:Record<Mark,[number,number][]>={b:[],i:[]};
 for(const m of['b','i'] as Mark[]){
  let at=0;const runs:[number,number][]=[];
  for(const x of sp){if(x[m]){const l=runs[runs.length-1];if(l&&l[1]===at)l[1]=at+x.text.length;else runs.push([at,at+x.text.length]);}at+=x.text.length;}
  const fitted=runs.map(([a,z])=>snapToWords(text,a,z)).filter(([a,z])=>z>a).sort((p,q)=>p[0]-q[0]);
  for(const r of fitted){const l=marks[m][marks[m].length-1];if(l&&r[0]<=l[1])l[1]=Math.max(l[1],r[1]);else marks[m].push([...r]);}
 }
 // Two runs that cross are made to nest: the later one is cut at the earlier one's end (when a space is there), or the earlier one grows over it.
 for(let again=true,guard=0;again&&guard<50;guard++){
  again=false;
  for(const b of marks.b)for(const r of marks.i){
   const[x,y,ym]=b[0]<=r[0]?[b,r,'i' as Mark]:[r,b,'b' as Mark];
   if(!(x[0]<y[0]&&y[0]<x[1]&&x[1]<y[1]))continue;
   again=true;
   if(SPACE.test(text[x[1]])){let a=x[1];const z=y[1];y[1]=x[1];while(a<z&&SPACE.test(text[a]))a++;if(z>a)marks[ym].push([a,z]);}
   else x[1]=y[1];
   break;
  }
  if(again)for(const m of['b','i'] as Mark[])marks[m].sort((p,q)=>p[0]-q[0]);
 }
 const ev:{at:number;m:Mark;open:boolean;len:number}[]=[];
 for(const m of['b','i'] as Mark[])for(const[a,z]of marks[m]){ev.push({at:a,m,open:true,len:z-a});ev.push({at:z,m,open:false,len:z-a});}
 // At one position: close the later-opened (inner) first, then open the longer (outer) first.
 const rank=(e:typeof ev[0])=>e.open?1:0;
 ev.sort((p,q)=>p.at-q.at||rank(p)-rank(q)||(p.open?q.len-p.len||(p.m==='b'?-1:1):p.len-q.len||(p.m==='i'?-1:1)));
 let out='',pos=0,k=0;
 const esc=(t:string)=>t.replace(/[\\*]/g,'\\$&');
 while(k<ev.length){
  const at=ev[k].at;out+=esc(text.slice(pos,at));pos=at;
  const group:typeof ev=[];while(k<ev.length&&ev[k].at===at)group.push(ev[k++]);
  for(const e of group)out+=e.m==='b'?'**':'*';
 }
 return out+esc(text.slice(pos,n));
}
