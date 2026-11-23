// The study companion: a minimal chat box over the chapter, answering from the chapter's summary with the reader's own AI key.
// Until something is asked it is only an input bar; answers grow it upward, up to a cap. A passage the reader selected or
// copied rides along as a one-line quote above the input. Everything else (mode, new conversation, key) sits behind the ✦.
// Tap or click outside, Esc, or (phone) a swipe down hides it into the bubble; an answer in progress keeps coming.
// Conversations are kept per chapter while the page is open; nothing is stored on the server.
import{useEffect,useLayoutEffect,useRef,useState,type PointerEvent as RPointerEvent}from'react';
import{ArrowUpwardRounded,AutoAwesomeRounded,CheckRounded,CloseRounded,StopRounded}from'@mui/icons-material';
import Inline from'./InlineText';
import AiKeyForm from'./AiKeyForm';
import AiLaunch from'./AiLaunch';
import{MODES,systemPrompt,type ChapterContext,type Mode}from'./ai-prompt';
import{ChatError,streamAnswer,type Turn}from'./ai-chat';
import{route,shortcutLabel,useAi}from'./ai-settings';
import{useAccountKeys}from'./account-keys';
import{tr}from'./i18n';

const kept=new Map<string,{mode:Mode;turns:Turn[]}>();
const POS='inkling-ai-pos';
type Pos={x:number;y:number};
function useMedia(q:string){
 const[m,setM]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia(q).matches);
 useEffect(()=>{const l=matchMedia(q),on=()=>setM(l.matches);on();l.addEventListener('change',on);return()=>l.removeEventListener('change',on);},[q]);
 return m;
}
const savedPos=():Pos|null=>{try{return JSON.parse(localStorage.getItem(POS)||'null');}catch{return null;}};
const clamp=(p:Pos,w:number,h:number):Pos=>({x:Math.min(Math.max(8,p.x),Math.max(8,window.innerWidth-w-8)),y:Math.min(Math.max(8,p.y),Math.max(8,window.innerHeight-h-8))});
// the passage is sent as part of the question; shown back as a small quote above it
const QUOTED=/^(?:دربارهٔ این بخش: «([\s\S]*?)»|About this passage: “([\s\S]*?)”)\n\n([\s\S]*)$/;
const withPassage=(p:string,q:string,fa:boolean)=>p?(fa?'دربارهٔ این بخش: «'+p+'»':'About this passage: “'+p+'”')+'\n\n'+(q||(fa?'این بخش را توضیح بده.':'Explain this passage.')):q;
// keeps clicks in MUI menus (the model picker) from counting as "outside"
const INSIDE='.ai-panel,.ai-launch,.ai-bar-btn,.MuiPopover-root,.MuiMenu-root,.MuiModal-root,.MuiPopper-root';

