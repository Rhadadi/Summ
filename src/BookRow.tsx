import{useEffect,useRef,useState,type ReactNode}from'react';
import{ChevronLeftRounded,ChevronRightRounded}from'@mui/icons-material';
// One row of books that scrolls sideways, with round arrows over its two ends (hidden at either end). Swipe works too.
// Left always moves left and right moves right, whatever the page direction.
export default function BookRow({label,dir,children}:{label:string;dir?:'rtl'|'ltr';children:ReactNode}){
 const row=useRef<HTMLDivElement>(null),[ends,setEnds]=useState({left:true,right:true});
 const measure=()=>{const el=row.current;if(!el)return;const max=el.scrollWidth-el.clientWidth,rtl=getComputedStyle(el).direction==='rtl';
  const x=el.scrollLeft,left=rtl?-max:0,right=rtl?0:max;setEnds({left:max<=2||x<=left+8,right:max<=2||x>=right-8});};
 useEffect(()=>{measure();const el=row.current;if(!el)return;const ro=new ResizeObserver(measure);ro.observe(el);el.addEventListener('scroll',measure,{passive:true});
  return()=>{ro.disconnect();el.removeEventListener('scroll',measure);};},[children]);
 const go=(dir:1|-1)=>{const el=row.current;if(el)el.scrollBy({left:dir*el.clientWidth*.85,behavior:'smooth'});};
 return <div className="book-row">
  {!ends.left&&<button className="book-row-arrow left" aria-label={label+' ←'} onClick={()=>go(-1)}><ChevronLeftRounded/></button>}
  <div className="book-row-track" dir={dir} ref={row} role="list" aria-label={label}>{children}</div>
  {!ends.right&&<button className="book-row-arrow right" aria-label={label+' →'} onClick={()=>go(1)}><ChevronRightRounded/></button>}
 </div>;
}
