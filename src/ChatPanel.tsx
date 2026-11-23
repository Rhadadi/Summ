// The study companion: a chat beside the chapter, answering from the chapter's summary with the reader's own AI key.
// Conversations are kept per chapter while the page is open; nothing is stored on the server.
// Phone: a see-through bottom sheet over the lower part of the page; drag the top edge to resize, swipe it down to hide.
// Desktop: a floating panel that can be dragged anywhere by its header (double-click puts it back).
// Hiding (Esc, the chevron, ⌘K / Ctrl K) only tucks it into the bubble: an answer in progress keeps coming.
import{useEffect,useLayoutEffect,useRef,useState,type PointerEvent as RPointerEvent}from'react';
import{IconButton}from'@mui/material';
import{ArrowUpwardRounded,AutoAwesomeRounded,DeleteSweepOutlined,KeyboardArrowDownRounded,SettingsOutlined,StopRounded}from'@mui/icons-material';
import Inline from'./InlineText';
import AiKeyForm from'./AiKeyForm';
import AiLaunch from'./AiLaunch';
import{MODES,starters,systemPrompt,type ChapterContext,type Mode}from'./ai-prompt';
import{ChatError,streamAnswer,type Turn}from'./ai-chat';
import{PROVIDERS,loadAi,modelOf,ready,shortcutLabel,useAi}from'./ai-settings';
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