interface Props{open:boolean;onOpen:()=>void;onClose:()=>void;lang:string;context:ChapterContext;chapterKey:string;quote?:string;quoteId?:number;armed?:boolean}
export default function ChatPanel({open,onOpen,onClose,lang,context,chapterKey,quote,quoteId,armed}:Props){
 const L=(t:string)=>tr(lang,t),fa=lang==='fa';
 const phone=useMedia('(max-width:699px)'),fine=useMedia('(pointer:fine)');
 const[ai]=useAi(),acct=useAccountKeys(),way=route(ai,acct),[setup,setSetup]=useState(false);
 const start=kept.get(chapterKey);
 const[mode,setMode]=useState<Mode>(start?.mode||'explain'),[turns,setTurns]=useState<Turn[]>(start?.turns||[]),[draft,setDraft]=useState(''),[passage,setPassage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const[menu,setMenu]=useState(false),[unread,setUnread]=useState(false),[tall,setTall]=useState(false),[dragH,setDragH]=useState<number|null>(null),[pos,setPos]=useState<Pos|null>(savedPos);
 const abort=useRef<AbortController|null>(null),box=useRef<HTMLTextAreaElement>(null),list=useRef<HTMLDivElement>(null),panel=useRef<HTMLElement>(null);
 const drag=useRef<{x:number;y:number;px:number;py:number;h:number;moved:boolean}|null>(null),shown=useRef(open),close=useRef(onClose);
 shown.current=open;close.current=onClose;
 // a new chapter brings its own conversation
 useEffect(()=>{abort.current?.abort();const k=kept.get(chapterKey);setMode(k?.mode||'explain');setTurns(k?.turns||[]);setError('');setPassage('');},[chapterKey]);
 useEffect(()=>{kept.set(chapterKey,{mode,turns});},[chapterKey,mode,turns]);
 // opening: the passage replaces any earlier one; on a phone, focus (and its keyboard) only when there is a passage to ask about
 useEffect(()=>{
  if(!open){setMenu(false);return;}
  setUnread(false);
  if(quote)setPassage(quote);
  if(fine||quote)setTimeout(()=>box.current?.focus(),60);
 },[open,quote,quoteId,fine]);
 useEffect(()=>{if(open&&acct.loaded&&!way)setSetup(true);},[open,acct.loaded,way]);
 useEffect(()=>{list.current?.scrollTo({top:list.current.scrollHeight});},[turns,busy,open]);
 useEffect(()=>()=>abort.current?.abort(),[]);
 // a tap or click anywhere else, or Esc, tucks it away
 useEffect(()=>{
  if(!open)return;
  const tap=(e:PointerEvent)=>{const t=e.target as Element|null;if(t?.closest&&!t.closest(INSIDE))close.current();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('.MuiPopover-root,.MuiModal-root')){setMenu(m=>{if(!m)close.current();return false;});}};
  document.addEventListener('pointerdown',tap,true);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('pointerdown',tap,true);document.removeEventListener('keydown',key);};
 },[open]);
 // phone: keep the box above the on-screen keyboard
 useEffect(()=>{
  if(!open||!phone)return;
  const vv=window.visualViewport;if(!vv)return;
  const on=()=>{const el=panel.current;if(!el)return;el.style.setProperty('--kb',Math.max(0,window.innerHeight-vv.height-vv.offsetTop)+'px');el.style.setProperty('--vvh',vv.height+'px');};
  on();vv.addEventListener('resize',on);vv.addEventListener('scroll',on);
  return()=>{vv.removeEventListener('resize',on);vv.removeEventListener('scroll',on);};
 },[open,phone]);
 // desktop: a moved box stays inside the window
 useLayoutEffect(()=>{
  if(!open||phone||!pos)return;
  const fit=()=>{const r=panel.current?.getBoundingClientRect();if(r)setPos(p=>{if(!p)return p;const c=clamp(p,r.width,r.height);return c.x===p.x&&c.y===p.y?p:c;});};
  fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
 },[open,phone,pos,turns.length]);

 async function ask(){
  const q=draft.trim();
  if(busy||(!q&&!passage&&mode!=='quiz'))return;
  if(!way){setSetup(true);return;}
  const text=withPassage(passage,q||(mode==='quiz'&&!passage?(fa?'از من بپرس.':'Quiz me.'):''),fa);
  const history:Turn[]=[...turns,{role:'user',text}];
  setTurns([...history,{role:'assistant',text:''}]);setDraft('');setPassage('');setError('');setBusy(true);setMenu(false);setSetup(false);
  if(box.current)box.current.style.height='auto';
  const ctl=new AbortController();abort.current=ctl;
  let answer='';
  try{
   await streamAnswer(way,systemPrompt(context,mode),history,d=>{answer+=d;setTurns([...history,{role:'assistant',text:answer}]);},ctl.signal);
   if(!answer.trim())throw new ChatError('empty','other');
   if(!shown.current)setUnread(true);
  }catch(e){
   setTurns(answer?[...history,{role:'assistant',text:answer}]:history);
   if(!ctl.signal.aborted){
    if(!answer){setDraft(d=>d||q);}
    const kind=e instanceof ChatError?e.kind:'other';
    setError(kind==='key'?L('The key was not accepted. Check it in the AI settings.'):kind==='limit'?L('The provider says too many requests or no credit left. Try again shortly, or check your account.'):kind==='network'?L('Could not reach the AI service. Check your connection.'):kind==='refused'?L('The model declined to answer this. Try asking another way.'):L('Something went wrong')+': '+(e as Error).message);
    if(kind==='key')setSetup(true);
    if(!shown.current)setUnread(true);
   }
  }finally{setBusy(false);abort.current=null;}
 }

 // The grip: on a phone, drag to resize, down to hide, tap for more room; on a desktop, drag to move (double-click: back home).
 function down(e:RPointerEvent<HTMLElement>){
  if(e.button!==0)return;
  const r=panel.current!.getBoundingClientRect();
  drag.current={x:e.clientX,y:e.clientY,px:r.left,py:r.top,h:r.height,moved:false};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e:RPointerEvent<HTMLElement>){
  const d=drag.current;if(!d)return;
  const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(!d.moved&&Math.hypot(dx,dy)<6)return;
  d.moved=true;
  if(phone)setDragH(Math.max(60,d.h-dy));
  else setPos(clamp({x:d.px+dx,y:d.py+dy},panel.current!.offsetWidth,panel.current!.offsetHeight));
 }
 function up(e:RPointerEvent<HTMLElement>){
  const d=drag.current;drag.current=null;if(!d)return;
  if(!phone){if(d.moved&&pos)try{localStorage.setItem(POS,JSON.stringify(pos));}catch{/* private mode */}return;}
  setDragH(null);
  if(!d.moved){setTall(!tall);return;}
  const dy=e.clientY-d.y;
  if(dy>50&&!tall||d.h-dy<90)onClose();else setTall(d.h-dy>window.innerHeight*.5);
 }
 function home(){setPos(null);try{localStorage.removeItem(POS);}catch{/* private mode */}}

 if(!open)return <AiLaunch label={L(unread?'New answer':busy?'Thinking…':'Ask AI')+' ('+shortcutLabel()+')'} text={armed?L('Ask'):undefined} onClick={onOpen} busy={busy} unread={unread}/>;

 const paras=(t:string)=>t.split(/\n{2,}/).map((block,i)=>{
  const lines=block.split('\n');
  if(lines.every(l=>/^\s*([-*•]|\d+[.)])\s+/.test(l)))return <ul key={i}>{lines.map((l,j)=><li key={j}><Inline text={l.replace(/^\s*([-*•]|\d+[.)])\s+/,'')}/></li>)}</ul>;
  return <p key={i}>{lines.map((l,j)=><span key={j}>{j>0&&<br/>}<Inline text={l.replace(/^#+\s*/,'')}/></span>)}</p>;
 });
 const asked=(t:string)=>{const m=QUOTED.exec(t);return m?<><q className="ai-q">{m[1]??m[2]}</q><p>{m[3]}</p></>:<p>{t}</p>;};
 const place=mode==='socratic'?'What do you want to understand?':mode==='debate'?'State your view…':mode==='quiz'?'Send to start the quiz':'Ask about this chapter…';
 const canSend=busy||!!draft.trim()||!!passage||mode==='quiz';
 const style=phone?(dragH?{height:dragH,maxHeight:'none'}:undefined):pos?{left:pos.x,top:pos.y}:undefined;
 const cls='ai-panel'+(phone&&tall?' tall':'')+(dragH?' dragging':'')+(pos&&!phone?' moved':'')+(turns.length||setup||error?'':' bare');
 const current=MODES.find(m=>m.id===mode)!;
 return <aside ref={panel} className={cls} style={style} role="dialog" aria-label={L('Study companion')} dir={fa?'rtl':'ltr'} lang={lang}>
  <div className="ai-grip" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={()=>{if(!phone)home();}}/>
  {(turns.length>0||error)&&<div className="ai-body" ref={list}>
   {turns.map((t,i)=><div key={i} className={'ai-msg '+t.role} dir="auto">{t.role==='assistant'?(t.text?paras(t.text):<span className="ai-typing" aria-label={L('Thinking…')}><i/><i/><i/></span>):asked(t.text)}</div>)}
   {error&&<p className="ai-error" role="alert">{error}</p>}
  </div>}
  {setup&&<div className="ai-setup"><AiKeyForm lang={lang} compact account={acct.gemini}/>{way&&<button className="ai-done" onClick={()=>{setSetup(false);box.current?.focus();}}>{L('Done')}</button>}</div>}
  {menu&&<div className="ai-menu" role="menu">
   {MODES.map(m=><button key={m.id} role="menuitemradio" aria-checked={mode===m.id} onClick={()=>{setMode(m.id);setMenu(false);if(fine)box.current?.focus();}}><CheckRounded className={mode===m.id?'':'off'}/>{fa?m.fa:m.en}</button>)}
   <hr/>
   {turns.length>0&&<button role="menuitem" onClick={()=>{abort.current?.abort();setTurns([]);setError('');setMenu(false);}}><span className="ai-mi"/>{L('New conversation')}</button>}
   <button role="menuitem" onClick={()=>{setSetup(!setup);setMenu(false);}}><span className="ai-mi"/>{L('AI settings')}<small dir="ltr">{way?way.name+(way.kind==='account'?' · '+L('account'):''):''}</small></button>
  </div>}
  {passage&&<div className="ai-passage" dir="auto"><q>{passage}</q><button type="button" aria-label={L('Remove passage')} onClick={()=>{setPassage('');if(fine)box.current?.focus();}}><CloseRounded/></button></div>}
  <form className="ai-input" onSubmit={e=>{e.preventDefault();if(busy)abort.current?.abort();else void ask();}}>
   <button type="button" className={'ai-more'+(menu?' on':'')+(mode!=='explain'?' moded':'')} aria-label={L('Options')+' · '+(fa?current.fa:current.en)} title={fa?current.fa:current.en} aria-expanded={menu} onClick={()=>setMenu(!menu)}><AutoAwesomeRounded/></button>
   <textarea ref={box} rows={1} dir="auto" value={draft} placeholder={L(place)} aria-label={L('Your question')}
    onChange={e=>{setDraft(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(phone?96:140,e.target.scrollHeight)+'px';}}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&fine){e.preventDefault();void ask();}}}/>
   <button type="submit" className={'ai-send'+(busy?' stop':'')} aria-label={L(busy?'Stop':'Send')} disabled={!canSend}>{busy?<StopRounded/>:<ArrowUpwardRounded/>}</button>
  </form>
 </aside>;
}
