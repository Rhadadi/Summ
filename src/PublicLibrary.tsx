import type{PubBook}from'./types';
import{sized}from'./img';
import{displayName}from'./core';
import{authorFor}from'./persian-display';
import{Logo}from'./Shell';
import{matchesBook,publicTitle}from'./discovery';
import{tr,num}from'./i18n';
import{bookCategories,categoryById,categoryName}from'./categories.ts';
import CategoryChips from'./CategoryChips';
export default function PublicLibrary({books,loading,canEdit,onOpen,onWorkspace,query,onClear,lang,listening,category,onCategory,only}:{books:PubBook[]|null;loading:boolean;canEdit:boolean;onOpen:(book:PubBook)=>void;onWorkspace:()=>void;query:string;onClear:()=>void;lang:string;listening:boolean;category?:string;onCategory:(id:string|null)=>void;only?:string[]}){
 const cat=category?categoryById(category):undefined;
 // the listening library lists only books that have audio; a category page only its own books
 const L=(t:string)=>tr(lang,t),shown=(books||[]).filter(b=>matchesBook(b,query)&&(!listening||!!b.audio?.length)&&(!cat||bookCategories(b).includes(cat.id))&&(!only||only.includes(b.id)));
 return <div className="library"><h1 className="library-title">{only?L('Saved on this device'):cat?categoryName(cat,lang):L(listening?'Listening library':'The library')}</h1>
 {!listening&&!only&&books&&<CategoryChips books={books} lang={lang} active={cat?.id||null} onPick={onCategory}/>}
 <p className="library-sub" role="status">{!books?L('Loading…'):lang==='fa'?num(lang,shown.length)+' کتاب'+(query?' پیدا شد':' برای مطالعه'):shown.length+(query?' results':' books ready to read')}</p>
 {query&&<button className="text-link2" onClick={onClear}>{L('Clear search')}</button>}
 {books&&!shown.length&&<div className="empty-state"><h2>{L(query?'No books found':only?'No book is saved on this device yet. Open a book and press the save button beside Share.':listening?'No book has audio yet.':'Nothing has been published yet.')}</h2>{query&&<p>{L('Try another title or author.')}</p>}{canEdit&&!query&&<button className="text-link2" onClick={onWorkspace}>Open your workspace to publish a summary</button>}</div>}
 <div className="cards">{shown.map(b=><article className="card" key={b.id}>
 <button className="card-open" onClick={()=>onOpen(b)} aria-label={L('Read the summary')+': '+publicTitle(b,lang)}>
 <div className="card-top"><span className="card-brand"><Logo dark/>{L('Summary')}</span><span className="card-tag">{b.languages.map(l=>l==='fa'?'فارسی':l==='en'?'English':l).join(' · ')}</span></div>
 <h2 dir="auto">{publicTitle(b,lang)}</h2>{b.title!==publicTitle(b,lang)&&<p dir="auto" lang="en">{b.title}</p>}<p className="card-author" dir="auto">{lang==='fa'?authorFor(b,lang):displayName(b.author)}</p>
 <div className={'cover card-cover'+(b.cover?' has-image':' cover-0')} aria-hidden="true">{b.cover?<img src={sized(b.cover,480)} alt="" loading="lazy"/>:<span dir="auto">{publicTitle(b,lang)}</span>}</div></button>
 <div className="card-foot"><span>{num(lang,b.chapters)} {L('chapters')}</span><button className="text-link2" onClick={()=>onOpen(b)}>{L(listening?'Listen':'Read the summary')}</button></div>
 </article>)}</div></div>;
}
