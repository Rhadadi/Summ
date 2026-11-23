// The study companion: a chat beside the chapter, answering from the chapter's summary with the reader's own AI key.
// Conversations are kept per chapter while the page is open; nothing is stored on the server.
import{useEffect,useRef,useState}from'react';
import{IconButton}from'@mui/material';
import{ArrowUpwardRounded,AutoAwesomeRounded,CloseRounded,DeleteSweepOutlined,SettingsOutlined,StopRounded}from'@mui/icons-material';
import Inline from'./InlineText';
import AiKeyForm from'./AiKeyForm';
import{MODES,starters,systemPrompt,type ChapterContext,type Mode}from'./ai-prompt';
import{ChatError,streamAnswer,type Turn}from'./ai-chat';
import{PROVIDERS,loadAi,modelOf,ready,shortcutLabel,useAi}from'./ai-settings';
import{tr}from'./i18n';

const ai0=()=>loadAi();
const kept=new Map<string,{mode:Mode;turns:Turn[]}>();
interface Props{open:boolean;onClose:()=>void;lang:string;context:ChapterContext;chapterKey:string;quote?:string}
export default function ChatPanel({open,onClose,lang,context,chapterKey,quote}:Props){
 const L=(t:string)=>tr(lang,t),fa=lang==='fa';
 const[ai]=useAi(),[setup,setSetup]=useState(()=>!ready(ai0()));
 const start=kept.get(chapterKey);
 const[mode,setMode]=useState<Mode>(start?.mode||'explain'),[turns,setTurns]=useState<Turn[]>(start?.turns||[]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const abort=useRef<AbortController|null>(null),box=useRef<HTMLTextAreaElement>(null),list=useRef<HTMLDivElement>(null);
 // a new chapter brings its own conversation
 useEffect(()=>{abort.current?.abort();const k=kept.get(chapterKey);setMode(k?.mode||'explain');setTurns(k?.turns||[]);setError('');},[chapterKey]);
 useEffect(()=>{kept.set(chapterKey,{mode,turns});},[chapterKey,mode,turns]);
 useEffect(()=>{if(open){if(quote)setDraft(d=>d||(fa?'دربارهٔ این بخش: «'+quote+'»\n':'About this passage: “'+quote+'”\n'));setTimeout(()=>box.current?.focus(),60);}},[open,quote,fa]);
 useEffect(()=>{if(open&&!ready(loadAi()))setSetup(true);},[open]);
 useEffect(()=>{list.current?.scrollTo({top:list.current.scrollHeight});},[turns,busy]);
 useEffect(()=>()=>abort.current?.abort(),[]);
 if(!open)return null;
 const provider=PROVIDERS.find(p=>p.id===ai.provider)!,model=provider.models.find(m=>m.id===modelOf(ai));
 async function ask(text:string){
  const q=text.trim();if(!q||busy)return;
  if(!ready(ai)){setSetup(true);return;}
  const history:Turn[]=[...turns,{role:'user',text:q}];
  setTurns([...history,{role:'assistant',text:''}]);setDraft('');setError('');setBusy(true);
  const ctl=new AbortController();abort.current=ctl;
  let answer='';
  try{
   await streamAnswer(ai,systemPrompt(context,mode),history,d=>{answer+=d;setTurns([...history,{role:'assistant',text:answer}]);},ctl.signal);
   if(!answer.trim())throw new ChatError('empty','other');
  }catch(e){
   if(ctl.signal.aborted){setTurns(answer?[...history,{role:'assistant',text:answer}]:history);}
   else{
    setTurns(answer?[...history,{role:'assistant',text:answer}]:history);setDraft(d=>d||q);
    const kind=e instanceof ChatError?e.kind:'other';
    setError(kind==='key'?L('The key was not accepted. Check it in the AI settings.'):kind==='limit'?L('The provider says too many requests or no credit left. Try again shortly, or check your account.'):kind==='network'?L('Could not reach the AI service. Check your connection.'):kind==='refused'?L('The model declined to answer this. Try asking another way.'):L('Something went wrong')+': '+(e as Error).message);
    if(kind==='key')setSetup(true);
   }
  }finally{setBusy(false);abort.current=null;}
 }
 const hint=MODES.find(m=>m.id===mode)!;
 const paras=(t:string)=>t.split(/\n{2,}/).map((block,i)=>{
  const lines=block.split('\n');
  if(lines.every(l=>/^\s*([-*•]|\d+[.)])\s+/.test(l)))return <ul key={i}>{lines.map((l,j)=><li key={j}><Inline text={l.replace(/^\s*([-*•]|\d+[.)])\s+/,'')}/></li>)}</ul>;
  return <p key={i}>{lines.map((l,j)=><span key={j}>{j>0&&<br/>}<Inline text={l.replace(/^#+\s*/,'')}/></span>)}</p>;
 });
 return <aside className="ai-panel" role="dialog" aria-label={L('Study companion')} dir={fa?'rtl':'ltr'} lang={lang} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>
  <header className="ai-head">
   <AutoAwesomeRounded className="ai-spark"/><div><strong>{L('Study companion')}</strong><small dir="auto">{ready(ai)?(model?.name||modelOf(ai))+' · '+L('your key'):L('Add your AI key to start')}</small></div>
   <span className="grow"/>
   {turns.length>0&&<IconButton size="small" aria-label={L('New conversation')} title={L('New conversation')} onClick={()=>{abort.current?.abort();setTurns([]);setError('');}}><DeleteSweepOutlined fontSize="small"/></IconButton>}
   <IconButton size="small" aria-label={L('AI settings')} title={L('AI settings')} aria-pressed={setup} onClick={()=>setSetup(!setup)}><SettingsOutlined fontSize="small"/></IconButton>
   <IconButton size="small" aria-label={L('Close')} title={L('Close')+' (Esc)'} onClick={onClose}><CloseRounded fontSize="small"/></IconButton>
  </header>
  <div className="ai-modes" role="group" aria-label={L('Mode')}>{MODES.map(m=><button key={m.id} aria-pressed={mode===m.id} className={mode===m.id?'on':''} onClick={()=>setMode(m.id)}>{fa?m.fa:m.en}</button>)}</div>
  <div className="ai-body" ref={list}>
   {setup&&<div className="ai-setup"><p>{L('The companion answers from this chapter, using your own Claude, ChatGPT or Gemini API key.')}</p><AiKeyForm lang={lang}/>{ready(ai)&&<button className="ai-done" onClick={()=>{setSetup(false);box.current?.focus();}}>{L('Done')}</button>}</div>}
   {!setup&&ready(ai)&&!turns.length&&<div className="ai-empty"><p>{fa?hint.hintFa:hint.hintEn} · <span dir="auto">«{context.chapterTitle}»</span></p>
    {mode==='explain'?<div className="ai-starters">{starters(lang).map(s=><button key={s} onClick={()=>void ask(s)}>{s}</button>)}</div>
    :<button className="ai-go" onClick={()=>void ask(mode==='quiz'?(fa?'از من بپرس.':'Quiz me.'):mode==='socratic'?(fa?'بیا با پرسش شروع کنیم.':'Let\'s start.'):(fa?'دیدگاه نویسنده را نقد کن.':'Argue against the author\'s view.'))}>{L('Start')}</button>}</div>}
   {turns.map((t,i)=><div key={i} className={'ai-msg '+t.role} dir="auto">{t.role==='assistant'?(t.text?paras(t.text):<span className="ai-typing" aria-label={L('Thinking…')}><i/><i/><i/></span>):<p>{t.text}</p>}</div>)}
   {error&&<p className="ai-error" role="alert">{error}</p>}
  </div>
  <form className="ai-input" onSubmit={e=>{e.preventDefault();if(busy)abort.current?.abort();else void ask(draft);}}>
   <textarea ref={box} rows={1} dir="auto" value={draft} placeholder={L('Ask a follow-up question…')} aria-label={L('Your question')}
    onChange={e=>{setDraft(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(160,e.target.scrollHeight)+'px';}}
    onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void ask(draft);}}}/>
   <button type="submit" className={'ai-send'+(busy?' stop':'')} aria-label={L(busy?'Stop':'Send')} disabled={!busy&&!draft.trim()}>{busy?<StopRounded/>:<ArrowUpwardRounded/>}</button>
  </form>
  <small className="ai-foot">{L('Answers can be wrong; check them against the chapter.')} <kbd dir="ltr">{shortcutLabel()}</kbd></small>
 </aside>;
}
