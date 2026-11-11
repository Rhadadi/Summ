import{useEffect,useState}from'react';
import{AccessTimeRounded,ArrowForwardRounded,BookmarkBorderRounded,ChevronRightRounded,LibraryBooksOutlined,PlayArrowRounded}from'@mui/icons-material';
import{Button}from'@mui/material';
import type{Book,PubBook,SavedPassage}from'./types';
import{store}from'./storage';
import{displayName}from'./core';
import{mainChapters,strip}from'./bookData';
import Cover from'./Cover';
import MuseumHero,{type Slide}from'./MuseumHero';
import{art,rotation}from'./art';

interface Props{published:PubBook[]|null;canEdit:boolean;onOpenPublished:(book:PubBook)=>void;books:Book[];covers:Record<string,string>;saved:SavedPassage[];onRead:(book:Book)=>void;onOpen:(book:Book)=>void;onListen:(book:Book)=>void;onAdd:()=>void;navigate:(path:string)=>void}
export const author=(b:Book)=>b.author==='Author not supplied'?'':displayName(b.author);
export function Shelf({book,url}:{book:Book;url?:string}){return <span className="shelf"><span className="shelf-arc"/><Cover book={book} url={url} className="shelf-cover"/></span>;}
export default function HomePage({published,canEdit,onOpenPublished,books,covers,saved,onRead,onOpen,onListen,onAdd,navigate}:Props){
 const[ready,setReady]=useState<Record<string,number>>({});
 const recent=[...books].sort((a,b)=>(b.lastRead||b.addedAt)-(a.lastRead||a.addedAt)).slice(0,4);
 // Whole-book reports say how many chapters already have summaries to listen to.
 useEffect(()=>{let live=true;Promise.all(recent.map(async b=>{const key=await store.latestReport(b.id).catch(()=>undefined);const r=key?await store.report(key).catch(()=>undefined):undefined;return[b.id,r?Object.keys(r.chapters).length:0]as const;})).then(x=>{if(live)setReady(Object.fromEntries(x));});return()=>{live=false;};},[books]);
 const first=(b:PubBook)=>b.title.split(':')[0];
 const books_=published||[];
 // The first slide always says what this place is; each published book then gets a painting of its own.
 const slides:Slide[]=[
  {key:'welcome',art:art.hokusai,eyebrow:'Inkling',title:'Books worth reading, in minutes.',text:'Short, beautifully written summaries of serious books. Read them, hear them, and take the ideas with you, in your own language.',actions:[{label:'Browse the library',primary:true,onClick:()=>navigate('/library')},...(canEdit?[{label:'Add a book',onClick:onAdd}]:[])]},
  ...books_.slice(0,5).map((b,i):Slide=>({key:b.id,art:rotation[i%rotation.length],eyebrow:'New in the library'+(b.languages.length>1?' · '+b.languages.length+' languages':''),title:first(b),by:displayName(b.author),text:b.blurb||'A summary of every chapter, with page references and a narrated version.',cover:b.cover,rtl:/[؀-ۿ]/.test(first(b)),actions:[{label:'Read the summary',primary:true,onClick:()=>onOpenPublished(b)},{label:'See the library',onClick:()=>navigate('/library')}]})),
  {key:'language',art:art.layla,eyebrow:'In the language you think in',title:'Persian, English, and more.',text:'Every chapter, summarized in the language you read best, with the chapter titles to match.',actions:[{label:'Choose a book',primary:true,onClick:()=>navigate('/library')}]},
 ];
 const ways=[
  {art:art.spitzweg,title:'Read in minutes',text:'Every chapter in a few calm paragraphs, with the page numbers to check them against the book.'},
  {art:art.hammershoi,title:'Listen anywhere',text:'A narrated version of each summary, ready to play while you walk, cook or wait.'},
  {art:art.friedrich,title:'See the whole book',text:'An overview, the key ideas and what readers made of it, before you decide what to read next.'},
 ];
 const intro=<>
  <MuseumHero slides={slides}/>
  <section className="m-ways" aria-label="Ways in">
   <p className="m-kicker">Three ways in</p>
   <div className="m-ways-grid">{ways.map(w=><button key={w.title} className="m-way" onClick={()=>navigate('/library')}><span className="m-way-img"><img src={import.meta.env.BASE_URL+'art/'+w.art.file} alt="" loading="lazy" style={{objectPosition:w.art.position}}/></span><small><em>{w.art.title}</em>, {w.art.artist}</small><strong>{w.title}</strong><span>{w.text}</span><span className="m-way-go">Start <ArrowForwardRounded/></span></button>)}</div>
  </section>
  <section className="m-wall" aria-label="The library">
   <div className="m-wall-head"><div><p className="m-kicker">On the wall now</p><h2>{books_.length?'Pick one and begin.':'The first summaries are on their way.'}</h2></div>{books_.length>0&&<button className="see-all" onClick={()=>navigate('/library')}>See all {books_.length} <ArrowForwardRounded/></button>}</div>
   {books_.length>0&&<div className="m-wall-grid">{books_.slice(0,8).map(b=><button key={b.id} className="m-card" onClick={()=>onOpenPublished(b)}><span className={'m-card-cover'+(b.cover?'':' blank')}>{b.cover?<img src={b.cover} alt="" loading="lazy"/>:<span dir="auto">{first(b)}</span>}</span><strong dir="auto">{first(b)}</strong><span dir="auto">{displayName(b.author)}</span></button>)}</div>}
  </section>
 </>;
 if(!canEdit)return <div className="museum-home">{intro}</div>;
 if(!books.length)return <div className="museum-home">{intro}<div className="home desk"><h2 className="m-kicker">Your desk</h2><h1 className="home-h"><span className="home-icon"><LibraryBooksOutlined/></span>Your workspace is empty</h1><Button variant="contained" onClick={onAdd}>Add a book</Button></div></div>;
 return <div className="museum-home">{intro}<div className="home desk">
  <h2 className="m-kicker">Your desk</h2>
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
   <div className="home-row"><h2 className="home-h small"><span className="home-icon"><LibraryBooksOutlined/></span><span>Your workspace<small>{books.length} {books.length===1?'book':'books'}</small></span></h2><button className="see-all" onClick={()=>navigate('/workspace')}>See all <ArrowForwardRounded/></button></div>
   <div className="shelf-row">{books.slice(0,6).map(b=><button key={b.id} className="shelf-item" onClick={()=>onOpen(b)}><Shelf book={b} url={covers[b.id]}/><strong dir="auto">{strip(b.title).split(':')[0]}</strong><span dir="auto">{author(b)}</span></button>)}</div>
  </section>
  {saved.length>0&&<section>
   <div className="home-row"><h2 className="home-h small"><span className="home-icon"><BookmarkBorderRounded/></span><span>Saved passages<small>{saved.length} {saved.length===1?'item':'items'}</small></span></h2><button className="see-all" onClick={()=>navigate('/saved')}>See all <ArrowForwardRounded/></button></div>
   <div className="quotes">{[...saved].sort((a,b)=>b.savedAt-a.savedAt).slice(0,3).map(p=><blockquote key={p.id}><p dir="auto">“{p.text.length>260?p.text.slice(0,260)+'…':p.text}”</p><cite>{strip(p.title).split(':')[0]} · {p.location.replace(/ · Passage \d+$/,'')}</cite></blockquote>)}</div>
  </section>}
 </div></div>;
}
