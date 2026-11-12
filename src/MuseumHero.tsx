import{useEffect,useRef,useState}from'react';
import{ArrowBackRounded,ArrowForwardRounded,StarRounded,StarHalfRounded,StarBorderRounded}from'@mui/icons-material';
import{useMediaQuery}from'@mui/material';
import{tr,num}from'./i18n';
import{artUrl,type Art}from'./art';

// Where a slide's picture comes from: a gallery painting, a painting chosen for the book, or the cover itself.
export interface Backdrop{url:string;position:string;blur?:boolean;credit?:{title:string;artist:string;year:string}|null}
export const galleryBackdrop=(a:Art):Backdrop=>({url:artUrl(a),position:a.position,credit:{title:a.title,artist:a.artist,year:a.year}});

// A full-bleed slideshow: one painting, one book or idea at a time, in the manner of a museum's opening gallery.
export interface Slide{key:string;backdrop:Backdrop;eyebrow:string;title:string;by?:string;text:string;cover?:string|null;rtl?:boolean;score?:{rating:number;count:number|null;source:string};facts?:string[];actions:{label:string;onClick:()=>void;primary?:boolean}[]}
const EVERY=3000;
const Stars=({value,lang}:{value:number;lang:string})=><span className="m-stars" role="img" aria-label={num(lang,value)+' '+tr(lang,'out of 5')}>{[1,2,3,4,5].map(i=>value>=i-.25?<StarRounded key={i}/>:value>=i-.75?<StarHalfRounded key={i}/>:<StarBorderRounded key={i}/>)}</span>;
export default function MuseumHero({slides,lang='en'}:{slides:Slide[];lang?:string}){
 const L=(t:string)=>tr(lang,t);
 const[at,setAt]=useState(0),[hold,setHold]=useState(false);
 const reduce=useMediaQuery('(prefers-reduced-motion: reduce)');
 const x=useRef<number|null>(null),swiped=useRef(false);
 const n=slides.length,go=(i:number)=>setAt(((i%n)+n)%n);

 useEffect(()=>{if(at>=n)setAt(0);},[n,at]);
 if(!n)return null;
 const current=slides[Math.min(at,n-1)];
 return <section className="museum" role="region" aria-roledescription="carousel" aria-label={L('Featured')} tabIndex={0}
  onMouseEnter={()=>setHold(true)} onMouseLeave={()=>setHold(false)} onFocus={()=>setHold(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHold(false);}}
  onKeyDown={e=>{if(e.key==='ArrowRight')go(at+1);if(e.key==='ArrowLeft')go(at-1);}}
  onPointerDown={e=>{x.current=e.clientX;}} onPointerUp={e=>{swiped.current=x.current!==null&&Math.abs(e.clientX-x.current)>60;if(swiped.current)go(at+(e.clientX<x.current!?1:-1));x.current=null;}}>
  {slides.map((s,i)=><div key={s.key} className={'m-slide'+(i===at?' on':'')} aria-hidden={i!==at} role="group" aria-roledescription="slide" aria-label={(i+1)+' of '+n} onClick={()=>{if(!swiped.current&&s.cover)s.actions[0]?.onClick();}} style={s.cover?{cursor:'pointer'}:undefined} {...(i!==at?{inert:true}:{})}>
   {/* The painting is shown whole; a blurred copy of it fills the rest of the frame. */}
   <img className="m-fill" src={s.backdrop.url} alt="" aria-hidden="true" loading={i===0?'eager':'lazy'} decoding="async"/>
   <img className={'m-art'+(s.backdrop.blur?' blur':'')} src={s.backdrop.url} alt="" loading={i===0?'eager':'lazy'} decoding="async"/>
   <div className="m-shade"/>
   <div className="m-inner">
    <div className="m-text">
     <span className="m-eyebrow">{s.eyebrow}</span>
     <h1 dir="auto" className={s.title.length>60?'xl':s.title.length>34?'long':undefined}>{s.title}</h1>
     {s.by&&<p className="m-by" dir="auto">{s.by}</p>}
     <p className="m-lead" dir="auto">{s.text}</p>
     {(s.score||s.facts?.length)&&<div className="m-meta">{s.score&&<span className="m-score"><Stars value={s.score.rating} lang={lang}/><b>{num(lang,s.score.rating)}</b><small>{s.score.source}{s.score.count?' · '+num(lang,s.score.count)+' '+L('ratings'):''}</small></span>}{s.facts?.map(f=><span key={f} className="m-fact">{f}</span>)}</div>}
     {!s.cover&&<div className="m-actions">{s.actions.map(a=><button key={a.label} className={'m-btn'+(a.primary?' primary':'')} onClick={a.onClick} tabIndex={i===at?0:-1}>{a.label}{a.primary&&<ArrowForwardRounded/>}</button>)}</div>}
    </div>
    {s.cover&&<button className="m-cover" tabIndex={i===at?0:-1} aria-label={L('Open')+' '+s.title} onClick={s.actions[0]?.onClick}><img src={s.cover} alt="" loading="lazy"/></button>}
   </div>
  </div>)}
  <div className="m-bar">
   <div className="m-dots" role="tablist" aria-label={L('Choose a slide')}>{slides.map((s,i)=><button key={s.key} role="tab" aria-selected={i===at} aria-label={L('Show slide')+' '+num(lang,i+1)} className={'m-dot'+(i===at?' on':'')+' held'} onClick={()=>go(i)}><span style={{animationDuration:EVERY+'ms'}}/></button>)}</div>
   <span className="m-count" aria-hidden="true">{String(at+1).padStart(2,'0')} / {String(n).padStart(2,'0')}</span>
   <div className="m-arrows"><button aria-label={L('Previous slide')} onClick={()=>go(at-1)}><ArrowBackRounded/></button><button aria-label={L('Next slide')} onClick={()=>go(at+1)}><ArrowForwardRounded/></button></div>
   {current.backdrop.credit&&<span className="m-credit"><em>{current.backdrop.credit.title}</em>{current.backdrop.credit.artist?', '+current.backdrop.credit.artist:''}{current.backdrop.credit.year?', '+current.backdrop.credit.year:''} · Public domain, Wikimedia Commons</span>}
  </div>
 </section>;
}