interface Props{open:boolean;onOpen:()=>void;onClose:()=>void;lang:string;context:ChapterContext;chapterKey:string;quote?:string;quoteId?:number}
export default function ChatPanel({open,onOpen,onClose,lang,context,chapterKey,quote,quoteId}:Props){
 const L=(t:string)=>tr(lang,t),fa=lang==='fa';
 const phone=useMedia('(max-width:699px)'),fine=useMedia('(pointer:fine)');
 const[ai]=useAi(),[setup,setSetup]=useState(()=>!ready(loadAi()));
 const start=kept.get(chapterKey);
 const[mode,setMode]=useState<Mode>(start?.mode||'explain'),[turns,setTurns]=useState<Turn[]>(start?.turns||[]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const[unread,setUnread]=useState(false),[tall,setTall]=useState(false),[dragH,setDragH]=useState<number|null>(null),[pos,setPos]=useState<Pos|null>(savedPos);
 const abort=useRef<AbortController|null>(null),box=useRef<HTMLTextAreaElement>(null),list=useRef<HTMLDivElement>(null),panel=useRef<HTMLElement>(null);
 const drag=useRef<{x:number;y:number;px:number;py:number;h:number;moved:boolean;grip:boolean}|null>(null),shown=useRef(open);
 shown.current=open;
 // a new chapter brings its own conversation
 useEffect(()=>{abort.current?.abort();const k=kept.get(chapterKey);setMode(k?.mode||'explain');setTurns(k?.turns||[]);setError('');},[chapterKey]);
 useEffect(()=>{kept.set(chapterKey,{mode,turns});},[chapterKey,mode,turns]);
 // a passage brought in with ⌘K / Ctrl K (selected, or copied a moment ago) joins the question being written.
 // On a phone the keyboard would cover half the page the moment the sheet opens: focus only with a mouse, or to ask about a passage.
 useEffect(()=>{
  if(!open)return;
  setUnread(false);
  if(quote){const line=(fa?'دربارهٔ این بخش: «'+quote+'»':'About this passage: “'+quote+'”')+'\n';setDraft(d=>d.includes(quote)?d:(d.trim()?d.trimEnd()+'\n\n':'')+line);}
  if(fine||quote)setTimeout(()=>{const b=box.current;if(!b)return;b.focus();b.setSelectionRange(b.value.length,b.value.length);b.style.height='auto';b.style.height=Math.min(phone?110:160,b.scrollHeight)+'px';b.scrollTop=b.scrollHeight;},60);
 },[open,quote,quoteId,fa,fine,phone]);
 useEffect(()=>{if(open&&!ready(loadAi()))setSetup(true);},[open]);
 useEffect(()=>{list.current?.scrollTo({top:list.current.scrollHeight});},[turns,busy,open]);
 useEffect(()=>()=>abort.current?.abort(),[]);
 // phone: keep the sheet above the on-screen keyboard, and let the last lines of the chapter scroll clear of it
 useEffect(()=>{
  if(!open||!phone)return;
  const vv=window.visualViewport,b=document.body,pad=b.style.paddingBottom;b.style.paddingBottom='46dvh';
  const on=()=>{const el=panel.current;if(!el||!vv)return;el.style.setProperty('--kb',Math.max(0,window.innerHeight-vv.height-vv.offsetTop)+'px');el.style.setProperty('--vvh',vv.height+'px');};
  on();vv?.addEventListener('resize',on);vv?.addEventListener('scroll',on);
  return()=>{b.style.paddingBottom=pad;vv?.removeEventListener('resize',on);vv?.removeEventListener('scroll',on);};
 },[open,phone]);
 // desktop: a moved panel stays inside the window when it shrinks
 useLayoutEffect(()=>{
  if(!open||phone||!pos)return;
  const fit=()=>{const r=panel.current?.getBoundingClientRect();if(r)setPos(p=>{if(!p)return p;const c=clamp(p,r.width,r.height);return c.x===p.x&&c.y===p.y?p:c;});};
  fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);
 },[open,phone,pos]);

 async function ask(text:string){
  const q=text.trim();if(!q||busy)return;
  if(!ready(ai)){setSetup(true);return;}
  const history:Turn[]=[...turns,{role:'user',text:q}];
  setTurns([...history,{role:'assistant',text:''}]);setDraft('');setError('');setBusy(true);
  if(box.current)box.current.style.height='auto';
  const ctl=new AbortController();abort.current=ctl;
  let answer='';
  try{
   await streamAnswer(ai,systemPrompt(context,mode),history,d=>{answer+=d;setTurns([...history,{role:'assistant',text:answer}]);},ctl.signal);
   if(!answer.trim())throw new ChatError('empty','other');
   if(!shown.current)setUnread(true);
  }catch(e){
   if(ctl.signal.aborted){setTurns(answer?[...history,{role:'assistant',text:answer}]:history);}
   else{
    setTurns(answer?[...history,{role:'assistant',text:answer}]:history);setDraft(d=>d||q);
    const kind=e instanceof ChatError?e.kind:'other';
    setError(kind==='key'?L('The key was not accepted. Check it in the AI settings.'):kind==='limit'?L('The provider says too many requests or no credit left. Try again shortly, or check your account.'):kind==='network'?L('Could not reach the AI service. Check your connection.'):kind==='refused'?L('The model declined to answer this. Try asking another way.'):L('Something went wrong')+': '+(e as Error).message);
    if(kind==='key')setSetup(true);
    if(!shown.current)setUnread(true);
   }
  }finally{setBusy(false);abort.current=null;}
 }

 // Dragging the header: on a phone it resizes the sheet (down far enough hides it, a tap switches half/full height);
 // on a desktop it moves the panel.
 function down(e:RPointerEvent<HTMLElement>){
  if(e.button!==0||(e.target as Element).closest('button,select,a'))return;
  const r=panel.current!.getBoundingClientRect();
  drag.current={x:e.clientX,y:e.clientY,px:r.left,py:r.top,h:r.height,moved:false,grip:!!(e.target as Element).closest('.ai-grip')};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e:RPointerEvent<HTMLElement>){
  const d=drag.current;if(!d)return;
  const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(!d.moved&&Math.hypot(dx,dy)<6)return;
  d.moved=true;
  if(phone)setDragH(Math.max(90,d.h-dy));
  else setPos(clamp({x:d.px+dx,y:d.py+dy},panel.current!.offsetWidth,panel.current!.offsetHeight));
 }
 function up(e:RPointerEvent<HTMLElement>){
  const d=drag.current;drag.current=null;if(!d)return;
  if(!phone){if(d.moved&&pos)try{localStorage.setItem(POS,JSON.stringify(pos));}catch{/* private mode */}return;}
  setDragH(null);
  if(!d.moved){if(d.grip)setTall(!tall);return;}
  const h=d.h-(e.clientY-d.y),vh=window.innerHeight;
  if(h<vh*.26)onClose();else setTall(h>vh*.62);
 }
 function home(){setPos(null);try{localStorage.removeItem(POS);}catch{/* private mode */}}

 if(!open)return <AiLaunch label={L(unread?'New answer':busy?'Thinking…':'Ask AI')+' ('+shortcutLabel()+')'} onClick={onOpen} busy={busy} unread={unread}/>;

 const provider=PROVIDERS.find(p=>p.id===ai.provider)!,model=provider.models.find(m=>m.id===modelOf(ai));
 const hint=MODES.find(m=>m.id===mode)!;
 const paras=(t:string)=>t.split(/\n{2,}/).map((block,i)=>{
  const lines=block.split('\n');
  if(lines.every(l=>/^\s*([-*•]|\d+[.)])\s+/.test(l)))return <ul key={i}>{lines.map((l,j)=><li key={j}><Inline text={l.replace(/^\s*([-*•]|\d+[.)])\s+/,'')}/></li>)}</ul>;
  return <p key={i}>{lines.map((l,j)=><span key={j}>{j>0&&<br/>}<Inline text={l.replace(/^#+\s*/,'')}/></span>)}</p>;
 });
 const style=phone?(dragH?{height:dragH}:undefined):pos?{left:pos.x,top:pos.y}:undefined;
 const cls='ai-panel'+(phone?(tall?' tall':''):'')+(dragH?' dragging':'')+(pos&&!phone?' moved':'');
 return <aside ref={panel} className={cls} style={style} role="dialog" aria-label={L('Study companion')} dir={fa?'rtl':'ltr'} lang={lang} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <header className="ai-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onDoubleClick={e=>{if(!phone&&!(e.target as Element).closest('button,select'))home();}} title={phone?undefined:L('Drag to move')}>
   <span className="ai-grip" aria-hidden="true"/>
   <AutoAwesomeRounded className="ai-spark"/>
   <div className="ai-title"><strong>{L('Study companion')}</strong><small dir="auto">{ready(ai)?(model?.name||modelOf(ai))+' · '+L('your key'):L('Add your AI key to start')}</small></div>
   <select className="ai-mode-pick" value={mode} aria-label={L('Mode')} onChange={e=>setMode(e.target.value as Mode)}>{MODES.map(m=><option key={m.id} value={m.id}>{fa?m.fa:m.en}</option>)}</select>
   <span className="grow"/>
   {turns.length>0&&<IconButton size="small" aria-label={L('New conversation')} title={L('New conversation')} onClick={()=>{abort.current?.abort();setTurns([]);setError('');}}><DeleteSweepOutlined fontSize="small"/></IconButton>}
   <IconButton size="small" aria-label={L('AI settings')} title={L('AI settings')} aria-pressed={setup} onClick={()=>setSetup(!setup)}><SettingsOutlined fontSize="small"/></IconButton>
   <IconButton size="small" aria-label={L('Hide')} title={L('Hide')+' (Esc)'} onClick={onClose}><KeyboardArrowDownRounded/></IconButton>
  </header>
  <div className="ai-modes" role="group" aria-label={L('Mode')}>{MODES.map(m=><button key={m.id} aria-pressed={mode===m.id} className={mode===m.id?'on':''} onClick={()=>setMode(m.id)}>{fa?m.fa:m.en}</button>)}</div>
  <div className="ai-body" ref={list}>
   {setup&&<div className="ai-setup"><p>{L('The companion answers from this chapter, using your own Claude, ChatGPT or Gemini API key.')}</p><AiKeyForm lang={lang}/>{ready(ai)&&<button className="ai-done" onClick={()=>{setSetup(false);box.current?.focus();}}>{L('Done')}</button>}</div>}
   {!setup&&ready(ai)&&!turns.length&&<div className="ai-empty"><p>{fa?hint.hintFa:hint.hintEn} · <span dir="auto">«{context.chapterTitle}»</span></p>
    <p className="ai-tip">{fine?<>{L('Select or copy a passage, then press')} <kbd dir="ltr">{shortcutLabel()}</kbd> {L('to ask about it.')}</>:L('Copy a passage, then tap ✦ to ask about it.')}</p>
    {mode==='explain'?<div className="ai-starters">{starters(lang).map(s=><button key={s} onClick={()=>void ask(s)}>{s}</button>)}</div>
    :<button className="ai-go" onClick={()=>void ask(mode==='quiz'?(fa?'از من بپرس.':'Quiz me.'):mode==='socratic'?(fa?'بیا با پرسش شروع کنیم.':'Let\'s start.'):(fa?'دیدگاه نویسنده را نقد کن.':'Argue against the author\'s view.'))}>{L('Start')}</button>}</div>}
   {turns.map((t,i)=><div key={i} className={'ai-msg '+t.role} dir="auto">{t.role==='assistant'?(t.text?paras(t.text):<span className="ai-typing" aria-label={L('Thinking…')}><i/><i/><i/></span>):<p>{t.text}</p>}</div>)}
   {error&&<p className="ai-error" role="alert">{error}</p>}
  </div>
  <form className="ai-input" onSubmit={e=>{e.preventDefault();if(busy)abort.current?.abort();else void ask(draft);}}>
   <textarea ref={box} rows={1} dir="auto" value={draft} placeholder={L('Ask a follow-up question…')} aria-label={L('Your question')}
    onChange={e=>{setDraft(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(phone?110:160,e.target.scrollHeight)+'px';}}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&fine){e.preventDefault();void ask(draft);}}}/>
   <button type="submit" className={'ai-send'+(busy?' stop':'')} aria-label={L(busy?'Stop':'Send')} disabled={!busy&&!draft.trim()}>{busy?<StopRounded/>:<ArrowUpwardRounded/>}</button>
  </form>
  <small className="ai-foot">{L('Answers can be wrong; check them against the chapter.')} <kbd dir="ltr">{shortcutLabel()}</kbd></small>
 </aside>;
}
