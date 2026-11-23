import{useState}from'react';
import{Button,Dialog,DialogContent,IconButton}from'@mui/material';
import{AutoStoriesOutlined,CloseRounded,OpenInNewRounded,SendRounded}from'@mui/icons-material';
import{requestBook}from'./api';
import type{RelatedBook}from'./types';
import{num,tr}from'./i18n';
import{relatedView,showRating,yearText}from'./related-view';
import{Stars}from'./ReviewSection';

// "If you liked this book": books of this library first, then well-rated ones elsewhere. Fewer than two is not a shelf, so nothing shows.
// A book of this library opens here. One the library does not have opens a card that says so, with a one-tap request for its
// summary and its Goodreads page (catalogue pages on Open Library or Google Books said little and looked like our own).
export default function RelatedShelf({books,lang}:{books:RelatedBook[];lang?:string}){
 const L=(t:string)=>tr(lang,t),cards=relatedView(books,lang,L);
 const[open,setOpen]=useState<(typeof cards)[number]|null>(null),[sent,setSent]=useState<Record<string,'busy'|'done'|'error'>>({});
 if(!cards.length)return null;
 return <section className="related" aria-labelledby="related-h">
  <h2 id="related-h">{L('If you liked this book')}</h2>
  <div className="rel-shelf">{cards.map(c=>{
   const body=<>
    <span className={'rel-cover'+(c.cover?'':' blank')}>{c.cover?<img src={c.cover} alt="" loading="lazy" decoding="async"/>:<span dir="auto">{c.title}</span>}{c.inLibrary&&<span className="rel-badge"><AutoStoriesOutlined/>{L('In this library')}</span>}</span>
    {/* A Latin title inside a Persian card keeps its own direction but sits at the card's start edge. */}
    <strong className="rel-title">{c.ltr?<bdi dir="ltr" lang="en">{c.title}</bdi>:<bdi dir="auto">{c.title}</bdi>}</strong>
    {c.original&&<span className="rel-original"><bdi dir="ltr" lang="en">{c.original}</bdi></span>}
    <span className="rel-author"><bdi dir="auto">{c.author}</bdi>{c.year&&!c.inLibrary?' · '+yearText(lang,c.year):''}</span>
    {showRating(c)&&<span className="rel-rating"><Stars value={c.rating!}/><b>{num(lang,+c.rating!.toFixed(1))}</b><small>({num(lang,c.count!)})</small></span>}
    {c.why&&<small className="rel-why" dir="auto">{c.why}</small>}
   </>;
   if(c.slug)return <a key={c.key} className="rel-book" href={'/b/'+c.slug}>{body}</a>;
   return <button type="button" key={c.key} className="rel-book" onClick={()=>setOpen(c)}>{body}</button>;
  })}</div>
  {open&&(()=>{const c=open,name=c.original||c.title,state=sent[c.key];
   const ask=async()=>{setSent(x=>({...x,[c.key]:'busy'}));try{await requestBook({title:name,author:c.author,note:L('Suggested next to another book in the library.'),email:'',lang:lang||'fa',website:''});setSent(x=>({...x,[c.key]:'done'}));}catch{setSent(x=>({...x,[c.key]:'error'}));}};
   return <Dialog open onClose={()=>setOpen(null)} maxWidth="xs" fullWidth slotProps={{paper:{className:'rel-sheet',dir:lang==='fa'?'rtl':'ltr',lang}}}>
    <IconButton className="rel-sheet-close" aria-label={L('Close')} onClick={()=>setOpen(null)}><CloseRounded/></IconButton>
    <DialogContent>
     <div className="rel-sheet-top">{c.cover&&<img src={c.cover} alt=""/>}<div>
      <strong>{c.ltr?<bdi dir="ltr" lang="en">{c.title}</bdi>:<bdi dir="auto">{c.title}</bdi>}</strong>
      {c.original&&<span className="rel-original"><bdi dir="ltr" lang="en">{c.original}</bdi></span>}
      <span className="rel-author"><bdi dir="auto">{c.author}</bdi>{c.year?' · '+yearText(lang,c.year):''}</span>
      {showRating(c)&&<span className="rel-rating"><Stars value={c.rating!}/><b>{num(lang,+c.rating!.toFixed(1))}</b><small>({num(lang,c.count!)})</small></span>}
     </div></div>
     {c.why&&<p className="rel-sheet-why" dir="auto">{c.why}</p>}
     <p className="rel-sheet-note">{L('This book is not in the library yet. Ask for its summary and we will tell the editor.')}</p>
     <div className="rel-sheet-actions">
      <Button variant="contained" startIcon={<SendRounded/>} disabled={state==='busy'||state==='done'} onClick={ask}>{state==='done'?L('Request sent. Thank you!'):L('Request this summary')}</Button>
      <Button variant="text" endIcon={<OpenInNewRounded/>} href={'https://www.goodreads.com/search?q='+encodeURIComponent(name+' '+c.author)} target="_blank" rel="noopener noreferrer">{L('See it on Goodreads')}</Button>
     </div>
     {state==='error'&&<p className="rel-sheet-error">{L('The request could not be sent. Try again in a moment.')}</p>}
    </DialogContent>
   </Dialog>;})()}
 </section>;
}
