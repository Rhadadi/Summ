import{useState}from'react';
import{AddRounded,DeleteOutlineRounded,SearchRounded}from'@mui/icons-material';
import{Button,IconButton}from'@mui/material';
import type{Book,PubBook}from'./types';
import{bodyChapter,bookWords,displayName,minutes}from'./core';
import Cover from'./Cover';
import{Logo}from'./Shell';
import GoogleBooksDialog from'./GoogleBooksDialog';
import{tr}from'./i18n';

const words=(b:Book)=>bookWords({...b,chapters:b.chapters.map(bodyChapter)});
const hours=(m:number)=>m<90?m+' min':Math.round(m/60)+' hours';
const filters=[{id:'all',label:'All'},{id:'book',label:'Books'},{id:'article',label:'Articles'},{id:'video',label:'Transcripts'},{id:'text',label:'Notes'}];
interface Props{books:Book[];published:PubBook[];language:string;covers:Record<string,string>;filter:string;query:string;canSearchBooks:boolean;onFilter:(id:string)=>void;onOpen:(book:Book)=>void;onOpenPublished:(book:PubBook)=>void;onEditPublished:(book:PubBook)=>void;onAdd:()=>void;onRemove:(book:Book)=>void;onClear:()=>void}
export default function LibraryPage({books,published,language,covers,filter,query,canSearchBooks,onFilter,onOpen,onOpenPublished,onEditPublished,onAdd,onRemove,onClear}:Props){
 const L=(text:string)=>tr(language,text);
 const[searchOpen,setSearchOpen]=useState(false);
 const shown=books.filter(b=>(filter==='all'||b.category===filter)&&(b.title+' '+b.author).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(b.lastRead||b.addedAt)-(a.lastRead||a.addedAt));
 const present=filters.filter(f=>f.id==='all'||books.some(b=>b.category===f.id));
 return <div className="library">
  <h1 className="library-title">{L('Your workspace')}</h1>
  <p className="library-sub">{books.length} {books.length===1?'book':'books'} · {hours(books.reduce((n,b)=>n+minutes(words(b)),0))} of reading</p>
  <section className="workspace-published"><h2>{L('Published books')}</h2><p>{L('Edit the books readers see, including books published from another device.')}</p><div className="workspace-published-grid">{published.map(b=><article key={b.id} className="workspace-published-card"><div className="workspace-published-cover">{b.cover&&<img src={b.cover} alt=""/>}</div><div><h3 dir="auto">{b.title}</h3><p dir="auto">{b.author}</p><small>{L(b.visibility==='public'?'Public':'Unlisted')} · {b.chapters} {L('chapters')}</small><div className="workspace-published-actions"><Button variant="contained" size="small" onClick={()=>onEditPublished(b)}>{L('Edit book')}</Button><Button size="small" onClick={()=>onOpenPublished(b)}>{L('View')}</Button></div></div></article>)}</div>{!published.length&&<p>{L('No published books yet. Add a source below, write or import a summary, then publish it.')}</p>}</section>
  {canSearchBooks&&<Button variant="outlined" sx={{mb:3}} startIcon={<SearchRounded/>} onClick={()=>setSearchOpen(true)}>Find books</Button>}
  <h2>{L('Sources on this device')}</h2><p className="library-sub">{L('Import a book here, prepare its summary, then publish it for editing on any device.')}</p>
  <div className="pills" role="group" aria-label="Filter">{present.map(f=><button key={f.id} className={'pill'+(filter===f.id?' on':'')} aria-pressed={filter===f.id} onClick={()=>onFilter(f.id)}>{f.label}</button>)}</div>
  <div className="cards">
   {shown.map(b=><article className="card" key={b.id}>
    <button className="card-open" onClick={()=>onOpen(b)} aria-label={'Open '+b.title}>
     <div className="card-top"><span className="card-brand"><Logo dark/>Inkling</span><span className="card-tag">{b.demo?'Sample':b.format}</span></div>
     <h2 dir="auto">{b.title}</h2>
     <p className="card-author" dir="auto">{b.author==='Author not supplied'?'':displayName(b.author)}</p>
     <Cover book={b} url={covers[b.id]} className="card-cover"/>
    </button>
    <div className="card-foot"><span>{hours(minutes(words(b)))}</span><IconButton size="small" aria-label={'Remove '+b.title} onClick={()=>onRemove(b)}><DeleteOutlineRounded fontSize="small"/></IconButton></div>
   </article>)}
   <button className="card card-add" onClick={onAdd}><AddRounded/><strong>Add a book</strong><span>PDF, EPUB, link or text</span></button>
  </div>
  {!shown.length&&books.length>0&&<p className="library-empty">Nothing matches. <Button onClick={onClear}>Show everything</Button></p>}
  {searchOpen&&<GoogleBooksDialog onClose={()=>setSearchOpen(false)}/>}
 </div>;
}
