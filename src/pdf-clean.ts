import type{Block}from'./types.ts';

// One paragraph as PDF.js reports it, with the average glyph height of its text.
export interface RawParagraph{text:string;size:number}

// Undo line-end hyphenation, line breaks inside a paragraph, and spaces PDF.js
// inserts before combining marks (fāh ̣ isha → fāḥisha).
export function tidy(text:string){
 return text.replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu,'$1$2').replace(/\s*\n\s*/g,' ').normalize('NFD').replace(/(\p{L})\s+(\p{M})\s+(?=\p{L})/gu,'$1$2').replace(/\s+(\p{M})/gu,'$1').normalize('NFC')
  .replace(/[ \t ]{2,}/g,' ').replace(/\s+([,.;:!?)\]])/g,'$1').replace(/([(\[])\s+/g,'$1').trim();
}
const headKey=(text:string)=>text.toLowerCase().replace(/\b(?:\d+|[ivxlcdm]+)\b/g,'').replace(/[^\p{L}]+/gu,' ').trim();
const ends=/[.!?:;"”’)\]…]$/;
function join(previous:string,next:string){return /\p{L}-$/u.test(previous)&&/^\p{Ll}/u.test(next)?previous.slice(0,-1)+next:previous+' '+next;}

// Drops running heads and page numbers, marks footnotes by their smaller type,
// and rejoins body paragraphs that a page break split in two.
export function cleanPages(pages:RawParagraph[][]):Block[][]{
 const tidied=pages.map(page=>page.map(p=>({...p,text:tidy(p.text)})));
 const seen=new Map<string,Set<number>>();
 tidied.forEach((page,p)=>page.forEach(x=>{if(x.text.length<=90){const k=headKey(x.text);if(k.length>=3){if(!seen.has(k))seen.set(k,new Set());seen.get(k)!.add(p);}}}));
 const running=(text:string)=>text.length<=90&&(seen.get(headKey(text))?.size||0)>=3;
 const pageNumber=(text:string)=>/^[\divxlcdm.\s–-]{1,8}$/i.test(text);
 const kept=tidied.map(page=>page.filter(x=>x.text&&!running(x.text)&&!pageNumber(x.text)));
 // Body size is the size most of the text is set in; notes are noticeably smaller.
 const weights=new Map<number,number>();
 for(const x of kept.flat())weights.set(Math.round(x.size*2)/2,(weights.get(Math.round(x.size*2)/2)||0)+x.text.length);
 const body=[...weights.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||0;
 const out:Block[][]=kept.map((page,i)=>page.map((x,j)=>({id:'pdf-p'+(i+1)+'-b'+j,text:x.text,location:'PDF page '+(i+1)+' · Passage '+(j+1),page:i+1,...(body&&x.size<body*.9?{note:true}:{})})));
 let last:Block|undefined,lastPage=0;
 for(const page of out){
  for(let j=0;j<page.length;j++){
   const block=page[j];if(block.note)continue;
   if(last&&lastPage===block.page!-1&&!ends.test(last.text)&&/^[\p{Ll}\d]/u.test(block.text)&&!page.slice(0,j).some(b=>!b.note)){last.text=join(last.text,block.text);lastPage=block.page!;page.splice(j,1);j--;continue;}
   last=block;lastPage=block.page!;
  }
 }
 return out;
}
