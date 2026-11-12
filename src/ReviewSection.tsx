import{StarBorderRounded,StarHalfRounded,StarRounded,OpenInNewRounded,EmojiEventsOutlined}from'@mui/icons-material';
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
type Score={value:number;source:string;count:number|null;url:string|null};
const stanceLabel:Record<string,string>={positive:'Praised',mixed:'Mixed',negative:'Critical'};
// The reception of a book, laid out like the reviews page of a magazine: scores, the critics, readers, praise and doubts,
// who it is for, the author, prizes and what to read next. Every excerpt links to where it was published.
export default function ReviewSection({review,scores=[],title,author,draft=false,lang}:{review:Review|null;scores?:Score[];title:string;author:string;draft?:boolean;lang?:string}){
 const L=(t:string)=>tr(lang,t);
 const all:Score[]=[...(review?.ratings?.length?review.ratings:review?.rating?[review.rating]:[]),...scores].filter((s,i,a)=>a.findIndex(x=>x.source.toLowerCase()===s.source.toLowerCase())===i).slice(0,4);
 const critics=review?.critics||[],readers=review?.readers||[];
 // Older reviews kept plain quotes; they are shown with the critics.
 const quotes=critics.length||readers.length?[]:review?.quotes||[];
 const sources=[...(review?.sources||[]),...lookupLinks(title,author)].filter((s,i,a)=>a.findIndex(x=>host(x.url)===host(s.url))===i);
 return <div className="rv">
  {draft&&<p className="rv-draft">{L('Draft · not yet approved for readers')}</p>}
  {(all.length>0||review?.verdict)&&<div className="rv-board">
   {all.length>0&&<div className="rv-scores">{all.map(s=><a key={s.source} className="rv-score" href={s.url||undefined} target="_blank" rel="noopener noreferrer"><b>{num(lang,+s.value.toFixed(1))}</b><Stars value={s.value}/><small>{s.source}{s.count?' · '+num(lang,s.count)+' '+L('ratings'):''}</small></a>)}</div>}
   {review?.verdict&&<blockquote className="rv-verdict" dir="auto">{review.verdict}</blockquote>}
  </div>}
  {(review?.themes?.length||0)>0&&<div className="rv-themes">{review!.themes!.map(t=><span key={t} dir="auto">{t}</span>)}</div>}
  {critics.length>0&&<section className="rv-block"><h3>{L('What the critics said')}</h3><div className="rv-critics">{critics.map((c,i)=><article key={i} className={'rv-critic '+(c.stance||'none')}>
   <header><span className="rv-pub">{c.publication}</span>{c.stance&&<span className="rv-stance">{L(stanceLabel[c.stance])}</span>}</header>
   {c.headline&&<h4 dir="auto">{lang&&c.headlineTranslation||c.headline}</h4>}
   {c.excerpt&&<blockquote dir="auto">“{c.excerpt}”</blockquote>}
   {c.excerpt&&c.translation&&<p className="rv-translation" dir="auto">{c.translation}</p>}
   {c.summary&&<p dir="auto">{c.summary}</p>}
   <footer>{[c.reviewer,c.date].filter(Boolean).join(' · ')}{c.url&&<a href={c.url} target="_blank" rel="noopener noreferrer">{L('Read the review')}<OpenInNewRounded fontSize="inherit"/></a>}</footer>
  </article>)}</div></section>}
  {(readers.length>0||quotes.length>0)&&<section className="rv-block"><h3>{L(readers.length?'What readers said':'In their words')}</h3><div className="rv-readers">
   {readers.map((r,i)=><figure key={i}>{r.stars!=null&&<Stars value={r.stars}/>}{r.excerpt&&<blockquote dir="auto">“{r.excerpt}”</blockquote>}{r.excerpt&&r.translation&&<p className="rv-translation" dir="auto">{r.translation}</p>}{r.summary&&!r.excerpt&&<p dir="auto">{r.summary}</p>}<figcaption>{r.name}{r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer"><OpenInNewRounded fontSize="inherit"/></a>}</figcaption></figure>)}
   {quotes.map((q,i)=><figure key={'q'+i}><blockquote dir="auto">“{q.text}”</blockquote><figcaption>{q.who}{q.who&&q.source?' · ':''}{q.url?<a href={q.url} target="_blank" rel="noopener noreferrer">{q.source||host(q.url)}<OpenInNewRounded fontSize="inherit"/></a>:q.source}</figcaption></figure>)}
  </div></section>}
  {review&&(review.pros.length>0||review.cons.length>0)&&<section className="rv-block rv-cols">
   {review.pros.length>0&&<div className="rv-pros"><h3>{L('What readers praise')}</h3><ul>{review.pros.map((p,i)=><li key={i} dir="auto">{p}</li>)}</ul></div>}
   {review.cons.length>0&&<div className="rv-cons"><h3>{L('Where it is faulted')}</h3><ul>{review.cons.map((p,i)=><li key={i} dir="auto">{p}</li>)}</ul></div>}
  </section>}
  {review&&((review.awards?.length||0)>0||review.impact)&&<section className="rv-block rv-legacy">
   {(review.awards?.length||0)>0&&<div className="rv-awards">{review.awards!.map(a=><span key={a} dir="auto"><EmojiEventsOutlined/>{a}</span>)}</div>}
   {review.impact&&<p dir="auto">{review.impact}</p>}
  </section>}
  {(review?.similar?.length||0)>0&&<section className="rv-block rv-similar"><h3>{L('If you liked this')}</h3><div>{review!.similar!.map((b,i)=><a key={i} href={'https://www.goodreads.com/search?q='+encodeURIComponent(b.title+' '+b.author)} target="_blank" rel="noopener noreferrer"><strong dir="auto">{b.title}</strong><span dir="auto">{b.author}</span>{b.why&&<small dir="auto">{b.why}</small>}</a>)}</div></section>}
  <div className="rv-links"><span>{L('Read more:')}</span>{sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.name}<OpenInNewRounded fontSize="inherit"/></a>)}</div>
 </div>;
}
