import{useEffect,useRef,useState}from'react';
import{ArrowBackRounded,ArrowForwardRounded,StarRounded,StarHalfRounded,StarBorderRounded}from'@mui/icons-material';
import{useMediaQuery}from'@mui/material';
import{tr,num}from'./i18n';
import{artSrcSet,artUrl,type Art}from'./art';
import{sized,srcSet}from'./img';

// Where a slide's picture comes from: a gallery painting, a painting chosen for the book, or the cover itself.
export interface Backdrop{url:string;srcset?:string;position:string;whole?:boolean;caption?:{text:string;url?:string};blur?:boolean;credit?:{title:string;artist:string;year:string;page?:string}|null}
export const galleryBackdrop=(a:Art):Backdrop=>({url:artUrl(a),srcset:artSrcSet(a),position:a.position,credit:{title:a.title,artist:a.artist,year:a.year}});

// A full-bleed slideshow: one painting, one book or idea at a time, in the manner of a museum's opening gallery.
export interface Slide{key:string;backdrop:Backdrop;eyebrow:string;title:string;by?:string;text:string;cover?:string|null;rtl?:boolean;seconds?:number;score?:{rating:number;count:number|null;source:string};facts?:string[];actions:{label:string;onClick:()=>void;primary?:boolean}[]}
// How bright the picture is behind the text decides the text colour: light text on dark pictures, dark text on bright ones,
// and a firmer shade where bright and dark patches mix. Measured once per picture, on a tiny copy of it.
export type Tone='dark'|'bright'|'mixed';
const tones=new Map<string,Tone>();
function measure(url:string,rtl:boolean,narrow:boolean):Promise<Tone>{
 return new Promise(resolve=>{
  const img=new Image();img.crossOrigin='anonymous';
  img.onload=()=>{
   try{
    const w=48,h=27,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true})!;
    // "cover" crop of the picture, as the slide shows it
    const r=Math.max(w/img.width,h/img.height),sw=w/r,sh=h/r;g.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,0,0,w,h);
    const x0=narrow?0:rtl?Math.round(w*.42):0,x1=narrow?w:rtl?w:Math.round(w*.58),y0=Math.round(h*(narrow?.4:.14)),y1=Math.round(h*(narrow?.9:.8));
    const d=g.getImageData(x0,y0,x1-x0,y1-y0).data,lum:number[]=[];
    for(let i=0;i<d.length;i+=4)lum.push((.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255);
    lum.sort((a,b)=>a-b);const p25=lum[Math.floor(lum.length*.25)],p75=lum[Math.floor(lum.length*.75)];
    resolve(p25>.62?'bright':p75>.6?'mixed':'dark');
   }catch{resolve('dark');}
  };
  img.onerror=()=>resolve('dark');img.src=url;
 });
}
const Stars=({value,lang}:{value:number;lang:string})=><span className="m-stars" role="img" aria-label={num(lang,value)+' '+tr(lang,'out of 5')}>{[1,2,3,4,5].map(i=>value>=i-.25?<StarRounded key={i}/>:value>=i-.75?<StarHalfRounded key={i}/>:<StarBorderRounded key={i}/>)}</span>;
export default function MuseumHero({slides,lang='en',seconds=3,autoplay=true}:{slides:Slide[];lang?:string;seconds?:number;autoplay?:boolean}){
 const L=(t:string)=>tr(lang,t);
 const[at,setAt]=useState(0),[hold,setHold]=useState(false);
 const reduce=useMediaQuery('(prefers-reduced-motion: reduce)');
 const x=useRef<number|null>(null),swiped=useRef(false);
 const[tone,setTone]=useState<Record<string,Tone>>({});
 useEffect(()=>{let live=true;const rtl=lang==='fa'||lang==='ar',narrow=window.innerWidth<900;for(const s of slides){const key=s.backdrop.url+(rtl?'r':'l')+(narrow?'n':'w');const known=tones.get(key);if(known){setTone(t=>t[s.key]===known?t:{...t,[s.key]:known});continue;}measure(s.backdrop.srcset?s.backdrop.srcset.split(' ')[0]:sized(s.backdrop.url,320),rtl,narrow).then(v=>{tones.set(key,v);if(live)setTone(t=>({...t,[s.key]:v}));});}return()=>{live=false;};},[slides.map(s=>s.key+s.backdrop.url).join('|'),lang]);
 const n=slides.length,go=(i:number)=>setAt(((i%n)+n)%n);

 useEffect(()=>{if(at>=n)setAt(0);},[n,at]);
 // Only the slide on screen and its neighbours load their pictures; the rest wait until they come close.
 const near=(i:number)=>n<4||i===at||i===(at+1)%n||i===(at-1+n)%n;
 const every=(slides[Math.min(at,n-1)]?.seconds||seconds)*1000;
 // The slideshow advances by itself, on phones too; a mouse resting on it pauses it, a finger never does.
 useEffect(()=>{if(hold||reduce||!autoplay||n<2)return;const t=setTimeout(()=>setAt(a=>(a+1)%n),every);return()=>clearTimeout(t);},[at,hold,reduce,autoplay,n,every]);
 if(!n)return null;
 const current=slides[Math.min(at,n-1)];
 return <section className={'museum'+(tone[current.key]==='bright'?' on-bright':'')} role="region" aria-roledescription="carousel" aria-label={L('Featured')} tabIndex={0}
  onPointerEnter={e=>{if(e.pointerType==='mouse')setHold(true);}} onPointerLeave={()=>setHold(false)} onFocus={e=>{if(e.target.matches(':focus-visible'))setHold(true);}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHold(false);}}
  onKeyDown={e=>{if(e.key==='ArrowRight')go(at+1);if(e.key==='ArrowLeft')go(at-1);}}
  onPointerDown={e=>{x.current=e.clientX;}} onPointerUp={e=>{swiped.current=x.current!==null&&Math.abs(e.clientX-x.current)>60;if(swiped.current)go(at+(e.clientX<x.current!?1:-1));x.current=null;}}>
  {slides.map((s,i)=><div key={s.key} className={'m-slide'+(i===at?' on':'')+(tone[s.key]&&tone[s.key]!=='dark'?' tone-'+tone[s.key]:'')} aria-hidden={i!==at} role="group" aria-roledescription="slide" aria-label={(i+1)+' of '+n} onClick={()=>{if(!swiped.current&&s.cover)s.actions[0]?.onClick();}} style={s.cover?{cursor:'pointer'}:undefined} {...(i!==at?{inert:true}:{})}>
   {/* The painting is shown whole; a blurred copy of it fills the rest of the frame. */}
   {near(i)&&s.backdrop.whole&&<img className="m-fill" src={sized(s.backdrop.url,480)} alt="" aria-hidden="true" decoding="async"/>}
   {near(i)&&<img className={'m-art'+(s.backdrop.blur?' blur':'')+(s.backdrop.whole?' whole':'')} src={s.backdrop.blur?sized(s.backdrop.url,480):s.backdrop.url} srcSet={s.backdrop.blur?undefined:(s.backdrop.srcset||srcSet(s.backdrop.url))} sizes="100vw" alt="" fetchPriority={i===at?'high':'low'} decoding="async"/>}
   <div className="m-shade"/>
   <div className="m-inner">
    <div className="m-text">
     {s.eyebrow&&<span className="m-eyebrow">{s.eyebrow}</span>}
     <h1 dir="auto" className={s.title.length>60?'xl':s.title.length>34?'long':undefined}>{s.title}</h1>
     {s.by&&<p className="m-by" dir="auto">{s.by}</p>}
     <p className="m-lead" dir="auto">{s.text}</p>
     {s.score&&<div className="m-meta"><span className="m-score"><Stars value={s.score.rating} lang={lang}/><b>{num(lang,s.score.rating)}</b></span></div>}
     {!s.cover&&<div className="m-actions">{s.actions.map(a=><button key={a.label} className={'m-btn'+(a.primary?' primary':'')} onClick={a.onClick} tabIndex={i===at?0:-1}>{a.label}{a.primary&&<ArrowForwardRounded/>}</button>)}</div>}
    </div>
    {s.cover&&<button className="m-cover" tabIndex={i===at?0:-1} aria-label={L('Open')+' '+s.title} onClick={s.actions[0]?.onClick}>{near(i)&&<img src={sized(s.cover,480)} alt="" decoding="async"/>}</button>}
   </div>
  </div>)}
  <div className="m-bar">
   <div className="m-dots" role="tablist" aria-label={L('Choose a slide')}>{slides.map((s,i)=><button key={s.key} role="tab" aria-selected={i===at} aria-label={L('Show slide')+' '+num(lang,i+1)} className={'m-dot'+(i===at?' on':'')+(hold||reduce||!autoplay?' held':'')} onClick={()=>go(i)}><span style={{animationDuration:(s.seconds||seconds)+'s'}}/></button>)}</div>
   <div className="m-arrows"><button aria-label={L('Previous slide')} onClick={()=>go(at-1)}>{lang==='fa'||lang==='ar'?<ArrowForwardRounded/>:<ArrowBackRounded/>}</button><button aria-label={L('Next slide')} onClick={()=>go(at+1)}>{lang==='fa'||lang==='ar'?<ArrowBackRounded/>:<ArrowForwardRounded/>}</button></div>
   {(()=>{const b=current.backdrop,c=b.credit,text=b.caption?.text||(c?[c.title,c.artist,c.year].filter(Boolean).join(', ')+' · Public domain, Wikimedia Commons':'');const url=b.caption?.url||c?.page;
    return text?(url?<a className="m-credit" href={url} target="_blank" rel="noopener noreferrer">{text}</a>:<span className="m-credit">{text}</span>):null;})()}
  </div>
 </section>;
}
