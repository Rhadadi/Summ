// Highlights and comments on the summary, for the reader alone.
// Select text: a small bar offers four colours, a comment, or asking the AI about it. Highlights are painted with the
// CSS Custom Highlight API, so the summary's own markup is never touched; a highlight with a comment shows a small
// bubble in the margin. Tap a highlight (or its bubble) to recolour it, write or edit the comment, or remove it.
// Everything is saved through marks.ts: in this browser first, then encrypted with the reader's account.
import{useEffect,useLayoutEffect,useRef,useState,type RefObject}from'react';
import{createPortal}from'react-dom';
import{AutoAwesomeRounded,ChatBubbleOutlineRounded,ChatBubbleRounded,DeleteOutlineRounded}from'@mui/icons-material';
import{anchorFromRange,rangeOf,summaryNodes,type Anchor}from'./anchor';
import{COLORS,newId,putMark,removeMark,updateMark,useMarks,type Color,type Mark}from'./marks';
import{tr}from'./i18n';

export interface MarkMeta{book:string;slug:string;bookTitle:string;chapter:string;chapterTitle:string;lang:string}
interface Props{root:RefObject<HTMLElement|null>;meta:MarkMeta;lang:string;onAsk:(a:Anchor)=>void}
const painted=typeof CSS!=='undefined'&&'highlights' in CSS&&typeof Highlight!=='undefined';
const coarse=()=>typeof matchMedia!=='undefined'&&matchMedia('(pointer:coarse)').matches;
function caretAt(x:number,y:number):{node:Node;offset:number}|null{
 const d=document as Document&{caretPositionFromPoint?:(x:number,y:number)=>{offsetNode:Node;offset:number}|null;caretRangeFromPoint?:(x:number,y:number)=>Range|null};
 const p=d.caretPositionFromPoint?.(x,y);if(p)return{node:p.offsetNode,offset:p.offset};
 const r=d.caretRangeFromPoint?.(x,y);return r?{node:r.startContainer,offset:r.startOffset}:null;
}
const NAMES:Record<Color,string>={yellow:'Yellow',green:'Green',blue:'Blue',pink:'Pink'};

