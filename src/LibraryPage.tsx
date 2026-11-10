import{AddRounded,DeleteOutlineRounded}from'@mui/icons-material';
import{Button,IconButton}from'@mui/material';
import type{Book}from'./types';
import{bookWords,minutes}from'./core';
import Cover from'./Cover';
import{Logo}from'./Header';

const filters=[{id:'all',label:'All'},{id:'book',label:'Books'},{id:'article',label:'Articles'},{id:'video',label:'Transcripts'},{id:'text',label:'Notes'}];
interface Props{books:Book[];covers:Record<string,string>;filter:string;query:string;onFilter:(id:string)=>void;onOpen:(book:Book)=>void;onAdd:()=>void;onRemove:(book:Book)=>void;onClear:()=>void}
export default function LibraryPage({books,covers,filter,query,onFilter,onOpen,onAdd,onRemove,onClear}:Props){
 const shown=books.filter(b=>(filter==='all'||b.category===filter)&&(b.title+' '+b.author).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(b.lastRead||b.addedAt)-(a.lastRead||a.addedAt));
 const present=filters.filter(f=>f.id==='all'||books.some(b=>b.category===f.id));
 return <div className="library">
  <h1 className="library-title">Your library</h1>
  <p className="library-sub">{books.length} {books.length===1?'book':'books'} · {books.reduce((n,b)=>n+minutes(bookWords(b)),0)} minutes of original reading</p>
  <div className="pills" role="group" aria-label="Filter">{present.map(f=><button key={f.id} className={'pill'+(filter===f.id?' on':'')} aria-pressed={filter===f.id} onClick={()=>onFilter(f.id)}>{f.label}</button>)}</div>
  <div className="cards">
   {shown.map(b=><article className="card" key={b.id}>
    <button className="card-open" onClick={()=>onOpen(b)} aria-label={'Open '+b.title}>
     <div className="card-top"><span className="card-brand"><Logo dark/>Summ</span><span className="card-tag">{b.demo?'Sample':b.format}</span></div>
     <h2 dir="auto">{b.title}</h2>
     <p className="card-author" dir="auto">{b.author==='Author not supplied'?'':b.author}</p>
     <Cover book={b} url={covers[b.id]} className="card-cover"/>
    </button>
    <div className="card-foot"><span>{b.chapters.length} sections · {minutes(bookWords(b))} min</span><IconButton size="small" aria-label={'Remove '+b.title} onClick={()=>onRemove(b)}><DeleteOutlineRounded fontSize="small"/></IconButton></div>
   </article>)}
   <button className="card card-add" onClick={onAdd}><AddRounded/><strong>Add a book</strong><span>PDF, EPUB, link or text</span></button>
  </div>
  {!shown.length&&books.length>0&&<p className="library-empty">Nothing matches. <Button onClick={onClear}>Show everything</Button></p>}
 </div>;
}
