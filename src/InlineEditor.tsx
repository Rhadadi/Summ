// Editing a published book on the reading page itself (owners and editors only; loaded on demand).
// The blocks are uncontrolled contentEditable elements: React draws them once and never touches their children again, so the browser keeps
// the caret and the typing. A block redraws only when its `rev` changes (mount, undo, a format, a structural edit); keystrokes reach the
// draft 400 ms after the last one. State lives in use-draft.ts; PublishedBook owns it and saves.
import{memo,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode}from'react';
import{Button,Divider,IconButton,ListItemIcon,Menu,MenuItem,Paper,Popper,Tooltip,useMediaQuery}from'@mui/material';
import{CheckRounded,DeleteOutlineRounded,DeleteSweepOutlined,FormatBoldRounded,FormatClearRounded,FormatItalicRounded,FormatQuoteRounded,MoreVertRounded,RedoRounded,TitleRounded,UndoRounded,ArrowUpwardRounded,ArrowDownwardRounded,AddRounded}from'@mui/icons-material';
import{EditContext,type EditCtl}from'./edit-context';
import type{PubPara}from'./types';
import{clearMarks,concatSpans,hasMark,parseInline,serializeInline,snapToWords,splitSpans,spansToHtml,toggleMark,wordAt,type Mark}from'./inline.ts';
import{locate,plainFromDom,pointOffset,spansFromDom,type N}from'./inline-dom.ts';
import{mergePara,splitPara}from'./inline-draft.ts';
import{num}from'./i18n';
import'./editing.css';

type Part='text'|'heading'|'caption'|'title';
interface Sel{el:HTMLElement;scope:string;index:number;part:Part;start:number;end:number}
const asN=(n:Node)=>n as unknown as N;
const isMac=typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent);
const blockOf=(n:Node|null):HTMLElement|null=>{const e=n&&(n.nodeType===1?n as Element:n.parentElement);return e?.closest<HTMLElement>('[data-edit-block]')||null;};
const rich=(el:HTMLElement)=>el.dataset.part!=='heading'&&el.dataset.part!=='title';
// The selection as character offsets in its block, when it lies inside one block.
function readSel():Sel|null{
 const s=getSelection();if(!s||!s.rangeCount)return null;
 const r=s.getRangeAt(0),el=blockOf(r.startContainer);
 if(!el||el!==blockOf(r.endContainer))return null;
 const a=pointOffset(asN(el),asN(r.startContainer),r.startOffset),b=pointOffset(asN(el),asN(r.endContainer),r.endOffset);
 return{el,scope:el.dataset.scope!,index:+el.dataset.index!,part:el.dataset.part as Part,start:Math.min(a,b),end:Math.max(a,b)};
}
function select(el:HTMLElement,start:number,end=start){
 const[sn,so]=locate(asN(el),start),[en,eo]=locate(asN(el),end),r=document.createRange(),s=getSelection();
 r.setStart(sn as unknown as Node,so);r.setEnd(en as unknown as Node,eo);s?.removeAllRanges();s?.addRange(r);
}
const listOf=(ctl:EditCtl,scope:string)=>{const v=ctl.d.value(scope);return Array.isArray(v)?v:null;};
const blockKey=(scope:string,index:number,part:string)=>scope+'#'+index+'#'+part;
// Writes one field of one block (or a whole title) into the draft.
function setPart(ctl:EditCtl,scope:string,index:number,part:Part,value:string,how:'typing'|'step',bump:string[]=[]){
 const cur=ctl.d.value(scope);
 if(typeof cur==='string'){ctl.d.commit(scope,value,how,bump);return;}
 const list=[...cur],item={...list[index]};
 if(part==='heading')item.heading=value;else item.text=value;
 list[index]=item;ctl.d.commit(scope,list,how,bump);
}
// A change to the list itself: the blocks redraw, and the caret goes where `caret` says.
function editList(ctl:EditCtl,scope:string,fn:(list:PubPara[])=>PubPara[]|null,caret?:{index:number;part:string;start:number}){
 ctl.d.flush();
 const cur=listOf(ctl,scope);if(!cur)return;
 const next=fn([...cur]);if(!next)return;
 if(caret)ctl.d.setCaret({scope,...caret});
 ctl.d.commit(scope,next,'step',[scope]);
}
const fixed=(p:PubPara)=>!!p.image||!!p.table;
const ops={
 addBelow:(ctl:EditCtl,scope:string,i:number)=>editList(ctl,scope,l=>{l.splice(i+1,0,{text:''});return l;},{index:i+1,part:'text',start:0}),
 heading:(ctl:EditCtl,scope:string,i:number)=>editList(ctl,scope,l=>{const p={...l[i]};if(p.heading!==undefined)delete p.heading;else p.heading='';l[i]=p;return l;},{index:i,part:p0(ctl,scope,i)?'text':'heading',start:0}),
 quote:(ctl:EditCtl,scope:string,i:number)=>editList(ctl,scope,l=>{const p={...l[i]};if(p.quote)delete p.quote;else p.quote=true;l[i]=p;return l;},{index:i,part:'text',start:0}),
 move:(ctl:EditCtl,scope:string,i:number,d:number)=>editList(ctl,scope,l=>{const j=i+d;if(j<0||j>=l.length)return null;[l[i],l[j]]=[l[j],l[i]];return l;},{index:i+d,part:'text',start:0}),
 remove:(ctl:EditCtl,scope:string,i:number)=>editList(ctl,scope,l=>l.length>1?l.filter((_,j)=>j!==i):null,{index:Math.max(0,i-1),part:'text',start:0}),
};
// Used by the heading toggle: true when the paragraph already has a heading (so the caret goes to its text afterwards).
function p0(ctl:EditCtl,scope:string,i:number){return listOf(ctl,scope)?.[i]?.heading!==undefined;}

