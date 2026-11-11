import type{Block,Book,Chapter}from'./types.ts';

// Cut a book into the chapters a summary found, using the page numbers it gave. Blocks keep their text and order.
export interface Range{title:string;original?:string;start:number;end:number}
export interface Plan{chapters:Chapter[];main:Chapter[]}
export function rechapter(book:Pick<Book,'chapters'>,ranges:Range[]):Plan|null{
 const blocks:Block[]=[];let page=0;
 for(const c of book.chapters)for(const b of c.blocks){if(b.page)page=b.page;blocks.push({...b,page:b.page??(page||undefined)});}
 if(!blocks.some(b=>b.page)||ranges.length<2)return null;
 const sorted=[...ranges].sort((a,b)=>a.start-b.start);
 const buckets:Block[][]=sorted.map(()=>[]),front:Block[]=[],back:Block[]=[];
 const last=sorted[sorted.length-1];
 for(const b of blocks){
  const p=b.page??0;
  if(p<sorted[0].start){front.push(b);continue;}
  if(p>last.end){back.push(b);continue;}
  let at=0;for(let i=0;i<sorted.length;i++)if(sorted[i].start<=p)at=i;
  buckets[at].push(b);
 }
 const main=sorted.map((r,i):Chapter=>({id:'rc'+i+'-'+r.start,title:r.original||r.title,blocks:buckets[i]})).filter(c=>c.blocks.length);
 if(main.length<2)return null;
 const chapters=[...(front.length?[{id:'rc-front',title:'Front matter',blocks:front}]:[]),...main,...(back.length?[{id:'rc-back',title:'Notes and index',blocks:back}]:[])];
 return{chapters,main};
}