export default function ReaderMarks({root,meta,lang,onAsk}:Props){
 const L=(t:string)=>tr(lang,t),fa=lang==='fa';
 const marks=useMarks(meta.book,meta.chapter);
 const[ranges,setRanges]=useState<Map<string,Range>>(new Map());
 const[bar,setBar]=useState<{anchor:Anchor;range:Range}|null>(null);
 const[pop,setPop]=useState<{id:string;x:number;y:number;fresh?:boolean}|null>(null);
 const[,relayout]=useState(0);
 const layer=useRef<HTMLDivElement|null>(null);

 // where each highlight is on the page; again whenever the text or the layout changes
 useEffect(()=>{
  const el=root.current;if(!el)return;
  let t=0;
  const compute=()=>{const nodes=summaryNodes(el),m=new Map<string,Range>();for(const k of marks){const r=rangeOf(el,k,nodes);if(r)m.set(k.id,r);}setRanges(m);};
  compute();
  const mo=new MutationObserver(list=>{if(list.every(x=>(x.target as Element).closest?.('.mk-layer')||x.target.parentElement?.closest('.mk-layer')))return;clearTimeout(t);t=window.setTimeout(compute,120);});
  mo.observe(el,{subtree:true,childList:true,characterData:true});
  const ro=new ResizeObserver(()=>relayout(n=>n+1));ro.observe(el);
  void document.fonts?.ready.then(()=>relayout(n=>n+1));
  return()=>{mo.disconnect();ro.disconnect();clearTimeout(t);};
 },[root,marks]);

 // paint them, one highlight group per colour
 useEffect(()=>{
  if(!painted)return;
  const reg=CSS.highlights;
  for(const c of COLORS)reg.set('ink-'+c,new Highlight(...marks.filter(m=>m.color===c&&ranges.has(m.id)).map(m=>ranges.get(m.id)!)));
  return()=>{for(const c of COLORS)reg.delete('ink-'+c);};
 },[ranges,marks]);

 // the selection bar
 useEffect(()=>{
  const el=root.current;if(!el)return;
  let t=0;
  const check=()=>{
   const sel=getSelection();
   if(!sel||sel.isCollapsed||!sel.rangeCount){setBar(null);return;}
   const r=sel.getRangeAt(0),a=anchorFromRange(el,r);
   setBar(a&&a.quote.length>=2?{anchor:a,range:r.cloneRange()}:null);
  };
  const on=()=>{clearTimeout(t);t=window.setTimeout(check,coarse()?300:120);};
  const moved=()=>relayout(n=>n+1);
  document.addEventListener('selectionchange',on);window.addEventListener('scroll',moved,{capture:true,passive:true});window.addEventListener('resize',moved);
  return()=>{document.removeEventListener('selectionchange',on);window.removeEventListener('scroll',moved,{capture:true});window.removeEventListener('resize',moved);clearTimeout(t);};
 },[root]);

 // a tap on a highlight opens it
 useEffect(()=>{
  const el=root.current;if(!el)return;
  const click=(e:MouseEvent)=>{
   if(!getSelection()?.isCollapsed||(e.target as Element).closest('.mk-layer,button,a'))return;
   const at=caretAt(e.clientX,e.clientY);if(!at)return;
   for(const[id,r]of ranges){try{if(r.isPointInRange(at.node,at.offset)){setPop({id,x:e.clientX,y:e.clientY});return;}}catch{/* other document */}}
  };
  el.addEventListener('click',click);return()=>el.removeEventListener('click',click);
 },[root,ranges]);

 function create(color:Color,comment=false){
  if(!bar)return;
  const id=newId(),rect=bar.range.getBoundingClientRect();
  putMark({id,kind:'mark',...meta,...bar.anchor,color,note:'',source:'',model:'',created:Date.now()});
  getSelection()?.removeAllRanges();setBar(null);
  if(comment)setPop({id,x:rect.left+rect.width/2,y:rect.bottom,fresh:true});
 }

 const el=root.current;
 if(!el)return null;
 const box=el.getBoundingClientRect();
 const bubbles=marks.filter(m=>m.note.trim()&&ranges.has(m.id)).map(m=>{const r=ranges.get(m.id)!.getClientRects()[0];return r?{m,top:r.top-box.top}:null;}).filter(Boolean) as {m:Mark;top:number}[];
 // bubbles on the same line stack downwards instead of on top of each other
 bubbles.sort((a,b)=>a.top-b.top);for(let i=1;i<bubbles.length;i++)if(bubbles[i].top-bubbles[i-1].top<26)bubbles[i].top=bubbles[i-1].top+26;

 let barStyle:React.CSSProperties|undefined;
 if(bar){const r=bar.range.getBoundingClientRect(),w=coarse()?260:236,below=coarse()||r.top<110;
  barStyle={top:below?r.bottom+12:r.top-50,left:Math.min(Math.max(8,r.left+r.width/2-w/2),window.innerWidth-w-8),width:w};}

 return <>
  {createPortal(<div className="mk-layer" ref={layer} aria-hidden={!bubbles.length}>
   {bubbles.map(({m,top})=><button key={m.id} className={'mk-bubble c-'+m.color} style={{top}} aria-label={L('Comment')+': '+m.note.slice(0,60)} title={m.note.slice(0,140)}
    onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setPop({id:m.id,x:r.left+r.width/2,y:r.bottom});}}>{m.source==='ai'?<AutoAwesomeRounded/>:<ChatBubbleRounded/>}</button>)}
  </div>,el)}
  {bar&&!pop&&<div className="mk-bar" style={barStyle} dir={fa?'rtl':'ltr'} role="toolbar" aria-label={L('Highlight')} onPointerDown={e=>e.preventDefault()}>
   {COLORS.map(c=><button key={c} className={'mk-dot c-'+c} aria-label={L('Highlight')+' · '+L(NAMES[c])} title={L(NAMES[c])} onClick={()=>create(c)}/>)}
   <span className="mk-sep"/>
   <button className="mk-act" aria-label={L('Comment')} title={L('Comment')} onClick={()=>create('yellow',true)}><ChatBubbleOutlineRounded/></button>
   <button className="mk-act" aria-label={L('Ask AI')} title={L('Ask AI')} onClick={()=>{const a=bar.anchor;getSelection()?.removeAllRanges();setBar(null);onAsk(a);}}><AutoAwesomeRounded/></button>
  </div>}
  {pop&&<MarkCard key={pop.id} id={pop.id} x={pop.x} y={pop.y} fresh={pop.fresh} lang={lang} onClose={()=>setPop(null)} onAsk={a=>{setPop(null);onAsk(a);}}/>}
 </>;
}

