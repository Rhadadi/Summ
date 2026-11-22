import type{PubBook}from'./types';
import{categoryCounts,categoryName}from'./categories.ts';
import{tr,num}from'./i18n';
// A row of categories to browse by ("All" first), each with how many books it holds; a scroll row on phones.
export default function CategoryChips({books,lang,active,onPick,all=true}:{books:PubBook[];lang:string;active:string|null;onPick:(id:string|null)=>void;all?:boolean}){
 const L=(t:string)=>tr(lang,t),counts=categoryCounts(books);
 if(!counts.length)return null;
 return <nav className="cat-chips" aria-label={L('Categories')} dir={lang==='fa'?'rtl':'ltr'}>
  {all&&<button className={'cat-chip'+(active===null?' on':'')} aria-current={active===null?'page':undefined} onClick={()=>onPick(null)}>{L('All')}<span>{num(lang,books.length)}</span></button>}
  {counts.map(({category,count})=><button key={category.id} className={'cat-chip'+(active===category.id?' on':'')} aria-current={active===category.id?'page':undefined} onClick={()=>onPick(category.id)}>{categoryName(category,lang)}<span>{num(lang,count)}</span></button>)}
 </nav>;
}