let lastSel:Sel|null=null;
// Bold, italic or no formatting for the selection (or, with only a caret, the word it is in). Never execCommand: the draft is the truth, the block redraws from it.
function applyFormat(ctl:EditCtl,m:Mark|'clear'){
 const sel=readSel()||lastSel;if(!sel||!rich(sel.el))return;
 ctl.d.flush();
 const spans=spansFromDom(asN(sel.el)),text=spans.map(x=>x.text).join('');
 const[start,end]=sel.start===sel.end?wordAt(text,sel.start):snapToWords(text,sel.start,sel.end);
 if(end<=start)return;
 const next=m==='clear'?clearMarks(spans,start,end):toggleMark(spans,start,end,m);
 ctl.d.setCaret({scope:sel.scope,index:sel.index,part:sel.part,start,end});
 setPart(ctl,sel.scope,sel.index,sel.part,serializeInline(next),'step',[blockKey(sel.scope,sel.index,sel.part)]);
}
// Undo, redo and save redraw the blocks; the caret is put back where it was so typing and shortcuts carry on.
function keepCaret(ctl:EditCtl){
 const s=readSel()||(document.activeElement&&blockOf(document.activeElement)?{el:blockOf(document.activeElement)!,scope:'',index:0,part:'text' as Part,start:0,end:0}:null);
 if(!s||!s.scope)return;
 ctl.d.setCaret({scope:s.scope,index:s.index,part:s.part,start:s.start,end:s.end});
 window.setTimeout(()=>ctl.d.setCaret(null),1500);
}
const stepHistory=(ctl:EditCtl,dir:'undo'|'redo')=>{keepCaret(ctl);ctl.d[dir]();};
const siblingPart=(el:HTMLElement,part:string)=>el.closest('.ed-item')?.querySelector<HTMLElement>('[data-part="'+part+'"]')||null;

