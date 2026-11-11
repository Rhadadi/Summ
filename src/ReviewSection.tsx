import{StarBorderRounded,StarHalfRounded,StarRounded,OpenInNewRounded,ThumbDownAltOutlined,ThumbUpAltOutlined}from'@mui/icons-material';
import type{Review}from'./types';
import{num,tr}from'./i18n';

export const Stars=({value}:{value:number})=><span className="rv-stars" role="img" aria-label={value.toFixed(1)+' out of 5'}>{[1,2,3,4,5].map(i=>value>=i-.25?<StarRounded key={i}/>:value>=i-.75?<StarHalfRounded key={i}/>:<StarBorderRounded key={i}/>)}</span>;
const host=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url;}};
const find=(title:string,author:string)=>encodeURIComponent((title.split(':')[0]+' '+author).trim());
// Where to read the rest: links only, because those sites do not allow copying their reviews.
export const lookupLinks=(title:string,author:string)=>[
 {name:'Goodreads',url:'https://www.goodreads.com/search?q='+find(title,author)},
 {name:'The New York Times',url:'https://www.nytimes.com/search?query='+find(title,author)},
 {name:'The Guardian',url:'https://www.theguardian.com/search?q='+find(title,author)},
];
// The reception of a book: a verdict, a score, what critics and readers praise and fault, short attributed quotes and where to read more.
export default function ReviewSection({review,title,author,draft=false,lang}:{review:Review;title:string;author:string;draft?:boolean;lang?:string}){
 const L=(t:string)=>tr(lang,t);
 return <div className="rv">
  {draft&&<p className="rv-draft">{L('Draft · not yet approved for readers')}</p>}
  {(review.rating||review.verdict)&&<div className="rv-top">
   {review.rating&&<div className="rv-score"><b>{num(lang,+review.rating.value.toFixed(1))}</b><Stars value={review.rating.value}/><small>{review.rating.url?<a href={review.rating.url} target="_blank" rel="noopener noreferrer">{review.rating.source}</a>:review.rating.source}{review.rating.count?' · '+review.rating.count.toLocaleString()+' ratings':''}</small></div>}
   {review.verdict&&<p className="rv-verdict" dir="auto">{review.verdict}</p>}
  </div>}
  {(review.themes?.length||0)>0&&<div className="rv-themes">{review.themes!.map(t=><span key={t} dir="auto">{t}</span>)}</div>}
  {(review.pros.length>0||review.cons.length>0)&&<div className="rv-cols">
   {review.pros.length>0&&<div><h3><ThumbUpAltOutlined/>{L('What readers praise')}</h3><ul>{review.pros.map((p,i)=><li key={i} dir="auto">{p}</li>)}</ul></div>}
   {review.cons.length>0&&<div><h3><ThumbDownAltOutlined/>{L('Where it is faulted')}</h3><ul>{review.cons.map((p,i)=><li key={i} dir="auto">{p}</li>)}</ul></div>}
  </div>}
  {review.quotes.length>0&&<div className="rv-quotes"><h3>{L('In their words')}</h3>{review.quotes.map((q,i)=><figure key={i}><blockquote dir="auto">“{q.text}”</blockquote><figcaption>{q.who}{q.who&&q.source?' · ':''}{q.url?<a href={q.url} target="_blank" rel="noopener noreferrer">{q.source||host(q.url)}<OpenInNewRounded fontSize="inherit"/></a>:q.source}</figcaption></figure>)}</div>}
  {(review.audience||review.aboutAuthor)&&<div className="rv-cols">
   {review.audience&&<div><h3>{L('Who it is for')}</h3><p dir="auto">{review.audience}</p></div>}
   {review.aboutAuthor&&<div><h3>{L('About the author')}</h3><p dir="auto">{review.aboutAuthor}</p></div>}
  </div>}
  {(review.similar?.length||0)>0&&<div className="rv-similar"><h3>{L('If you liked this')}</h3><div>{review.similar!.map((b,i)=><a key={i} href={'https://www.goodreads.com/search?q='+encodeURIComponent(b.title+' '+b.author)} target="_blank" rel="noopener noreferrer"><strong dir="auto">{b.title}</strong><span dir="auto">{b.author}</span>{b.why&&<small dir="auto">{b.why}</small>}</a>)}</div></div>}
  <div className="rv-links"><span>{L('Read more:')}</span>{review.sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.name}<OpenInNewRounded fontSize="inherit"/></a>)}{lookupLinks(title,author).filter(l=>!review.sources.some(s=>host(s.url)===host(l.url))).map(l=><a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer">{l.name}<OpenInNewRounded fontSize="inherit"/></a>)}</div>
 </div>;
}
