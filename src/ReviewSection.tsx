import{useState}from'react';
import{StarBorderRounded,StarHalfRounded,StarRounded,OpenInNewRounded,EmojiEventsOutlined,ExpandMoreRounded,MenuBookRounded,HeadphonesRounded}from'@mui/icons-material';
import type{Review}from'./types';
import{num,tr}from'./i18n';
import{originalFor,quoteFor,quoteIsForeign,receptionView,year}from'./reception-view';
import type{Score}from'./reception-view';

export const Stars=({value}:{value:number})=><span className="rv-stars" role="img" aria-label={value.toFixed(1)+' out of 5'}>{[1,2,3,4,5].map(i=>value>=i-.25?<StarRounded key={i}/>:value>=i-.75?<StarHalfRounded key={i}/>:<StarBorderRounded key={i}/>)}</span>;
type View=ReturnType<typeof receptionView>;
type Critic=NonNullable<Review['critics']>[number];
const stanceLabel:Record<string,string>={positive:'Praised',mixed:'Mixed',negative:'Critical'};
type Tr={L:(t:string)=>string;lang?:string};
const Ext=()=><OpenInNewRounded fontSize="inherit"/>;
// "From 6 critics and 4 readers · ★ 4.1 on Goodreads": built from small translated words so it reads well in both languages.
function Kicker({v,L,lang}:{v:View}&Tr){
 const who=([[v.counts.critics,'critic'],[v.counts.readers,'reader']] as [number,string][]).filter(x=>x[0]>0).map(x=>num(lang,x[0])+' '+L(x[1]+(x[0]===1?'':'s')));
 const s=v.scores[0],parts=[who.length?L('From')+' '+who.join(' '+L('and')+' '):'',s?'★ '+num(lang,+s.value.toFixed(1))+' '+L('on')+' '+s.source:''].filter(Boolean);
 return parts.length?<p className="rx-kicker">{parts.join(' · ')}</p>:null;
}
function ScoreChips({scores,L,lang}:{scores:Score[]}&Tr){
 return <div className="rx-scores">{scores.map(s=>{
  const body=<><b>{num(lang,+s.value.toFixed(1))}</b><span><Stars value={s.value}/><small>{s.source}{s.count?' · '+num(lang,s.count)+' '+L('ratings'):''}</small></span></>;
  return s.url?<a key={s.source} className="rx-score" href={s.url} target="_blank" rel="noopener noreferrer">{body}</a>:<div key={s.source} className="rx-score">{body}</div>;
 })}</div>;
}
function Summary({v,L,lang}:{v:View}&Tr){
 if(!v.lead&&!v.scores.length&&!v.themes.length)return null;
 return <div className={'rx-summary'+(v.scores.length&&v.lead?'':' solo')}>
  {(v.lead||v.themes.length>0)&&<div className="rx-verdict">
   {v.lead&&<p className="rx-lead" dir="auto">{v.lead}</p>}
   {v.rest&&<p className="rx-rest" dir="auto">{v.rest}</p>}
   {v.themes.length>0&&<div className="rx-themes">{v.themes.map(t=><span key={t} dir="auto">{t}</span>)}</div>}
  </div>}
  {v.scores.length>0&&<ScoreChips scores={v.scores} L={L} lang={lang}/>}
 </div>;
}
// Three points, then the rest on request. Praise is green and plus, doubts terracotta and minus.
function Points({title,list,kind,L,lang}:{title:string;list:{top:string[];all:string[]};kind:'pro'|'con'}&Tr){
 const[all,setAll]=useState(false),items=all?list.all:list.top;
 if(!list.all.length)return null;
 return <div className={'rx-points '+kind+(all?' open':'')}>
  <h3>{L(title)}</h3>
  <ul>{items.map((p,i)=><li key={i} dir="auto">{p}</li>)}</ul>
  {list.all.length>list.top.length&&<button className="rx-more" aria-expanded={all} onClick={()=>setAll(!all)}>{all?L('Show less'):L('Show all')+' ('+num(lang,list.all.length)+')'}</button>}
 </div>;
}
const Stance=({c,L}:{c:Critic}&Pick<Tr,'L'>)=>c.stance?<span className={'rx-stance '+c.stance}><i/>{L(stanceLabel[c.stance])}</span>:null;
const byline=(c:{reviewer?:string;date?:string},lang?:string)=>[c.reviewer&&c.reviewer!==(c as Critic).publication?c.reviewer:'',year(c.date,lang)].filter(Boolean).join(' · ');
function Featured({c,L,lang}:{c:Critic}&Tr){
 const text=quoteFor(c,lang),original=originalFor(c,lang),foreign=quoteIsForeign(c,lang);
 return <figure className={'rx-featured '+(c.stance||'none')}>
  <span className="rx-mark" aria-hidden>“</span>
  <blockquote dir={foreign?'ltr':'auto'} lang={foreign?'en':undefined}>{text}</blockquote>
  {original&&<details className="rx-original"><summary>{L('Original wording')}</summary><p dir="ltr" lang="en">{original}</p></details>}
  <figcaption>
   <span className="rx-by">— {c.reviewer&&c.reviewer!==c.publication?c.reviewer+', ':''}<b dir="auto">{c.publication}</b>{year(c.date,lang)?' · '+year(c.date,lang):''}</span>
   <Stance c={c} L={L}/>
   {c.url&&<a href={c.url} target="_blank" rel="noopener noreferrer">{L('Read the review')}<Ext/></a>}
  </figcaption>
 </figure>;
}
// A compact card: publication, stance, four lines of the quote (or of the summary when nothing is quoted), and the rest on request.
function CriticCard({c,L,lang}:{c:Critic}&Tr){
 const[open,setOpen]=useState(false),quote=quoteFor(c,lang),foreign=quoteIsForeign(c,lang),body=quote||c.summary,extra=!!quote&&!!c.summary;
 const more=extra||body.length>170;
 return <article className={'rx-critic '+(c.stance||'none')}>
  <header><b className="rx-pub" dir="auto">{c.publication}</b><Stance c={c} L={L}/></header>
  {body&&<p className={'rx-q'+(open?' open':'')} dir={foreign&&quote?'ltr':'auto'} lang={foreign&&quote?'en':undefined}>{quote?(lang==='fa'?'«':'“')+quote+(lang==='fa'?'»':'”'):body}</p>}
  {open&&extra&&<p className="rx-sum" dir="auto">{c.summary}</p>}
  {open&&originalFor(c,lang)&&<p className="rx-orig" dir="ltr" lang="en">{originalFor(c,lang)}</p>}
  <footer>
   <span>{byline(c,lang)}</span>
   {more&&<button className="rx-more" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?L('Show less'):L('Show more')}</button>}
   {c.url&&<a href={c.url} target="_blank" rel="noopener noreferrer">{L('Read the review')}<Ext/></a>}
  </footer>
 </article>;
}
function Critics({v,L,lang}:{v:View}&Tr){
 const[all,setAll]=useState(false),list=all?v.others:v.others.slice(0,2);
 if(!v.featured&&!v.others.length)return null;
 return <section className="rx-block"><h3>{L('What the critics said')}</h3>
  {v.featured&&<Featured c={v.featured} L={L} lang={lang}/>}
  {list.length>0&&<div className="rx-critics">{list.map((c,i)=><CriticCard key={(c.url||c.publication)+i} c={c} L={L} lang={lang}/>)}</div>}
  {v.others.length>2&&<button className="rx-more wide" aria-expanded={all} onClick={()=>setAll(!all)}>{all?L('Show less'):L('More reviews')+' ('+num(lang,v.others.length-2)+')'}<ExpandMoreRounded/></button>}
 </section>;
}
function Readers({v,L,lang}:{v:View}&Tr){
 const[all,setAll]=useState(false),list=all?v.readers:v.readers.slice(0,3);
 if(!v.readers.length&&!v.legacy.length)return null;
 return <section className="rx-block"><h3>{L(v.readers.length?'What readers said':'In their words')}</h3>
  <div className="rx-readers">
   {list.map((r,i)=>{const q=quoteFor(r,lang)||r.summary,foreign=quoteIsForeign(r,lang)&&!!r.excerpt;return <figure key={i}>
    {r.stars!=null&&<Stars value={r.stars}/>}
    {q&&<blockquote dir={foreign?'ltr':'auto'} lang={foreign?'en':undefined}>{r.excerpt?(lang==='fa'?'«':'“')+q+(lang==='fa'?'»':'”'):q}</blockquote>}
    <figcaption>{r.name}{r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={L('Read the review')}><Ext/></a>}</figcaption>
   </figure>;})}
   {v.legacy.map((q,i)=><figure key={'q'+i}><blockquote dir="auto">“{q.text}”</blockquote><figcaption>{q.who}{q.url&&<a href={q.url} target="_blank" rel="noopener noreferrer" aria-label={L('Read the review')}><Ext/></a>}</figcaption></figure>)}
  </div>
  {v.readers.length>3&&<button className="rx-more wide" aria-expanded={all} onClick={()=>setAll(!all)}>{all?L('Show less'):L('More')+' ('+num(lang,v.readers.length-3)+')'}<ExpandMoreRounded/></button>}
 </section>;
}
function Legacy({v,L}:{v:View}&Pick<Tr,'L'>){
 const[open,setOpen]=useState(false);
 if(!v.awards.length&&!v.impact)return null;
 return <section className="rx-legacy">
  {v.awards.length>0&&<div className="rx-awards">{v.awards.map(a=><span key={a} dir="auto"><EmojiEventsOutlined/>{a}</span>)}</div>}
  {v.impact&&<><p className={'rx-impact'+(open?' open':'')} dir="auto">{v.impact}</p>{v.impact.length>200&&<button className="rx-more" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?L('Show less'):L('Read more')}</button>}</>}
 </section>;
}
// The links that are not already on a card, kept out of the way.
function Sources({v,L,lang}:{v:View}&Tr){
 if(!v.sources.length)return null;
 return <details className="rx-sources"><summary>{L('Sources')} ({num(lang,v.sources.length)})</summary><ul>{v.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}<Ext/></a></li>)}</ul></details>;
}
export interface Cta{onRead:()=>void;onListen?:()=>void}
// The reception of a book, as a short article: the verdict and the scores first, then praise against doubt, then the voices behind them.
export default function ReviewSection({review,scores=[],draft=false,lang,cta}:{review:Review|null;scores?:Score[];draft?:boolean;lang?:string;cta?:Cta}){
 const L=(t:string)=>tr(lang,t),v=receptionView(review,scores,lang);
 if(v.isEmpty)return null;
 return <div className="rv rx">
  {draft&&<p className="rv-draft">{L('Draft · not yet approved for readers')}</p>}
  <Kicker v={v} L={L} lang={lang}/>
  <Summary v={v} L={L} lang={lang}/>
  {(v.praise.all.length>0||v.criticism.all.length>0)&&<div className="rx-balance"><Points title="What readers praise" list={v.praise} kind="pro" L={L} lang={lang}/><Points title="Where it is faulted" list={v.criticism} kind="con" L={L} lang={lang}/></div>}
  <Critics v={v} L={L} lang={lang}/>
  <Readers v={v} L={L} lang={lang}/>
  <Legacy v={v} L={L}/>
  <Sources v={v} L={L} lang={lang}/>
  {cta&&<div className="rx-cta"><div><strong>{L('Make up your own mind')}</strong><span>{L('The summary takes a few minutes. Then you will know whether the book is for you.')}</span></div><div className="rx-cta-actions"><button className="rx-btn primary" onClick={cta.onRead}><MenuBookRounded/>{L('Start reading')}</button>{cta.onListen&&<button className="rx-btn" onClick={cta.onListen}><HeadphonesRounded/>{L('Listen')}</button>}</div></div>}
 </div>;
}