interface BlockProps{scope:string;index:number;part:Part;value:string;rev:number;tag:'p'|'h2'|'span';label:string;ph:string}
const EditBlock=memo(function EditBlock(p:BlockProps){
 const ctl=useContext(EditContext)!,ref=useRef<HTMLElement>(null),latest=useRef(p),pending=useRef(false),timer=useRef(0),unreg=useRef<(()=>void)|null>(null);
 latest.current=p;const isRich=p.part!=='heading'&&p.part!=='title';
 useLayoutEffect(()=>{
  const el=ref.current!;
  if(isRich)el.innerHTML=spansToHtml(parseInline(p.value));else el.textContent=p.value;
  const c=ctl.d.takeCaret(p.scope,p.index,p.part);
  if(c)requestAnimationFrame(()=>{el.focus();select(el,c.start,c.end??c.start);});
 },[p.rev]);  // eslint-disable-line react-hooks/exhaustive-deps -- drawn on a new rev only; typing never redraws
 const read=()=>{const el=ref.current!;return isRich?serializeInline(spansFromDom(asN(el))):plainFromDom(asN(el));};
 const commit=()=>{
  if(!pending.current)return;
  pending.current=false;clearTimeout(timer.current);unreg.current?.();unreg.current=null;
  const{scope,index,part}=latest.current;setPart(ctl,scope,index,part,read(),'typing');
 };
 const schedule=()=>{
  if(!pending.current){pending.current=true;unreg.current=ctl.d.onPending(commit);}
  clearTimeout(timer.current);timer.current=window.setTimeout(commit,400);
 };
 useEffect(()=>()=>commit(),[]);  // eslint-disable-line react-hooks/exhaustive-deps
 // Enter, Backspace and Delete change the shape of the list; everything else is the browser's.
 useEffect(()=>{
  const el=ref.current!;
  const onBefore=(e:InputEvent)=>{
   const t=e.inputType;
   if(e.isComposing)return;
   if(t==='insertParagraph'||t==='insertLineBreak'){e.preventDefault();enter();}  // phone keyboards send Enter this way
   else if(t==='formatBold'){e.preventDefault();applyFormat(ctl,'b');}
   else if(t==='formatItalic'){e.preventDefault();applyFormat(ctl,'i');}
   else if(t.startsWith('format')||t==='insertFromDrop'||t==='deleteByDrag')e.preventDefault();
   else if(t==='historyUndo'){e.preventDefault();stepHistory(ctl,'undo');}
   else if(t==='historyRedo'){e.preventDefault();stepHistory(ctl,'redo');}
  };
  el.addEventListener('beforeinput',onBefore);return()=>el.removeEventListener('beforeinput',onBefore);
 });
 function enter(){
  const{scope,index,part}=latest.current,el=ref.current!;
  if(part==='heading'){const t=siblingPart(el,'text');if(t){t.focus();select(t,0);}return;}
  if(part!=='text')return;
  ctl.d.flush();
  const list=listOf(ctl,scope);if(!list)return;
  const item=list[index],sel=readSel(),spans=spansFromDom(asN(el)),len=spans.reduce((n,x)=>n+x.text.length,0);
  const s=sel&&sel.el===el?sel.start:len,e=sel&&sel.el===el?sel.end:len;
  const before=splitSpans(spans,s)[0],cut=concatSpans(before,splitSpans(spans,e)[1]);
  const parts=splitPara({...item,text:serializeInline(cut)},before.reduce((n,x)=>n+x.text.length,0));
  if(!parts)return;
  editList(ctl,scope,l=>{l.splice(index,1,parts[0],parts[1]);return l;},{index:index+1,part:'text',start:0});
 }
 function key(e:React.KeyboardEvent<HTMLElement>){
  if(e.nativeEvent.isComposing||e.keyCode===229)return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;  // shortcuts belong to EditChrome
  const{scope,index,part}=latest.current,el=ref.current!;
  if(e.key==='Enter'){e.preventDefault();enter();return;}
  if(e.key!=='Backspace'&&e.key!=='Delete')return;
  const sel=readSel();if(!sel||sel.el!==el||sel.start!==sel.end)return;
  const len=plainFromDom(asN(el)).length,list=listOf(ctl,scope),item=list?.[index];
  if(e.key==='Backspace'&&sel.start===0&&list&&item){
   if(part==='heading'){
    e.preventDefault();
    if(!len)editList(ctl,scope,l=>{const q={...l[index]};delete q.heading;l[index]=q;return l;},{index,part:'text',start:0});
    return;
   }
   if(part!=='text')return;
   e.preventDefault();
   if(item.heading!==undefined){const h=siblingPart(el,'heading');if(h){h.focus();select(h,plainFromDom(asN(h)).length);}return;}
   const prev=list[index-1];if(!prev||fixed(prev)||fixed(item))return;
   ctl.d.flush();
   const merged=mergePara(listOf(ctl,scope)![index-1],{...listOf(ctl,scope)![index],text:read()});
   if(merged)editList(ctl,scope,l=>{l.splice(index-1,2,merged.para);return l;},{index:index-1,part:'text',start:merged.at});
  }else if(e.key==='Delete'&&part==='text'&&list&&item&&sel.start===len){
   const next=list[index+1];
   e.preventDefault();
   if(!next||fixed(next)||fixed(item)||next.heading!==undefined)return;
   ctl.d.flush();
   const merged=mergePara({...listOf(ctl,scope)![index],text:read()},listOf(ctl,scope)![index+1]);
   if(merged)editList(ctl,scope,l=>{l.splice(index,2,merged.para);return l;},{index,part:'text',start:merged.at});
  }
 }
 // Only plain text comes in, on one line: a paste never brings formatting, links or other blocks along.
 function paste(e:React.ClipboardEvent<HTMLElement>){
  e.preventDefault();
  const text=e.clipboardData.getData('text/plain').replace(/\s+/g,' ');if(!text)return;
  const el=ref.current!,s=getSelection();if(!s||!s.rangeCount)return;
  const r=s.getRangeAt(0);if(!el.contains(r.commonAncestorContainer))return;
  r.deleteContents();const t=document.createTextNode(text);r.insertNode(t);r.setStartAfter(t);r.collapse(true);s.removeAllRanges();s.addRange(r);
  schedule();
 }
 const Tag=p.tag as 'p';
 return <Tag ref={ref as React.RefObject<HTMLParagraphElement>} className={'ed-edit ed-'+p.part} data-edit-block="" data-scope={p.scope} data-index={p.index} data-part={p.part} data-ph={p.ph}
  contentEditable suppressContentEditableWarning spellCheck={!['fa','ar'].includes(ctl.lang)} dir="auto" role="textbox" aria-multiline={p.part==='text'||undefined} aria-label={p.label}
  onInput={schedule} onBlur={commit} onKeyDown={key} onPaste={paste} onDrop={e=>e.preventDefault()}/>;
});

