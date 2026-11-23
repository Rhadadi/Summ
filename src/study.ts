// Study tools drawn from a chapter's own summary, with no AI call: its key concepts (the bold terms), questions to
// check yourself (one per headed section, answered by the section's opening), and reading time.
import{parseInline}from'./inline.ts';
interface Para{heading?:string;text:string;image?:unknown;table?:unknown}
export function concepts(paras:Para[],max=10):string[]{
 const seen=new Map<string,string>();
 for(const p of paras){const spans=parseInline(p.text);spans.forEach((s,k)=>{
  if(!s.b)return;
  // a bold label ("Key question:") is not a concept
  if(/[:：]\s*$/.test(s.text)||/^\s*[:：]/.test(spans[k+1]?.text||''))return;
  const t=s.text.trim().replace(/[.,;:،؛!?؟]+$/,'');if(t.length>=2&&t.length<=40&&t.split(/\s+/).length<=5&&!seen.has(t.toLowerCase()))seen.set(t.toLowerCase(),t);});}
 const out=[...seen.values()].slice(0,max);return out.length>=2?out:[];
}
const plain=(t:string)=>parseInline(t).map(s=>s.text).join('');
/** The opening of a passage: whole sentences up to about 260 characters. */
export function lead(text:string,limit=260):string{
 const t=plain(text).replace(/\s+/g,' ').trim(),parts=t.match(/[^.!?؟]+[.!?؟]+(\s|$)/g)||[t];
 let out='';for(const s of parts){if(out&&out.length+s.length>limit)break;out+=s;}
 out=out.trim()||t;return out.length>limit+80?out.slice(0,out.lastIndexOf(' ',limit))+'…':out;
}
export function selfCheck(paras:Para[],lang:string,max=5):{question:string;answer:string}[]{
 let headed=paras.filter(p=>p.heading&&p.text&&!p.image&&!p.table);
 // no headings: numbered paragraphs that open with a short title ("2. Rereading Freud. Mitchell …") serve instead
 if(headed.length<2)headed=paras.flatMap(p=>{const m=!p.heading&&!p.image&&!p.table?/^\s*[\d۰-۹]+[.)]\s*([^.:!?؟\n]{3,60})[.:]\s+(.+)$/s.exec(plain(p.text)):null;return m?[{heading:m[1],text:m[2]}]:[];});
 if(headed.length<2)return[];
 return headed.slice(0,max).map(p=>({question:lang==='fa'?'دربارهٔ «'+p.heading!.trim()+'» فصل چه می‌گوید؟':'What does the chapter say about “'+p.heading!.trim()+'”?',answer:lead(p.text)}));
}
export function readingMinutes(paras:Para[],lang:string):number{
 const words=paras.reduce((n,p)=>n+plain(p.text).split(/\s+/).filter(Boolean).length,0);
 return Math.max(1,Math.round(words/(lang==='fa'?170:230)));
}
/** Where each paragraph starts within the chapter, as a share of its text: a section's play button seeks there. */
export function starts(paras:Para[]):number[]{
 const len=paras.map(p=>p.image||p.table?0:plain(p.text).length+(p.heading?.length||0)),total=len.reduce((a,b)=>a+b,0)||1;
 let at=0;return len.map(n=>{const s=at/total;at+=n;return s;});
}
/** The chapter's pull-quote for its opening: the first quotation, when it is short enough to stand alone. */
export function pullQuote(paras:{text:string;quote?:boolean}[]):string|null{
 const q=paras.find(p=>p.quote&&plain(p.text).length<=240);return q?plain(q.text).trim():null;
}
