import{useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent}from'react';
import{Alert,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,Slider,ToggleButton,ToggleButtonGroup,useMediaQuery}from'@mui/material';
import{AddRounded,CloseRounded,RemoveRounded}from'@mui/icons-material';
import{DEFAULT_FRAME,ZOOM_MAX,ZOOM_MIN,clampFrame,focusToPoint,frameCrop,nudge,pointToFocus,sameFrame,shown,type Frame}from'./frame.ts';
import{num,rtl as isRtl,tr}from'./i18n';
import'./frame.css';

// Frame the background: the whole picture with a ring on the part that matters, a zoom, and live previews of the three places the picture appears.
// The previews use the same rules as the pages (object-position + scale around the same point), at the pages' real shapes.
interface Props{lang:string;bookLang?:string;url:string;whole?:boolean;title:string;frame?:Frame;framePhone?:Frame;onSave:(wide:Frame|null,phone:Frame|null)=>Promise<void>;onClose:()=>void}
type Tab='wide'|'phone';
// Shapes as the pages draw them (width : height): slider 1440x594 and 390x600, book intro 1200x330 and 390x285, chapter strip 1000x245.
const SHAPE={slider:{wide:2.42,phone:.65},intro:{wide:3.6,phone:1.37},chapter:{wide:4.1,phone:4.1}};
const style=(f:Frame):CSSProperties=>({'--fx':f.x+'%','--fy':f.y+'%','--fz':String(f.zoom)} as CSSProperties);

function Preview({label,kind,tab,f,url,whole,rtl,title,onWheel}:{label:string;kind:keyof typeof SHAPE;tab:Tab;f:Frame;url:string;whole?:boolean;rtl:boolean;title:string;onWheel:(dir:number)=>void}){
 const ref=useRef<HTMLDivElement>(null);
 // React's wheel listener is passive and cannot stop the page scrolling; this one can.
 useEffect(()=>{const el=ref.current;if(!el)return;const h=(e:WheelEvent)=>{e.preventDefault();onWheel(e.deltaY<0?1:-1);};el.addEventListener('wheel',h,{passive:false});return()=>el.removeEventListener('wheel',h);},[onWheel]);
 return <figure className={'fd-fig '+kind+' '+tab}><figcaption>{label}</figcaption>
  <div ref={ref} className={'fd-prev '+kind+(whole?' whole':'')+(rtl?' rtl':'')} style={{...style(f),aspectRatio:String(SHAPE[kind][tab])}}>
   {whole&&<img className="fd-fill" src={url} alt="" aria-hidden="true" draggable={false}/>}
   <img className="fd-main" src={url} alt="" draggable={false}/>
   <div className="fd-shade"/>
   {/* A mock of the text, so the owner sees what it will cover. */}
   <div className="fd-mock"><i className="gold"/><b dir="auto">{title}</b><i/><i className="short"/></div>
  </div></figure>;
}