// A list of paragraphs (chapter text, a review, the overview, a study-guide section) or the takeaways.
export function EditList({scope,fixed:drawFixed}:{scope:string;fixed:(i:number,caption?:ReactNode)=>ReactNode}){
 const ctl=useContext(EditContext)!,{d,L,lang}=ctl;
 const list=(d.value(scope) as PubPara[])||[],saved=(ctl.saved(scope) as PubPara[])||[];
 const was=useMemo(()=>new Set(saved.map(x=>JSON.stringify(x))),[saved]);
 const[menu,setMenu]=useState<{el:HTMLElement;i:number}|null>(null);
 const list0=scope==='ov:t',base=scope+':'+d.epoch+':'+d.rev(scope);
 const block=(i:number,part:Part,tag:BlockProps['tag'],value:string,label:string,ph:string)=><EditBlock key={part} scope={scope} index={i} part={part} tag={tag} value={value} rev={d.rev(blockKey(scope,i,part))} label={label} ph={ph}/>;
 const items=list.map((x,i)=>{
  const changed=!was.has(JSON.stringify(x)),name=L(list0?'Takeaway':'Paragraph')+' '+num(lang,i+1);
  const heading=x.heading!==undefined&&!list0?block(i,'heading','h2',x.heading,L('Heading')+' '+num(lang,i+1),L('Heading')):null;
  let body:ReactNode;
  if(x.image)body=drawFixed(i,block(i,'caption','span',x.text,L('Caption')+' '+num(lang,i+1),L('Caption')));
  else if(x.table)body=<>{drawFixed(i)}<p className="ed-hint">{L('Tables are edited in the book editor.')}</p></>;
  else if(list0)body=block(i,'text','span',x.text,name,L('Takeaway'));
  else if(x.quote)body=<blockquote className="r2-quote" dir="auto">{heading}{block(i,'text','p',x.text,name,L('Paragraph'))}</blockquote>;
  else body=<div className="r2-p">{heading}{block(i,'text','p',x.text,name,L('Paragraph'))}</div>;
  const handle=<IconButton className="ed-handle" size="small" aria-label={L('Block options')+' '+num(lang,i+1)} aria-haspopup="menu" onMouseDown={e=>e.preventDefault()} onClick={e=>setMenu({el:e.currentTarget,i})}><MoreVertRounded fontSize="inherit"/></IconButton>;
  const cls='ed-item'+(changed?' ed-changed':'');
  return list0?<li className={cls} key={base+':'+i}>{handle}{body}</li>:<div className={cls} key={base+':'+i}>{handle}{body}</div>;
 });
 const at=menu?list[menu.i]:undefined,i=menu?.i??0,close=()=>setMenu(null);
 const run=(f:()=>void)=>()=>{close();f();};
 return <>
  {list0?<ul className="ed-ul">{items}</ul>:items}
  <Menu anchorEl={menu?.el} open={!!menu&&!!at} onClose={close} slotProps={{paper:{dir:ctl.rtl?'rtl':'ltr'}}}>
   <MenuItem onClick={run(()=>ops.addBelow(ctl,scope,i))}><ListItemIcon><AddRounded fontSize="small"/></ListItemIcon>{L('Add paragraph below')}</MenuItem>
   {at&&!list0&&!fixed(at)&&<MenuItem onClick={run(()=>ops.heading(ctl,scope,i))}><ListItemIcon><TitleRounded fontSize="small"/></ListItemIcon>{L(at.heading!==undefined?'Remove heading':'Add heading')}</MenuItem>}
   {at&&!list0&&!fixed(at)&&<MenuItem onClick={run(()=>ops.quote(ctl,scope,i))}><ListItemIcon><FormatQuoteRounded fontSize="small"/></ListItemIcon>{L(at.quote?'Make paragraph':'Make quote')}</MenuItem>}
   <Divider/>
   <MenuItem disabled={i===0} onClick={run(()=>ops.move(ctl,scope,i,-1))}><ListItemIcon><ArrowUpwardRounded fontSize="small"/></ListItemIcon>{L('Move up')}</MenuItem>
   <MenuItem disabled={i>=list.length-1} onClick={run(()=>ops.move(ctl,scope,i,1))}><ListItemIcon><ArrowDownwardRounded fontSize="small"/></ListItemIcon>{L('Move down')}</MenuItem>
   <MenuItem disabled={list.length<2} onClick={run(()=>ops.remove(ctl,scope,i))}><ListItemIcon><DeleteOutlineRounded fontSize="small"/></ListItemIcon>{L('Delete paragraph')}</MenuItem>
  </Menu>
 </>;
}
// A title (a chapter's, or a study-guide section's): plain text on one line.
export function EditText({scope}:{scope:string}){
 const ctl=useContext(EditContext)!,{d,L}=ctl;
 return <EditBlock key={scope+':'+d.epoch} scope={scope} index={0} part="title" tag="span" value={d.value(scope) as string} rev={d.rev(blockKey(scope,0,'title'))} label={L('Chapter title')} ph={L('Title')}/>;
}

