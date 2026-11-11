import type{PubBook}from'./types';
import{displayName}from'./core';
import{Logo}from'./Shell';

export default function PublicLibrary({books,loading,canEdit,onOpen,onWorkspace}:{books:PubBook[]|null;loading:boolean;canEdit:boolean;onOpen:(book:PubBook)=>void;onWorkspace:()=>void}){
 return <div className="library">
  <h1 className="library-title">The library</h1>
  <p className="library-sub">{books?books.length+(books.length===1?' book':' books')+' summarized and ready to read':'Loading…'}</p>
  {books&&!books.length&&<div className="empty-state"><p>{loading?'':'Nothing has been published yet.'}</p>{canEdit&&<button className="text-link2" onClick={onWorkspace}>Open your workspace to publish a summary</button>}</div>}
  <div className="cards">{(books||[]).map(b=><article className="card" key={b.id}>
   <button className="card-open" onClick={()=>onOpen(b)} aria-label={'Open '+b.title}>
    <div className="card-top"><span className="card-brand"><Logo dark/>Summary</span><span className="card-tag">{b.languages.map(l=>l.toUpperCase()).join(' · ')}</span></div>
    <h2 dir="auto">{b.title}</h2><p className="card-author" dir="auto">{displayName(b.author)}</p>
    <div className={'cover card-cover'+(b.cover?' has-image':' cover-0')} aria-hidden="true">{b.cover?<img src={b.cover} alt=""/>:<span dir="auto">{b.title}</span>}</div>
   </button>
   <div className="card-foot"><span>{b.chapters} chapters{b.visibility==='unlisted'?' · not listed':''}</span></div>
  </article>)}</div>
 </div>;
}
