import{useEffect,useState}from'react';
import{sized}from'./img';
import{AccessTimeRounded,ArrowForwardRounded,BookmarkBorderRounded,ChevronRightRounded,LibraryBooksOutlined,PlayArrowRounded}from'@mui/icons-material';
import{Button}from'@mui/material';
import type{Book,HomeConfig,PubBook,SavedPassage}from'./types';
import{store}from'./storage';
import{displayName}from'./core';
import{mainChapters,strip}from'./bookData';
import Cover from'./Cover';
import MuseumHero,{galleryBackdrop,type Slide}from'./MuseumHero';
import{bookBackdrop,homeBooks}from'./bookBackdrop';
import{tr,num}from'./i18n';
import{publicTitle}from'./discovery';
import{art}from'./art';
import Community from'./Community';
import type{Account}from'./types';

interface Props{account:Account|null;mailEnabled:boolean;isOwner:boolean;config:HomeConfig|null;onEditHome:()=>void;lang:string;published:PubBook[]|null;canEdit:boolean;onOpenPublished:(book:PubBook)=>void;books:Book[];covers:Record<string,string>;saved:SavedPassage[];onRead:(book:Book)=>void;onOpen:(book:Book)=>void;onListen:(book:Book)=>void;onAdd:()=>void;navigate:(path:string)=>void}
export const author=(b:Book)=>b.author==='Author not supplied'?'':displayName(b.author);
export function Shelf({book,url}:{book:Book;url?:string}){return <span className="shelf"><span className="shelf-arc"/><Cover book={book} url={url} className="shelf-cover"/></span>;}
export default function HomePage({account,mailEnabled,isOwner,config,onEditHome,lang,published,canEdit,onOpenPublished,books,covers,saved,onRead,onOpen,onListen,onAdd,navigate}:Props){
 const L=(text:string)=>tr(lang,text);
 const[ready,setReady]=useState<Record<string,number>>({});
 const recent=[...books].sort((a,b)=>(b.lastRead||b.addedAt)-(a.lastRead||a.addedAt)).slice(0,4);
 // Whole-book reports say how many chapters already have summaries to listen to.
 useEffect(()=>{let live=true;Promise.all(recent.map(async b=>{const key=await store.latestReport(b.id).catch(()=>undefined);const r=key?await store.report(key).catch(()=>undefined):undefined;return[b.id,r?Object.keys(r.chapters).length:0]as const;})).then(x=>{if(live)setReady(Object.fromEntries(x));});return()=>{live=false;};},[books]);
 const first=(b:PubBook)=>{const title=publicTitle(b,lang).split(':')[0];return title.match(/^.*?[؟?]/)?.[0]||title;};
 const all=published||[];
 // The owner's order and choices; books not mentioned follow, newest first.
 const setting=(id:string)=>config?.slides.find(x=>x.id===id);
 const books_=homeBooks(all,config);
 // The first slide always says what this place is; each published book then gets a painting of its own.
 const oneLiner=(t:string)=>{const m=t.match(/^.{40,170}?[.!?؟。](?=\s|$)/);return m?m[0]:t.length>170?t.slice(0,t.lastIndexOf(' ',160))+'…':t;};
 const names:Record<string,string>={en:'English',fa:'Persian',ar:'Arabic',de:'German',es:'Spanish',fr:'French',tr:'Turkish',zh:'Chinese'};
 // The editor chooses: a painting picked for the book, its cover alone, or (by default) the next gallery painting.
 const slides:Slide[]=books_.length?books_.slice(0,12).map((b,i):Slide=>({key:b.id,seconds:setting(b.id)?.seconds||undefined,backdrop:bookBackdrop(b,i),eyebrow:'',title:first(b),by:displayName(b.author)+(b.year?' · '+b.year:''),text:oneLiner(b.blurb||(lang==='fa'?'ایده‌های اصلی کتاب را در خلاصهٔ فصل‌ها بخوانید.':'Explore the book through its chapter summaries.')),cover:b.cover,rtl:/[؀-ۿ]/.test(first(b)),score:config?.stars===false?undefined:(b.rating||undefined),facts:[num(lang,b.chapters)+' '+L('chapters'),b.languages.map(l=>l==='fa'?'فارسی':names[l]||l).join(' · ')],actions:[{label:L('Read the summary'),primary:true,onClick:()=>onOpenPublished(b)},{label:L('See the library'),onClick:()=>navigate('/library')}]}))
  :[{key:'welcome',backdrop:galleryBackdrop(art.hokusai),eyebrow:'Inkling',title:'Books worth reading, in minutes.',text:'The first summaries are being prepared. Check back soon.',actions:[{label:'Browse the library',primary:true,onClick:()=>navigate('/library')},...(canEdit?[{label:'Add a book',onClick:onAdd}]:[])]}];
 const intro=<>
  <MuseumHero slides={slides} lang={lang} seconds={config?.seconds||3} autoplay={config?.autoplay!==false}/>{canEdit&&<div className="home-edit"><button onClick={onEditHome}>Edit the home page</button>{isOwner&&<button onClick={()=>navigate('/mailing')}>Requests and mailing list</button>}</div>}
  {config?.shelf!==false&&<section className="m-wall" aria-label={L('The library')}>
   {books_.length>0&&<div className="m-wall-grid">{books_.slice(0,8).map(b=><button key={b.id} className="m-card" onClick={()=>onOpenPublished(b)}><span className={'m-card-cover'+(b.cover?'':' blank')}>{b.cover?<img src={sized(b.cover,480)} alt="" loading="lazy"/>:<span dir="auto">{first(b)}</span>}</span><strong dir="auto">{first(b)}</strong><span dir="auto">{displayName(b.author)}</span></button>)}</div>}
  </section>}
  <Community lang={lang} account={account} mailEnabled={mailEnabled}/>
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
