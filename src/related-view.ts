import type{RelatedBook}from'./types';
import{relatedInPersian}from'./persian-display.ts';

export interface RelatedCard{key:string;title:string;original:string;author:string;year:string;cover:string|null;rating:number|null;count:number|null;why:string;inLibrary:boolean;slug:string|null;url:string|null;ltr:boolean}
const latin=(t:string)=>/^[\p{Script=Latin}\s\p{P}\p{N}]+$/u.test(t);
// Which title a reader of `lang` sees: the hand-written dictionary first (an override, never a filter), then the title
// this library or the model gives in that language, else the original, set left-to-right with no card dropped.
export function relatedTitle(b:RelatedBook,lang?:string){
 const dict=lang==='fa'?relatedInPersian(b.title):null;
 const local=dict?.[0]||(lang&&lang!=='en'?b.titles?.[lang]||b.localTitle:'')||'';
 const author=dict?.[1]||(lang&&lang!=='en'&&b.localAuthor)||b.author;
 return local?{title:local,original:local!==b.title?b.title:'',author,ltr:false}:{title:b.title,original:'',author,ltr:!!lang&&lang!=='en'&&latin(b.title)};
}
// The cards of the shelf. Fewer than two is not a shelf: the section is hidden entirely.
export function relatedView(books:RelatedBook[],lang:string|undefined,L:(t:string)=>string,limit=8):RelatedCard[]{
 const cards=books.slice(0,limit).map((b,i)=>{
  const t=relatedTitle(b,lang),inLibrary=!!b.slug;
  // "why" for this library's books is written here, so it is always in the page's language.
  const why=inLibrary&&b.reason==='author'?L('Also by this author'):inLibrary&&b.reason==='subject'&&b.subject?L('Also about')+' '+b.subject:(lang==='fa'&&latin(b.why)?'':b.why);
  return{key:(b.slug||b.url||b.title)+i,title:t.title,original:t.original,author:t.author,year:b.year,cover:b.cover,rating:b.rating,count:b.count??null,why,inLibrary,slug:b.slug||null,url:b.url,ltr:t.ltr};
 });
 return cards.length<2?[]:cards;
}
// Stars are shown only when enough people rated; a handful of votes says little.
// A year is not a quantity: no thousands separator, Persian digits in Persian.
export const yearText=(lang:string|undefined,y:string)=>lang==='fa'?y.replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d]):y;
export const showRating=(c:RelatedCard)=>!!c.rating&&(c.count||0)>=20;
