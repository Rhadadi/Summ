import type{PubBook}from'./types';
import type{Backdrop}from'./MuseumHero';
import{galleryBackdrop}from'./MuseumHero';
import{rotation}from'./art';
import{sized}from'./img';

// Moved to home-order.ts so node tests can import it; re-exported for existing callers.
export{homeBooks}from'./home-order.ts';

// Keep the book's artwork identical wherever the reader meets it.
export function bookBackdrop(book:PubBook,index:number):Backdrop{
 if((book.slide?.mode==='art'||book.slide?.mode==='upload')&&book.slide.art)return{url:book.slide.art,position:'50% 40%',credit:book.slide.credit,frame:book.slide.frame,framePhone:book.slide.framePhone,whole:book.slide.fit==='whole',caption:book.slide.caption?{text:book.slide.caption,url:book.slide.captionUrl}:undefined};
 if(book.slide?.mode==='cover'&&book.cover)return{url:sized(book.cover,800),position:'50% 50%',blur:true,credit:null};
 return{...galleryBackdrop(rotation[index%rotation.length]),whole:book.slide?.fit==='whole',...(book.slide?.caption?{caption:{text:book.slide.caption,url:book.slide.captionUrl}}:{})};
}
