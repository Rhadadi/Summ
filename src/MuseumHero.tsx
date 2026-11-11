import{useEffect,useRef,useState}from'react';
import{ArrowBackRounded,ArrowForwardRounded}from'@mui/icons-material';
import{useMediaQuery}from'@mui/material';
import{artUrl,type Art}from'./art';

// A full-bleed slideshow: one painting, one book or idea at a time, in the manner of a museum's opening gallery.
export interface Slide{key:string;art:Art;eyebrow:string;title:string;by?:string;text:string;cover?:string|null;rtl?:boolean;actions:{label:string;onClick:()=>void;primary?:boolean}[]}
const EVERY=8000;
export default function MuseumHero({slides}:{slides:Slide[]}){
 const[at,setAt]=useState(0),[hold,setHold]=useState(false);
 const reduce=useMediaQuery('(prefers-reduced-motion: reduce)');
 const x=useRef<number|null>(null);
 const n=slides.length,go=(i:number)=>setAt(((i%n)+n)%n);
 useEffect(()=>{if(hold||reduce||n<2)return;const t=setTimeout(()=>setAt(a=>(a+1)%n),EVERY);return()=>clearTimeout(t);},[at,hold,reduce,n]);
 useEffect(()=>{if(at>=n)setAt(0);},[n,at]);
 if(!n)return null;
 const current=slides[Math.min(at,n-1)];
 return <section className="museum" role="region" aria-roledescription="carousel" aria-label="Featured" tabIndex={0}
  onMouseEnter={()=>setHold(true)} onMouseLeave={()=>setHold(false)} onFocus={()=>setHold(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHold(false);}}
  onKeyDown={e=>{if(e.key==='ArrowRight')go(at+1);if(e.key==='ArrowLeft')go(at-1);}}
  onPointerDown={e=>{x.current=e.clientX;}} onPointerUp={e=>{if(x.current!==null&&Math.abs(e.clientX-x.current)>60)go(at+(e.clientX<x.current?1:-1));x.current=null;}}>
  {slides.map((s,i)=><div key={s.key} className={'m-slide'+(i===at?' on':'')} aria-hidden={i!==at} role="group" aria-roledescription="slide" aria-label={(i+1)+' of '+n} {...(i!==at?{inert:true}:{})}>
   <img className="m-art" src={artUrl(s.art)} alt="" style={{objectPosition:s.art.position}} loading={i===0?'eager':'lazy'} decoding="async"/>
   <div className="m-shade"/>
   <div className="m-inner">
    <div className="m-text">
     <span className="m-eyebrow">{s.eyebrow}</span>
     <h1 dir="auto">{s.title}</h1>
     {s.by&&<p className="m-by" dir="auto">{s.by}</p>}
     <p className="m-lead" dir="auto">{s.text}</p>
     <div className="m-actions">{s.actions.map(a=><button key={a.label} className={'m-btn'+(a.primary?' primary':'')} onClick={a.onClick} tabIndex={i===at?0:-1}>{a.label}{a.primary&&<ArrowForwardRounded/>}</button>)}</div>
    </div>
    {s.cover&&<button className="m-cover" tabIndex={i===at?0:-1} aria-label={'Open '+s.title} onClick={s.actions[0]?.onClick}><img src={s.cover} alt="" loading="lazy"/></button>}
   </div>
  </div>)}
  <div className="m-bar">
   <div className="m-dots" role="tablist" aria-label="Choose a slide">{slides.map((s,i)=><button key={s.key} role="tab" aria-selected={i===at} aria-label={'Show slide '+(i+1)} className={'m-dot'+(i===at?' on':'')+(hold||reduce?' held':'')} onClick={()=>go(i)}><span style={{animationDuration:EVERY+'ms'}}/></button>)}</div>
   <span className="m-count" aria-hidden="true">{String(at+1).padStart(2,'0')} / {String(n).padStart(2,'0')}</span>
   <div className="m-arrows"><button aria-label="Previous slide" onClick={()=>go(at-1)}><ArrowBackRounded/></button><button aria-label="Next slide" onClick={()=>go(at+1)}><ArrowForwardRounded/></button></div>
   <span className="m-credit"><em>{current.art.title}</em>, {current.art.artist}, {current.art.year} · Public domain, Wikimedia Commons</span>
  </div>
 </section>;
}
