import type{HomeConfig,PubBook}from'./types';
import type{Backdrop}from'./MuseumHero';
import{galleryBackdrop}from'./MuseumHero';
import{rotation}from'./art';
import{sized}from'./img';

export function homeBooks(books:PubBook[],config:HomeConfig|null){
 const order=(id:string)=>{const i=config?.slides.findIndex(s=>s.id===id)??-1;return i<0?1e6:i;};
 return [...books].sort((a,b)=>order(a.id)-order(b.id)).filter(b=>!config?.slides.find(s=>s.id===b.id)?.hidden);
}

// Keep the book's artwork identical wherever the reader meets it.
export function bookBackdrop(book:PubBook,index:number):Backdrop{
 if((book.slide?.mode==='art'||book.slide?.mode==='upload')&&book.slide.art)return{url:book.slide.art,position:'50% 40%',credit:book.slide.credit,whole:book.slide.fit==='whole',caption:book.slide.caption?{text:book.slide.caption,url:book.slide.captionUrl}:undefined};
 if(book.slide?.mode==='cover'&&book.cover)return{url:sized(book.cover,800),position:'50% 50%',blur:true,credit:null};
 return{...galleryBackdrop(rotation[index%rotation.length]),whole:book.slide?.fit==='whole',...(book.slide?.caption?{caption:{text:book.slide.caption,url:book.slide.captionUrl}}:{})};
}