function MarkCard({id,x,y,fresh,lang,onClose,onAsk}:{id:string;x:number;y:number;fresh?:boolean;lang:string;onClose:()=>void;onAsk:(a:Anchor)=>void}){
 const L=(t:string)=>tr(lang,t),fa=lang==='fa';
 const all=useMarks(),m=all.find(k=>k.id===id);
 const[note,setNote]=useState(m?.note||''),card=useRef<HTMLDivElement>(null),text=useRef<HTMLTextAreaElement>(null),timer=useRef(0),[pos,setPos]=useState({top:y+12,left:x-150});
 const close=useRef(onClose);close.current=onClose;
 useLayoutEffect(()=>{const c=card.current;if(!c)return;const w=c.offsetWidth,h=c.offsetHeight;let top=y+12;if(top+h>window.innerHeight-8)top=Math.max(8,y-h-20);setPos({top,left:Math.min(Math.max(8,x-w/2),window.innerWidth-w-8)});},[x,y]);
 useEffect(()=>{if(fresh)text.current?.focus();},[fresh]);
 useEffect(()=>{
  const out=(e:PointerEvent)=>{if(!card.current?.contains(e.target as Node))close.current();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close.current();};
  const t=setTimeout(()=>document.addEventListener('pointerdown',out,true),0);document.addEventListener('keydown',key);
  return()=>{clearTimeout(t);document.removeEventListener('pointerdown',out,true);document.removeEventListener('keydown',key);};
 },[]);
 useEffect(()=>()=>{clearTimeout(timer.current);},[]);
 if(!m)return null;
 const save=(v:string)=>{setNote(v);clearTimeout(timer.current);timer.current=window.setTimeout(()=>updateMark(id,{note:v}),500);};
 return <div ref={card} className="mk-card" style={pos} dir={fa?'rtl':'ltr'} role="dialog" aria-label={L('Highlight')}>
  <div className="mk-row">
   {COLORS.map(c=><button key={c} className={'mk-dot c-'+c+(m.color===c?' on':'')} aria-pressed={m.color===c} aria-label={L(NAMES[c])} onClick={()=>updateMark(id,{color:c})}/>)}
   <span className="grow"/>
   <button className="mk-act" aria-label={L('Ask AI')} title={L('Ask AI')} onClick={()=>onAsk({quote:m.quote,prefix:m.prefix,suffix:m.suffix})}><AutoAwesomeRounded/></button>
   <button className="mk-act" aria-label={L('Remove highlight')} title={L('Remove highlight')} onClick={()=>{clearTimeout(timer.current);removeMark(id);onClose();}}><DeleteOutlineRounded/></button>
  </div>
  {m.source==='ai'&&<small className="mk-src"><AutoAwesomeRounded/>{L('Answer from')} <span dir="ltr">{m.model||'AI'}</span></small>}
  <textarea ref={text} dir="auto" rows={note?Math.min(8,Math.max(2,Math.ceil(note.length/42))):2} value={note} placeholder={L('Add a comment…')} onChange={e=>save(e.target.value)} onBlur={()=>{clearTimeout(timer.current);if(note!==m.note)updateMark(id,{note});}}/>
 </div>;
}