export interface BarProps{L:(t:string)=>string;label:string;status:string;more:string;tone:'idle'|'dirty'|'busy'|'ok'|'warn';canUndo:boolean;canRedo:boolean;saving:boolean;dirty:boolean;note:string;onUndo:()=>void;onRedo:()=>void;onDiscard:()=>void;onSave:()=>void;onDone:()=>void}
// Sticks to the top of the page column on a desktop and to the bottom (above the keyboard) on a phone.
export function EditBar(p:BarProps){
 const{L}=p,ctl=useContext(EditContext),keep=(e:React.MouseEvent)=>e.preventDefault();
 const step=(dir:'undo'|'redo')=>ctl?stepHistory(ctl,dir):(dir==='undo'?p.onUndo():p.onRedo());
 const save=()=>{if(ctl)keepCaret(ctl);p.onSave();};
 return <div className="ed-bar" role="region" aria-label={L('Editing')}>
  <div className="ed-bar-main"><strong>{p.label}</strong><span className={'ed-status '+p.tone} role="status" aria-live="polite">{p.status}<span className="ed-more">{p.more}</span></span></div>
  <div className="ed-bar-actions">
   <Tooltip title={L('Undo')+' ('+(isMac?'⌘':'Ctrl+')+'Z)'}><span><IconButton size="small" disabled={!p.canUndo} aria-label={L('Undo')} onMouseDown={keep} onClick={()=>step('undo')}><UndoRounded/></IconButton></span></Tooltip>
   <Tooltip title={L('Redo')}><span><IconButton size="small" disabled={!p.canRedo} aria-label={L('Redo')} onMouseDown={keep} onClick={()=>step('redo')}><RedoRounded/></IconButton></span></Tooltip>
   <Tooltip title={L('Discard changes')}><span className="ed-discard"><IconButton size="small" disabled={!p.dirty||p.saving} aria-label={L('Discard changes')} onMouseDown={keep} onClick={p.onDiscard}><DeleteSweepOutlined/></IconButton></span></Tooltip>
   <Button variant="contained" size="small" disableElevation disabled={!p.dirty||p.saving} onMouseDown={keep} onClick={save}>{L('Save')}</Button>
   <Button size="small" aria-label={L('Done')} startIcon={<CheckRounded/>} disabled={p.saving} onClick={p.onDone}><span className="ed-done-label">{L('Done')}</span></Button>
  </div>
  {p.note&&<p className="ed-help">{p.note}</p>}
 </div>;
}
export function RestoreBanner({L,text,onRestore,onDiscard}:{L:(t:string)=>string;text:string;onRestore:()=>void;onDiscard:()=>void}){
 return <div className="ed-restore" role="status"><span>{text}</span><span className="ed-restore-actions"><Button size="small" variant="contained" disableElevation onClick={onRestore}>{L('Restore')}</Button><Button size="small" onClick={onDiscard}>{L('Discard')}</Button></span></div>;
}

