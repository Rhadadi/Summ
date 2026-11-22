import{AutoStoriesOutlined}from'@mui/icons-material';
import type{RelatedBook}from'./types';
import{num,tr}from'./i18n';
import{directReviewPage}from'./review-links';
import{relatedView,showRating,yearText}from'./related-view';
import{Stars}from'./ReviewSection';

// "If you liked this book": books of this library first, then well-rated ones elsewhere. Fewer than two is not a shelf, so nothing shows.
export default function RelatedShelf({books,lang}:{books:RelatedBook[];lang?:string}){
 const L=(t:string)=>tr(lang,t),cards=relatedView(books,lang,L);
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
   if(c.slug)return <a key={c.key} className="rel-book" href={'#/b/'+c.slug}>{body}</a>;
   return c.url&&directReviewPage(c.url)?<a key={c.key} className="rel-book" href={c.url} target="_blank" rel="noopener noreferrer">{body}</a>:<div key={c.key} className="rel-book">{body}</div>;
  })}</div>
 </section>;
}