export default function FrameDialog({lang,bookLang,url,whole,title,frame,framePhone,onSave,onClose}:Props){
 const L=(t:string)=>tr(lang,t),dir=isRtl(lang)?'rtl':'ltr',rtl=isRtl(bookLang||lang),phoneScreen=useMediaQuery('(max-width:699px)');
 const[tab,setTab]=useState<Tab>('wide'),[wide,setWide]=useState<Frame>(frame||DEFAULT_FRAME),[phone,setPhone]=useState<Frame>(framePhone||frame||DEFAULT_FRAME),[same,setSame]=useState(!framePhone);
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 const[nat,setNat]=useState({w:4,h:3}),[box,setBox]=useState({w:0,h:0}),[stage,setStage]=useState<HTMLDivElement|null>(null),drag=useRef(false);
 // The frame being edited: the wide one, or the phone one when phones differ.
 const editingPhone=tab==='phone'&&!same,current=editingPhone?phone:wide,locked=tab==='phone'&&same;
 const set=(f:Frame)=>{if(locked)return;const c=clampFrame(f);if(editingPhone)setPhone(c);else setWide(c);};
 const latest=useRef(current);latest.current=current;
 const zoomBy=useRef((d:number)=>{});zoomBy.current=(d:number)=>set(nudge(latest.current,0,0,d*.1));
 const onWheel=useRef((d:number)=>zoomBy.current(d)).current;
 // The dialog mounts its content a moment after this component, so the stage arrives through a state-held ref.
 useLayoutEffect(()=>{const el=stage;if(!el)return;const read=()=>setBox({w:el.clientWidth,h:el.clientHeight});read();if(typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(read);ro.observe(el);return()=>ro.disconnect();},[stage]);
 useEffect(()=>{const el=stage;if(!el)return;const h=(e:WheelEvent)=>{e.preventDefault();zoomBy.current(e.deltaY<0?1:-1);};el.addEventListener('wheel',h,{passive:false});return()=>el.removeEventListener('wheel',h);},[stage]);
 function point(e:PointerEvent){const r=stage!.getBoundingClientRect();const p=pointToFocus(e.clientX-r.left,e.clientY-r.top,{w:r.width,h:r.height},nat);set({...current,...p});}
 function key(e:KeyboardEvent){
  const s=e.shiftKey?5:1,k=e.key;
  const move=k==='ArrowLeft'?[-s,0]:k==='ArrowRight'?[s,0]:k==='ArrowUp'?[0,-s]:k==='ArrowDown'?[0,s]:null;
  if(move){e.preventDefault();set(nudge(current,move[0],move[1]));}
  else if(k==='+'||k==='='){e.preventDefault();set(nudge(current,0,0,.1));}
  else if(k==='-'||k==='_'){e.preventDefault();set(nudge(current,0,0,-.1));}
 }
 // Previews of the other tab's places would only confuse: wide shows slider, intro and chapter strip; phones shows the two phone views.
 const shownFrame=(t:Tab)=>t==='phone'&&same?wide:t==='phone'?phone:wide;
 const dirty=!sameFrame(wide,frame||DEFAULT_FRAME)||same!==!framePhone||(!same&&!sameFrame(phone,framePhone||frame||DEFAULT_FRAME));
 const pr=focusToPoint(current,box,nat),vis=frameCrop({w:nat.w,h:nat.h},{w:SHAPE.slider[tab]*100,h:100},shownFrame(tab)),img=shown(box,nat);
 async function save(){
  setBusy(true);setError('');
  // The default framing is "no framing": the pages then render exactly as they did before.
  const w=clampFrame(wide),p=same?null:clampFrame(phone),plain=sameFrame(w,DEFAULT_FRAME)&&(!p||sameFrame(p,DEFAULT_FRAME));
  try{await onSave(plain?null:w,plain?null:p);onClose();}catch(e){setError((e as Error).message);setBusy(false);}
 }
 const reset=()=>{if(!locked)set(DEFAULT_FRAME);};
 const N=(n:number)=>num(lang,Math.round(n*10)/10);
 return <Dialog open onClose={busy?undefined:onClose} fullScreen={phoneScreen} fullWidth maxWidth="md" slotProps={{paper:{dir,className:'fd-paper'}}} aria-labelledby="fd-title">
  <DialogTitle id="fd-title" className="dialog-heading"><span>{L('Frame the background')}</span><IconButton aria-label={L('Close')} onClick={onClose} disabled={busy}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent className="fd-content">
   <p className="fd-lead">{L('Drag the ring to the part of the picture that matters. Readers see the picture cropped around it.')}</p>
   {error&&<Alert severity="error" onClose={()=>setError('')} sx={{mb:1}}>{error}</Alert>}
   <div className="fd-grid">
    <div className="fd-left">
     <ToggleButtonGroup exclusive size="small" value={tab} onChange={(_,v)=>v&&setTab(v)} aria-label={L('Which screens')} className="fd-tabs"><ToggleButton value="wide">{L('Wide screens')}</ToggleButton><ToggleButton value="phone">{L('Phones')}</ToggleButton></ToggleButtonGroup>
     {tab==='phone'&&<FormControlLabel className="fd-same" control={<Checkbox checked={same} onChange={e=>{setSame(e.target.checked);if(!e.target.checked)setPhone(wide);}}/>} label={L('Phones use the same framing')}/>}
     <div ref={setStage} className={'fd-stage'+(locked?' locked':'')} tabIndex={0} role="group" aria-label={L('Focus point. Use the arrow keys to move it, plus and minus to zoom.')} onKeyDown={key} dir="ltr"
      onPointerDown={e=>{if(locked)return;drag.current=true;e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.focus();point(e);}} onPointerMove={e=>{if(drag.current)point(e);}} onPointerUp={()=>{drag.current=false;}} onPointerCancel={()=>{drag.current=false;}}>
      <img src={url} alt="" draggable={false} onLoad={e=>setNat({w:e.currentTarget.naturalWidth||4,h:e.currentTarget.naturalHeight||3})}/>
      {box.w>0&&<><div className="fd-crop" style={{left:img.x+img.w*vis.sx/nat.w,top:img.y+img.h*vis.sy/nat.h,width:img.w*vis.sw/nat.w,height:img.h*vis.sh/nat.h}} aria-hidden="true"/>
       <div className="fd-ring" style={{left:pr.x,top:pr.y}} aria-hidden="true"/></>}
     </div>
     <div className="fd-zoom" dir="ltr"><IconButton size="small" aria-label={L('Zoom out')} disabled={locked||current.zoom<=ZOOM_MIN} onClick={()=>set(nudge(current,0,0,-.1))}><RemoveRounded/></IconButton>
      <Slider size="small" min={ZOOM_MIN} max={ZOOM_MAX} step={.05} value={current.zoom} disabled={locked} onChange={(_,v)=>set({...current,zoom:v as number})} aria-label={L('Zoom')}/>
      <IconButton size="small" aria-label={L('Zoom in')} disabled={locked||current.zoom>=ZOOM_MAX} onClick={()=>set(nudge(current,0,0,.1))}><AddRounded/></IconButton><output>{N(current.zoom)}×</output></div>
     <small className="fd-hint">{L('Arrow keys move the focus by 1%, with Shift by 5%. Plus and minus zoom; so does the mouse wheel over a preview.')}</small>
    </div>
    <div className="fd-right">
     {tab==='wide'?<>
      <Preview label={L('Home page slider')} kind="slider" tab="wide" f={wide} url={url} whole={whole} rtl={rtl} title={title} onWheel={onWheel}/>
      <Preview label={L('Book page')} kind="intro" tab="wide" f={wide} url={url} whole={whole} rtl={rtl} title={title} onWheel={onWheel}/>
      <Preview label={L('Chapter header')} kind="chapter" tab="wide" f={wide} url={url} whole={whole} rtl={rtl} title={title} onWheel={onWheel}/></>
     :<div className="fd-phones">
      <Preview label={L('Home page slider')} kind="slider" tab="phone" f={shownFrame('phone')} url={url} whole={whole} rtl={rtl} title={title} onWheel={onWheel}/>
      <Preview label={L('Book page')} kind="intro" tab="phone" f={shownFrame('phone')} url={url} whole={whole} rtl={rtl} title={title} onWheel={onWheel}/></div>}
    </div>
   </div>
  </DialogContent>
  <DialogActions className="fd-actions"><Button onClick={reset} disabled={busy||locked} sx={{marginInlineEnd:'auto'}}>{L('Reset')}</Button><Button onClick={onClose} disabled={busy}>{L('Cancel')}</Button><Button variant="contained" disableElevation disabled={busy||!dirty} onClick={()=>void save()}>{L(busy?'Saving…':'Save')}</Button></DialogActions>
 </Dialog>;
}