// The selection toolbar, the keyboard shortcuts, and keeping both above a phone's keyboard.
export function EditChrome({ctl}:{ctl:EditCtl}){
 const{L}=ctl,phone=useMediaQuery('(max-width:699px)');
 const[st,setSt]=useState<{b:boolean;i:boolean;rect:{top:number;left:number;width:number;height:number}}|null>(null),[tick,setTick]=useState(0);
 const hide=useRef(0),shut=useRef(false),popper=useRef<{update:()=>void}|null>(null),live=useRef(ctl);live.current=ctl;
 useEffect(()=>{
  const on=()=>{
   const s=readSel();
   if(!s||s.start===s.end||!rich(s.el)){clearTimeout(hide.current);hide.current=window.setTimeout(()=>setSt(null),200);return;}  // a short grace: a tap on the toolbar collapses the selection first
   clearTimeout(hide.current);shut.current=false;lastSel=s;
   const spans=spansFromDom(asN(s.el)),text=spans.map(x=>x.text).join(''),[a,z]=snapToWords(text,s.start,s.end);
   const r=getSelection()!.getRangeAt(0).getBoundingClientRect();
   setSt({b:hasMark(spans,a,z,'b'),i:hasMark(spans,a,z,'i'),rect:{top:r.top,left:r.left,width:r.width,height:r.height}});
  };
  document.addEventListener('selectionchange',on);return()=>{document.removeEventListener('selectionchange',on);clearTimeout(hide.current);};
 },[]);
 useEffect(()=>{
  const move=()=>popper.current?.update();
  window.addEventListener('scroll',move,true);window.addEventListener('resize',move);return()=>{window.removeEventListener('scroll',move,true);window.removeEventListener('resize',move);};
 },[]);
 // Shortcuts work only while focus is in the editor (a block, the bar or the toolbar). Mod is ⌘ on a Mac and Ctrl elsewhere.
 // They go by physical key (e.code) so they also work on a Persian keyboard layout.
 useEffect(()=>{
  const h=(e:KeyboardEvent)=>{
   const t=e.target as HTMLElement|null;
   if(!t||!(t.closest?.('[data-edit-block],.ed-bar,.ed-tools')))return;
   if(e.isComposing||e.keyCode===229)return;
   const c=live.current,mod=isMac?e.metaKey:e.ctrlKey;
   if(e.key==='Escape'){
    if(st&&!shut.current){shut.current=true;setSt(null);}else c.done();
    e.preventDefault();return;
   }
   if(e.altKey)return;
   if(mod&&!e.shiftKey&&e.code==='KeyB'){e.preventDefault();applyFormat(c,'b');}
   else if(mod&&!e.shiftKey&&e.code==='KeyI'){e.preventDefault();applyFormat(c,'i');}
   else if(mod&&e.code==='KeyZ'){e.preventDefault();stepHistory(c,e.shiftKey?'redo':'undo');}
   else if(e.ctrlKey&&!isMac&&e.code==='KeyY'){e.preventDefault();stepHistory(c,'redo');}
   else if(mod&&e.code==='KeyS'){e.preventDefault();keepCaret(c);c.save();}
  };
  window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
 },[st]);
 // On a phone the bar and the toolbar ride above the keyboard: visualViewport says how much of the screen it covers; the toolbar sits on top of the bar, whatever its height.
 useEffect(()=>{
  const vv=window.visualViewport,root=document.documentElement,bar=document.querySelector<HTMLElement>('.ed-bar');
  const set=()=>{const kb=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;root.style.setProperty('--ed-kb',Math.round(kb)+'px');root.style.setProperty('--ed-bar-h',(bar?Math.round(bar.getBoundingClientRect().height):57)+'px');};
  set();vv?.addEventListener('resize',set);vv?.addEventListener('scroll',set);window.addEventListener('resize',set);
  const ro=bar&&typeof ResizeObserver!=='undefined'?new ResizeObserver(set):null;if(bar)ro?.observe(bar);
  return()=>{vv?.removeEventListener('resize',set);vv?.removeEventListener('scroll',set);window.removeEventListener('resize',set);ro?.disconnect();root.style.removeProperty('--ed-kb');root.style.removeProperty('--ed-bar-h');};
 },[]);
 void tick;
 const sel=lastSel,item=sel&&st?listOf(ctl,sel.scope)?.[sel.index]:undefined;
 const btn=(label:string,icon:ReactNode,on:()=>void,pressed?:boolean,disabled?:boolean,tip?:string)=><button type="button" className={'ed-tool'+(pressed?' on':'')} aria-label={label} title={tip||label} aria-pressed={pressed} disabled={disabled} onClick={()=>{on();setTick(x=>x+1);}}>{icon}</button>;
 const mod=isMac?'⌘':'Ctrl+';
 const bar=<div role="toolbar" aria-label={L('Text formatting')} className={'ed-tools'+(phone?' docked':'')} dir="ltr" onMouseDown={e=>e.preventDefault()} onPointerDown={e=>e.preventDefault()}>
  {btn(L('Bold'),<FormatBoldRounded/>,()=>applyFormat(ctl,'b'),st?.b,false,L('Bold')+' ('+mod+'B)')}
  {btn(L('Italic'),<FormatItalicRounded/>,()=>applyFormat(ctl,'i'),st?.i,false,L('Italic')+' ('+mod+'I)')}
  {btn(L('Clear formatting'),<FormatClearRounded/>,()=>applyFormat(ctl,'clear'))}
  <span className="sep"/>
  {sel&&item&&!fixed(item)&&sel.scope!=='ov:t'&&<>
   {btn(L('Heading'),<TitleRounded/>,()=>ops.heading(ctl,sel.scope,sel.index),item.heading!==undefined)}
   {btn(L('Quote'),<FormatQuoteRounded/>,()=>ops.quote(ctl,sel.scope,sel.index),!!item.quote)}
   <span className="sep"/></>}
  {btn(L('Undo'),<UndoRounded/>,()=>stepHistory(ctl,'undo'),undefined,!ctl.d.canUndo)}
  {btn(L('Redo'),<RedoRounded/>,()=>stepHistory(ctl,'redo'),undefined,!ctl.d.canRedo)}
 </div>;
 if(!st)return null;
 if(phone)return bar;
 const anchor={getBoundingClientRect:()=>{const s=getSelection();const r=s&&s.rangeCount&&!s.isCollapsed?s.getRangeAt(0).getBoundingClientRect():null;return(r&&(r.width||r.height)?r:st.rect) as DOMRect;}};
 return <Popper open anchorEl={anchor} placement="top" popperRef={popper as never} style={{zIndex:1400}} modifiers={[{name:'offset',options:{offset:[0,10]}},{name:'preventOverflow',options:{padding:8}},{name:'flip',options:{fallbackPlacements:['bottom']}}]}><Paper elevation={6} className="ed-tools-paper">{bar}</Paper></Popper>;
}
