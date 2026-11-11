import{useEffect,useState}from'react';
import{AccessTimeRounded,ArrowForwardRounded,BookmarkBorderRounded,ChevronRightRounded,LibraryBooksOutlined,PlayArrowRounded}from'@mui/icons-material';
import{Button}from'@mui/material';
import type{Book,SavedPassage}from'./types';
import{store}from'./storage';
import{displayName}from'./core';
import{mainChapters,strip}from'./bookData';
import Cover from'./Cover';

interface Props{books:Book[];covers:Record<string,string>;saved:SavedPassage[];onRead:(book:Book)=>void;onOpen:(book:Book)=>void;onListen:(book:Book)=>void;onAdd:()=>void;navigate:(path:string)=>void}
export const author=(b:Book)=>b.author==='Author not supplied'?'':displayName(b.author);
export function Shelf({book,url}:{book:Book;url?:string}){return <span className="shelf"><span className="shelf-arc"/><Cover book={book} url={url} className="shelf-cover"/></span>;}
export default function HomePage({books,covers,saved,onRead,onOpen,onListen,onAdd,navigate}:Props){
 const[ready,setReady]=useState<Record<string,number>>({});
 const recent=[...books].sort((a,b)=>(b.lastRead||b.addedAt)-(a.lastRead||a.addedAt)).slice(0,4);
 // Whole-book reports say how many chapters already have summaries to listen to.
 useEffect(()=>{let live=true;Promise.all(recent.map(async b=>{const key=await store.latestReport(b.id).catch(()=>undefined);const r=key?await store.report(key).catch(()=>undefined):undefined;return[b.id,r?Object.keys(r.chapters).length:0]as const;})).then(x=>{if(live)setReady(Object.fromEntries(x));});return()=>{live=false;};},[books]);
 if(!books.length)return <div className="home"><h1 className="home-h"><span className="home-icon"><LibraryBooksOutlined/></span>Your library is empty</h1><Button variant="contained" onClick={onAdd}>Add a book</Button></div>;
 return <div className="home">
  <section>
   <h1 className="home-h"><span className="home-icon"><AccessTimeRounded/></span>Continue reading</h1>
   <div className="continue">{recent.map(b=>{
    const main=mainChapters(b),at=Math.max(0,main.findIndex(c=>c.id===b.chapters[b.chapterIndex]?.id));
    const share=main.length?Math.max(b.completed.filter(id=>main.some(c=>c.id===id)).length,b.lastRead?at:0)/main.length:0;
    return <article className="cont-card" key={b.id}>
     <button className="cont-open" onClick={()=>b.lastRead?onRead(b):onOpen(b)}>
      <Shelf book={b} url={covers[b.id]}/>
      <span className="cont-text"><strong dir="auto">{strip(b.title).split(':')[0]}</strong><span dir="auto">{author(b)}</span><small>{b.lastRead?'Chapter '+(at+1)+' of '+main.length:main.length+' chapters'}{ready[b.id]?' · '+ready[b.id]+' summaries ready':''}</small></span>
     </button>
     <div className="cont-foot"><span className="bar"><span style={{width:Math.round(share*100)+'%'}}/></span>
      {ready[b.id]?<button className="round" aria-label={'Listen to '+b.title} onClick={()=>onListen(b)}><PlayArrowRounded/></button>:<button className="round" aria-label={'Open '+b.title} onClick={()=>b.lastRead?onRead(b):onOpen(b)}><ChevronRightRounded/></button>}
     </div>
    </article>;})}</div>
  </section>
  <section>
   <div className="home-row"><h2 className="home-h small"><span className="home-icon"><LibraryBooksOutlined/></span><span>My library<small>{books.length} {books.length===1?'book':'books'}</small></span></h2><button className="see-all" onClick={()=>navigate('/library')}>See all <ArrowForwardRounded/></button></div>
   <div className="shelf-row">{books.slice(0,6).map(b=><button key={b.id} className="shelf-item" onClick={()=>onOpen(b)}><Shelf book={b} url={covers[b.id]}/><strong dir="auto">{strip(b.title).split(':')[0]}</strong><span dir="auto">{author(b)}</span></button>)}</div>
  </section>
  {saved.length>0&&<section>
   <div className="home-row"><h2 className="home-h small"><span className="home-icon"><BookmarkBorderRounded/></span><span>Saved passages<small>{saved.length} {saved.length===1?'item':'items'}</small></span></h2><button className="see-all" onClick={()=>navigate('/saved')}>See all <ArrowForwardRounded/></button></div>
   <div className="quotes">{[...saved].sort((a,b)=>b.savedAt-a.savedAt).slice(0,3).map(p=><blockquote key={p.id}><p dir="auto">“{p.text.length>260?p.text.slice(0,260)+'…':p.text}”</p><cite>{strip(p.title).split(':')[0]} · {p.location.replace(/ · Passage \d+$/,'')}</cite></blockquote>)}</div>
  </section>}
 </div>;
}
