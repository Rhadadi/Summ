import{frameVars}from'./frame.ts';
import{lazy,Suspense,useEffect,useMemo,useRef,useState,type ReactNode}from'react';
import{isShortcut,shortcutLabel}from'./ai-settings';
const ChatPanel=lazy(()=>import('./ChatPanel'));
import AiLaunch from'./AiLaunch';
import{sized,srcSet}from'./img';
import{Alert,Button,CircularProgress,Divider,Drawer,IconButton,LinearProgress,ListItemIcon,Menu,MenuItem,Popover,Switch,TextField,useMediaQuery}from'@mui/material';
import{ChevronLeftRounded,ChevronRightRounded,CloseRounded,ArrowBackIosNewRounded,AutoAwesomeRounded,BookmarkBorderRounded,BookmarkRounded,ExpandMoreRounded,FormatListBulletedRounded,PlayArrowRounded,TextFieldsRounded,TuneRounded,EditOutlined,VisibilityOutlined,EditNoteRounded,MoreHorizRounded,GraphicEqRounded,WallpaperRounded,CenterFocusStrongRounded,DarkModeOutlined,LightModeOutlined,ContrastRounded,HeadphonesRounded,ScheduleRounded,AutoAwesomeRounded as SparkRounded}from'@mui/icons-material';
import StudyTools from'./StudyTools';
import{pullQuote,readingMinutes,starts}from'./study';
import{displayPainting}from'./persian-display';
import{Lockup}from'./Shell';
import Inline from'./InlineText';
import FontChooser from'./FontChooser';
import{enFonts,faFonts,lastPlace,readingStyle,savePlace,useReading,type Reading}from'./reading';
import type{Account,Block,Book,Chapter,Depth,SavedPassage,Settings,Summary,SummaryParagraph}from'./types';
import{bodyChapter,bookWords,depthLabels,isHeading,languages,sectionKind}from'./core';
import{costRange,estimateChapter,money,usageCost}from'./cost';
import type{Price}from'./cost';
import{num,rtl as isRtl,tr}from'./i18n';
import{chapterTitle,mainChapters,strip,type BookData}from'./bookData';
import type{Backdrop}from'./MuseumHero';

interface Props{
 book:Book;chapter:Chapter;section:string;settings:Settings;account:Account|null;price:Price|null;saved:SavedPassage[];data:BookData;
 summary:Summary|null;generating:boolean;generationError:string;
 onPreferences:(patch:Partial<Settings>)=>void;onGenerate:()=>void;onCancel:()=>void;onBookmark:(block:Block,wording:string,chapter:Chapter)=>void;onEvidence:(block:Block,wording:string,chapter:Chapter)=>void;
 onChoose:(index:number)=>void;onSection:(section:string)=>void;onBack:()=>void;onHome:()=>void;onListen:(chapterId?:string,at?:number)=>void;onCreate:()=>void;cover?:string;
 readOnly?:boolean;backdrop?:Backdrop;
 // Editors see these in the site bar: where they read is where they switch views.
 // onEdit opens the book editor; editing/onEditing switch the inline editing of this page on and off.
 owner?:{asVisitor:boolean;onToggle:()=>void;onEdit?:()=>void;onAudio?:()=>void;onBackground?:()=>void;editing?:boolean;onEditing?:()=>void};
 // Inline editing (owners): editSlot(scope) returns the editor for a piece of text, or null to show it as usual; fixed(i) draws a figure or table the editor leaves alone.
 editSlot?:(scope:string,fixed:(i:number,caption?:ReactNode)=>ReactNode)=>ReactNode|null;editBar?:ReactNode;
 // Listen shows only where there is audio: null asks about the overview.
 canListen?:(chapterId:string|null)=>boolean;
 // Minutes of audio for a chapter, when known: the opening says "Listen · 6 min" and each section can play from its start.
 listenMinutes?:(chapterId:string)=>number|null;
 // The published book, for notes in the notebook (study tools show only when it is given).
 notebook?:{id:string;slug:string;title:string};
}
const rtl=(lang?:string)=>lang&&['fa','ar'].includes(lang)?'rtl':'ltr';
export default function ReaderPage(p:Props){
 const{book,chapter,section,settings,data,account}=p;
 const[guideOpen,setGuideOpen]=useState(false);
 const[zoom,setZoom]=useState<{src:string;alt:string}|null>(null);
 const[view,setView]=useState<'summary'|'original'>('summary'),[list,setList]=useState(false),[more,setMore]=useState(false);
 const[opts,setOpts]=useState<HTMLElement|null>(null),[depthMenu,setDepthMenu]=useState<HTMLElement|null>(null);
 const top=useRef<HTMLDivElement>(null),[ownerMenu,setOwnerMenu]=useState<HTMLElement|null>(null);
 const[reading,setReading]=useReading(),[look,setLook]=useState<HTMLElement|null>(null),phone=useMediaQuery('(max-width:699px)');
 // Reopening a chapter returns to where the reader stopped; moving on starts at the top.
 useEffect(()=>{
  const place=!section?lastPlace(book.id):null;
  const y=place&&place.chapterId===chapter.id?place.y:0;
  const t=setTimeout(()=>window.scrollTo({top:y}),60);
  if(!section)savePlace(book.id,chapter.id,y);
  let pending=0;
  const keep=()=>{if(section)return;clearTimeout(pending);pending=window.setTimeout(()=>savePlace(book.id,chapter.id,window.scrollY),400);};
  window.addEventListener('scroll',keep,{passive:true});
  return()=>{clearTimeout(t);clearTimeout(pending);window.removeEventListener('scroll',keep);};
 },[book.id,chapter.id,section]);
 const main=mainChapters(book),kinds=book.chapters.map((c,i)=>sectionKind(c,i,book.chapters));
 const report=data.report;
 const lang=data.version?.language||report?.language||Object.values(data.summaries)[0]?.language||settings.language,L=(t:string)=>tr(lang,t);

 const guideItems=[...(report?.overview?[{id:'overview',label:L('Overview and key takeaways')}]:[]),...(report?.guide?.sections||[]).map(s=>({id:'g:'+s.kind,label:L(s.title)}))];
 const isChapter=!section;
 const summary=isChapter?(p.summary||data.summaries[chapter.id]||null):null;
 const index=main.indexOf(chapter);
 const kept=(b:Block)=>p.saved.some(s=>s.bookId===book.id&&s.blockId===b.id);
 const estimate=p.price?costRange(estimateChapter(chapter,settings),p.price).likely:null;
 const spent=usageCost(summary?.usage,p.price);
 const aiLabel=!account?'Log in to summarize':!account.key?'Add your Gemini key':summary?'Summarize again':'Summarize this chapter';
 function choose(c:Chapter){setList(false);p.onChoose(book.chapters.indexOf(c));}
 // Pictures that came with an imported summary live in this browser; each gets a temporary address while the page is open.
 const pictures=useMemo(()=>Object.fromEntries((data.version?.images||[]).map(i=>[i.path,URL.createObjectURL(new Blob([i.data],{type:i.type}))])),[data.version]);
 useEffect(()=>()=>{for(const u of Object.values(pictures))URL.revokeObjectURL(u);},[pictures]);
 // Neighbouring pages become one chip ("pp. 16–24") so a long passage does not trail a row of numbers.
 function refs(x:SummaryParagraph,c?:Chapter){
  if(p.readOnly&&c)return null;
  if(!c)return <span className="refs">{x.evidence_ids.map(id=>{const ch=book.chapters.find(y=>y.id===id);return ch?<button key={id} onClick={()=>choose(ch)}>{strip(ch.title).slice(0,40)}</button>:null;})}</span>;
  const found=[...new Map([...x.evidence_ids.map(id=>c.blocks.find(b=>b.id===id)),...(x.pages||[]).map(n=>c.blocks.find(y=>y.page===n&&!y.note))].filter((b):b is Block=>!!b).map(b=>[b.page??b.id,b])).values()].sort((a,b)=>(a.page??1e9)-(b.page??1e9));
  const groups:Block[][]=[];for(const b of found){const g=groups[groups.length-1];if(g&&b.page&&g[g.length-1].page&&b.page-g[g.length-1].page!<=1)g.push(b);else groups.push([b]);}
  const shown=(x.pages||[]).filter(n=>!found.some(b=>b.page===n));
  return <span className="refs">{groups.map(g=>{const a=g[0].page,z=g[g.length-1].page,label=!a?'¶':a===z?'p. '+a:'pp. '+a+'–'+z;return p.readOnly?<span className="pg-chip" key={g[0].id}>{label}</span>:<button key={g[0].id} onClick={()=>p.onEvidence(g[0],g[0].text,c)}>{label}</button>;})}{shown.map(n=><span className="pg-chip" key={'p'+n}>p. {n}</span>)}</span>;
 }
 const listenable=!!summary&&!!p.readOnly&&(p.canListen?.(chapter.id)??false),mins=listenable?p.listenMinutes?.(chapter.id)??null:null;
 const startAt=useMemo(()=>summary?new Map(summary.paragraphs.map((x,i)=>[x,starts(summary.paragraphs)[i]])):new Map<SummaryParagraph,number>(),[summary]);
 const headed=!!summary?.paragraphs.some(x=>x.heading);
 const paraPlay=(x:SummaryParagraph)=>!headed&&mins&&startAt.has(x)&&!x.image&&!x.table?<button className="para-play" aria-label={L('Listen from here')} title={L('Listen from here')} onClick={()=>p.onListen(chapter.id,startAt.get(x))}><PlayArrowRounded/></button>:null;
 const sectionPlay=(x:SummaryParagraph)=>mins&&startAt.has(x)?<button className="sec-play" aria-label={L('Listen from here')} title={L('Listen from here')} onClick={()=>p.onListen(chapter.id,startAt.get(x))}><PlayArrowRounded/></button>:null;
 function block(x:SummaryParagraph,i:number,c?:Chapter,caption?:ReactNode){
  return x.image&&(pictures[x.image.path]||x.image.path.startsWith('/api/'))?<figure className="r2-fig" key={i}><button className="r2-zoom" aria-label={L('Enlarge')+': '+(x.image.alt||x.text)} onClick={()=>setZoom({src:pictures[x.image!.path]||x.image!.path,alt:x.image!.alt||x.text})}><img src={pictures[x.image.path]||sized(x.image.path,1280)} srcSet={pictures[x.image.path]?undefined:srcSet(x.image.path)} sizes="(max-width:800px) 100vw, 760px" alt={x.image.alt} loading="lazy"/></button><figcaption dir="auto">{caption??<Inline text={x.text}/>}</figcaption></figure>
   :x.quote?<blockquote className="r2-quote" key={i} dir="auto">{x.heading&&<h2>{x.heading}</h2>}<Inline text={x.text}/>{refs(x,c)}</blockquote>
   :x.table?<div className="r2-p r2-table" key={i}>{x.heading&&<h2 dir="auto">{x.heading}</h2>}<div className="r2-scroll"><table><thead><tr>{x.table[0].map((h,j)=><th key={j} dir="auto">{h}</th>)}</tr></thead><tbody>{x.table.slice(1).map((r,j)=><tr key={j}>{r.map((v,k)=><td key={k} dir="auto">{v}</td>)}</tr>)}</tbody></table></div></div>
   :<div className="r2-p" key={i}>{paraPlay(x)}{x.heading&&<h2 dir="auto">{x.heading}{sectionPlay(x)}</h2>}<p dir="auto"><Inline text={x.text}/>{refs(x,c)}</p></div>;
 }
 // scope names the list for the inline editor (see inline-draft.ts); without one, or when the editor is off, the list reads as always.
 function paragraphs(items:SummaryParagraph[],c?:Chapter,scope?:string){
  return(scope&&p.editSlot?.(scope,(i,cap)=>block(items[i],i,c,cap)))||items.map((x,i)=>block(x,i,c));
 }
 // Original text reads as a book page: headings, flowing paragraphs, page numbers in the margin, notes at the end.
 function original(c:Chapter){
  let page:number|undefined;const notes=c.blocks.filter(b=>b.note);
  const words=(t:string)=>new Set(t.toLowerCase().match(/\p{L}{3,}/gu)||[]);const titleWords=words(c.title);
  const body=c.blocks.filter(b=>!b.note);
  const first=body[0]&&body[0].text.length<300&&[...words(body[0].text)].filter(w=>titleWords.has(w)).length>=Math.min(4,titleWords.size*.7)?1:0;
  return <>{body.slice(first).map(b=>{
   const marker=b.page!==page?b.page:undefined;page=b.page;
   if(isHeading(b.text))return <h2 key={b.id} className="text-h" dir="auto">{b.text}</h2>;
   return <div className="text-p" key={b.id}>{marker&&<button className="folio" onClick={()=>p.onEvidence(b,b.text,c)} aria-label={L('Page')+' '+num(lang,marker)}>{num(lang,marker)}</button>}<p dir="auto">{b.text}</p><IconButton className="keep" size="small" aria-label={L(kept(b)?'Unsave passage':'Save passage')} onClick={()=>p.onBookmark(b,b.text,c)}>{kept(b)?<BookmarkRounded fontSize="inherit"/>:<BookmarkBorderRounded fontSize="inherit"/>}</IconButton></div>;
  })}{notes.length>0&&<details className="notes"><summary>{L('Notes')} ({num(lang,notes.length)})</summary>{notes.map(b=><p key={b.id} dir="auto"><button className="folio-inline" onClick={()=>p.onEvidence(b,b.text,c)}>{L('Page')} {num(lang,b.page||0)}</button> {b.text}</p>)}</details>}</>;
 }
 const row=(c:Chapter)=>{const n=main.includes(c)?main.indexOf(c)+1:Number(c.title.match(/^(\d+)[.\s]/)?.[1]||0);const on=isChapter&&c.id===chapter.id;
  return <button key={c.id} className={'r2-row'+(on?' on':'')+(data.summaries[c.id]||p.readOnly?'':' empty')} aria-current={on?'true':undefined} onClick={()=>choose(c)}><span className="n">{n?num(lang,n):''}</span><span className="t" dir="auto">{chapterTitle(data,c)}</span></button>;};
 // Front and back matter nobody summarized stays out of the way until asked for.
 const ofKind=(k:string)=>book.chapters.filter((_,i)=>kinds[i]===k),shown=(c:Chapter)=>more||!!data.summaries[c.id]||c.id===chapter.id;
 const front=ofKind('front').filter(shown),back=ofKind('back').filter(shown),hidden=[...ofKind('front'),...ofKind('back')].filter(c=>!data.summaries[c.id]&&c.id!==chapter.id).length;
 const panel=<nav className="r2-list" aria-label={L('Contents')}>
  <button className="r2-brand" aria-label="Inkling" onClick={p.onHome}><Lockup/></button>
  <button className="r2-bookline" onClick={p.onBack}>{p.cover?<img src={sized(p.cover,320)} alt=""/>:<span className="r2-nocover"/>}<span><small>{L('Back to the book')}</small><strong dir="auto">{(data.version?.bookTitle||book.title).split(':')[0]}</strong></span></button>
  {front.length>0&&<><p className="r2-head">{lang==='fa'?'پیش از فصل‌ها':'Before the chapters'}</p>{front.map(row)}</>}
  <p className="r2-head">{L('Chapters')}</p>
  {main.map(row)}
  {guideItems.length>0&&<><button className="r2-head r2-fold" aria-expanded={guideOpen||guideItems.some(x=>x.id===section)} onClick={()=>setGuideOpen(o=>!o)}>{L('Study guide')}<ExpandMoreRounded/></button>{(guideOpen||guideItems.some(x=>x.id===section))&&guideItems.map(g=><button key={g.id} className={'r2-row'+(section===g.id?' on':'')} onClick={()=>{setList(false);p.onSection(g.id);}}><span className="n"/><span className="t" dir="auto">{g.label}</span></button>)}</>}
  {back.length>0&&<div className="r2-back-list">{back.map(row)}</div>}
  {hidden>0&&<button className="more-toggle" aria-expanded={more} onClick={()=>setMore(!more)}>{L(more?'Hide':'Show')} {L('front matter, notes and index')}</button>}
 </nav>;
 const guideSection=section.startsWith('g:')?report?.guide?.sections.find(s=>'g:'+s.kind===section):undefined,guideAt=guideSection?report!.guide!.sections.indexOf(guideSection):-1;
 const seq=main.includes(chapter)?main:book.chapters,next=seq[seq.indexOf(chapter)+1],prev=seq[seq.indexOf(chapter)-1];
 const curated=p.readOnly&&!!p.backdrop;
 const nextTheme=reading.theme==='night'?'paper':reading.theme==='sepia'?'night':'sepia';
 const quoteLine=summary?pullQuote(summary.paragraphs):null,readMins=summary?readingMinutes(summary.paragraphs,lang):0;
 // ---- the study companion (published books): ⌘K on a Mac, Ctrl+K on Windows; selected text becomes the question's subject
 const companionItems=section==='overview'&&report?.overview?report.overview.paragraphs:summary?.paragraphs;
 const canAsk=!!p.readOnly&&!!companionItems?.length&&!p.editSlot;
 const[chat,setChat]=useState<{open:boolean;quote?:string;n:number;loaded:boolean}>({open:false,n:0,loaded:false});
 // ⌘K / Ctrl K (or the bubble) brings the passage the reader has selected, or copied a moment ago, into the question.
 // A tap on a phone clears the selection before the click arrives, so the last selection is remembered for a few seconds.
 const copied=useRef<{text:string;at:number}|null>(null),lastSel=useRef<{text:string;at:number}|null>(null),[armed,setArmed]=useState(false);
 const picked=()=>{const sel=window.getSelection?.();if(!sel||sel.isCollapsed)return'';if(sel.anchorNode?.parentElement?.closest('.ai-panel,input,textarea'))return'';return sel.toString().replace(/\s+/g,' ').trim();};
 useEffect(()=>{
  if(!canAsk)return;
  let t=0;
  const copy=()=>{const x=picked();if(x)copied.current={text:x,at:Date.now()};};
  const change=()=>{const x=picked();if(x){lastSel.current={text:x,at:Date.now()};clearTimeout(t);setArmed(true);}else{clearTimeout(t);t=window.setTimeout(()=>setArmed(false),400);if(lastSel.current)lastSel.current.at=Date.now();}};
  document.addEventListener('copy',copy);document.addEventListener('selectionchange',change);
  return()=>{document.removeEventListener('copy',copy);document.removeEventListener('selectionchange',change);clearTimeout(t);};
 },[canAsk]);
 const grab=()=>{
  const now=Date.now();
  let t=picked();
  if(!t&&lastSel.current&&now-lastSel.current.at<4000)t=lastSel.current.text;
  if(!t&&copied.current&&now-copied.current.at<10*60e3)t=copied.current.text;
  copied.current=null;lastSel.current=null;setArmed(false);
  return t.length>1200?t.slice(0,1200)+'…':t;
 };
 const openChat=()=>{const q=grab();setChat(c=>({open:true,loaded:true,quote:q||undefined,n:c.n+1}));};
 useEffect(()=>{
  if(!canAsk)return;
  const key=(e:KeyboardEvent)=>{if(!isShortcut(e))return;e.preventDefault();const q=grab();if(chat.open&&!q)setChat(c=>({...c,open:false}));else setChat(c=>({open:true,loaded:true,quote:q||undefined,n:c.n+1}));};
 window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 });
 return <div className={'r2 look-'+reading.theme+(reading.zen?' zen':'')+(curated?' curated-reader':'')+(p.editSlot?' editing':'')} lang={lang} dir={isRtl(lang)?'rtl':'ltr'} style={readingStyle(reading)}>
  {reading.zen&&<button className="zen-exit" aria-label={L('Leave zen mode')} onClick={()=>setReading({zen:false})}><CloseRounded/></button>}
  {curated&&<header className="curated-reader-sitebar"><button className="curated-site-brand" aria-label="Inkling" onClick={p.onHome}><Lockup/></button><nav aria-label={L('Main')}><button onClick={p.onBack}>{L('Back to the book')}</button></nav>{p.owner&&<span className="curated-site-owner">{p.owner.asVisitor?<button onClick={p.owner.onToggle}><EditNoteRounded/><span>{L('Back to editing')}</span></button>:<>{p.owner.onEditing&&<button className={'ed-pill'+(p.owner.editing?' on':'')} aria-pressed={!!p.owner.editing} onClick={p.owner.onEditing}><EditOutlined/><span>{L(p.owner.editing?'Editing':'Edit this page')}</span></button>}<IconButton className="curated-site-more" aria-label={L('More')} aria-haspopup="menu" onClick={e=>setOwnerMenu(e.currentTarget)}><MoreHorizRounded/></IconButton></>}</span>}<span className="curated-site-grow"/>{canAsk&&<button className="ai-bar-btn" onPointerDown={e=>e.preventDefault()} aria-label={L('Ask AI')+' ('+shortcutLabel()+')'} title={L('Ask AI about this chapter')+' · '+shortcutLabel()} onClick={openChat}><SparkRounded/><span>{L('Ask AI')}</span><kbd dir="ltr">{shortcutLabel()}</kbd></button>}<IconButton className="curated-site-tool" aria-label={L('Focus mode')} title={L('Focus mode')} onClick={()=>setReading({zen:true})}><CenterFocusStrongRounded/></IconButton><IconButton className="curated-site-tool" aria-label={L('Page colour')+': '+L(nextTheme)} title={L('Page colour')+': '+L(nextTheme)} onClick={()=>setReading({theme:nextTheme})}>{reading.theme==='night'?<LightModeOutlined/>:reading.theme==='sepia'?<DarkModeOutlined/>:<ContrastRounded/>}</IconButton><IconButton className="curated-site-contents" aria-label={L('Contents')} onClick={()=>setList(true)}><FormatListBulletedRounded/></IconButton><IconButton className="curated-site-aa" aria-label={L('Reading settings')} onClick={e=>setLook(e.currentTarget)}><TextFieldsRounded/></IconButton></header>}
  <aside className="r2-side">{panel}</aside>
  <Drawer open={list} onClose={()=>setList(false)} slotProps={{paper:{className:'r2-drawer'}}}>{panel}</Drawer>
  <article id="main-content" tabIndex={-1} className="r2-main" ref={top}>
   {!curated&&<div className="r2-mobilebar"><IconButton aria-label={L('Contents')} onClick={()=>setList(true)}><FormatListBulletedRounded/></IconButton><button className="r2-mobile-logo" aria-label="Inkling" onClick={p.onHome}><Lockup/></button></div>}
   {curated&&isChapter&&<div className="curated-chapter-art">
    {p.backdrop!.whole&&<img className="curated-fill" src={p.backdrop!.url} alt="" aria-hidden="true"/>}
    <img className={'curated-art'+(p.backdrop!.whole?' whole':'')+(p.backdrop!.blur?' blurred':'')+(p.backdrop!.frame?' framed wide-only':'')} src={p.backdrop!.url} srcSet={p.backdrop!.srcset} alt="" style={{objectPosition:p.backdrop!.position,...frameVars(p.backdrop)}}/>
    <div className="curated-art-shade"/><div className="curated-chapter-inner"><div className="curated-chapter-top"><button disabled={!prev} aria-label={L('Previous')} onClick={()=>prev&&choose(prev)}>{isRtl(lang)?<ChevronRightRounded/>:<ChevronLeftRounded/>}</button><small>{index>=0?(lang==='fa'?'فصل '+num(lang,index+1)+' از '+num(lang,main.length):'Chapter '+(index+1)+' of '+main.length):L('Section')}</small><button disabled={!next} aria-label={L('Next')} onClick={()=>next&&choose(next)}>{isRtl(lang)?<ChevronLeftRounded/>:<ChevronRightRounded/>}</button></div><h1 dir="auto">{p.editSlot?.('t:'+chapter.id,()=>null)||chapterTitle(data,chapter)}</h1>{quoteLine&&<blockquote className="curated-chapter-quote" dir="auto">{quoteLine}</blockquote>}<div className="curated-chapter-bottom">{summary&&(p.canListen?.(chapter.id)??true)&&<button onClick={()=>p.onListen(chapter.id)}><HeadphonesRounded/>{L('Listen')}{mins?<span className="mins">{num(lang,mins)} {L('min')}</span>:null}</button>}{summary&&<span className="curated-chapter-time"><ScheduleRounded/>{num(lang,readMins)} {L('min read')}</span>}</div></div>
   </div>}
   {curated&&isChapter&&(p.backdrop!.caption?.text||p.backdrop!.credit)&&<p className="curated-chapter-credit" dir="auto">{p.backdrop!.credit&&<span>{displayPainting(p.backdrop!.credit,lang)}</span>}{p.backdrop!.caption?.text&&<span className="why">{p.backdrop!.caption.text}</span>}</p>}
   <div className="r2-col">
   {p.editBar}
   {section==='overview'&&report?.overview&&<div dir={rtl(report.language)}>
    {!curated&&<div className="r2-bar"><span className="r2-chip">{L('Study guide')}</span><span className="grow"/>{!p.readOnly&&<button className="r2-pill" onClick={()=>{setView('original');p.onChoose(Math.max(0,book.chapters.indexOf(main[0]||book.chapters[0])));}}>{L('Original text')}</button>}<IconButton className="r2-aa" size="small" aria-label={L('Reading settings')} onClick={e=>setLook(e.currentTarget)}><TextFieldsRounded/></IconButton></div>}<h1>{L('Overview')}</h1>
    <div className="r2-box"><strong>{L('Key takeaways')}</strong>{p.editSlot?.('ov:t',()=>null)||<ul>{report.overview.takeaways.map((t,i)=><li key={i} dir="auto"><Inline text={t.text}/></li>)}</ul>}</div>
    {paragraphs(report.overview.paragraphs,undefined,'ov:p')}
   </div>}
   {guideSection&&<div dir={rtl(report?.language)}>{!curated&&<div className="r2-bar"><span className="r2-chip">{L('Study guide')}</span><span className="grow"/>{!p.readOnly&&<button className="r2-pill" onClick={()=>{setView('original');p.onChoose(Math.max(0,book.chapters.indexOf(main[0]||book.chapters[0])));}}>{L('Original text')}</button>}<IconButton className="r2-aa" size="small" aria-label={L('Reading settings')} onClick={e=>setLook(e.currentTarget)}><TextFieldsRounded/></IconButton></div>}<h1 dir="auto">{p.editSlot?.('gt:'+guideAt,()=>null)||L(guideSection.title)}</h1>{paragraphs(guideSection.items,undefined,'g:'+guideAt)}</div>}
   {isChapter&&<>
    {!curated&&<div className="r2-bar"><span className="r2-chip">{index>=0&&<button className="r2-step" disabled={!prev} aria-label={L('Previous')} onClick={()=>prev&&choose(prev)}>{lang==='fa'||lang==='ar'?<ChevronRightRounded/>:<ChevronLeftRounded/>}</button>}<span>{index>=0?(lang==='fa'?'فصل '+num(lang,index+1)+' از '+num(lang,main.length):'Chapter '+(index+1)+' of '+main.length):L('Section')}</span>{index>=0&&<button className="r2-step" disabled={!next} aria-label={L('Next')} onClick={()=>next&&choose(next)}>{lang==='fa'||lang==='ar'?<ChevronLeftRounded/>:<ChevronRightRounded/>}</button>}</span><span className="grow"/>
     {!p.readOnly&&<div className="r2-switch" role="group" aria-label="View"><button aria-pressed={view==='summary'} className={view==='summary'?'on':''} onClick={()=>setView('summary')}>{L('Summary')}</button><button aria-pressed={view==='original'} className={view==='original'?'on':''} onClick={()=>setView('original')}>{L('Original')}</button></div>}
     {summary&&(p.canListen?.(chapter.id)??true)&&<button className="r2-pill" aria-label={L('Listen')} onClick={()=>p.onListen(chapter.id)}><PlayArrowRounded/><span>{L('Listen')}</span></button>}
     <IconButton className="r2-aa" size="small" aria-label={L('Reading settings')} onClick={e=>setLook(e.currentTarget)}><TextFieldsRounded/></IconButton>
    </div>}
    {!curated&&<h1 dir="auto" className={chapterTitle(data,chapter).length>48?'long':undefined}>{p.editSlot?.('t:'+chapter.id,()=>null)||chapterTitle(data,chapter)}</h1>}
    {view==='summary'&&(summary?<>
     {!p.readOnly&&<div className="r2-meta">{spent!=null&&<span>{money(spent)}</span>}<span className="grow"/>
      {!p.readOnly&&summary.model!=='imported'&&<><Button size="small" onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button>
      <Button size="small" startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button>
      <Button size="small" disabled={p.generating} onClick={p.onGenerate}>{p.generating?'Summarizing…':'Redo'}</Button></>}</div>}
     {p.generating&&<div className="doc-status"><LinearProgress/><span>Summarizing… <button onClick={p.onCancel}>Cancel</button></span></div>}
     <div dir={rtl(summary.language)}>{paragraphs(summary.paragraphs,chapter,'ch:'+chapter.id+':p')}{summary.review.length>0&&<><h2 className="r2-sub">Critique</h2>{paragraphs(summary.review,chapter,'ch:'+chapter.id+':r')}</>}</div>
     {p.notebook&&!p.editSlot&&<StudyTools lang={summary.language||lang} paragraphs={summary.paragraphs.filter(x=>!x.image)} book={p.notebook} chapter={{id:chapter.id,title:chapterTitle(data,chapter)}}/>}</>
    :p.readOnly?<div className="r2-box"><strong>{L('This chapter isn’t part of the published summary')}</strong><p>{L('Pick another chapter from the list.')}</p></div>
    :<div className="r2-box" dir="ltr">
     <strong>This chapter isn’t summarized yet</strong>
     <p>{bookWords({...book,chapters:[bodyChapter(chapter)]}).toLocaleString()} words{estimate!=null?' · about '+money(estimate)+' with your Gemini key':''}. Or read the original text.</p>
     <div className="box-actions"><Button variant="contained" startIcon={p.generating?<CircularProgress size={16} color="inherit"/>:<AutoAwesomeRounded/>} disabled={p.generating} onClick={p.onGenerate}>{p.generating?'Summarizing…':aiLabel}</Button><Button onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button><Button startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button><Button onClick={()=>setView('original')}>Read the original</Button></div>
     {p.generating&&<div className="doc-status"><LinearProgress/><span>Reading the chapter and checking each paragraph against it… <button onClick={p.onCancel}>Cancel</button></span></div>}
     {p.generationError&&<Alert severity="error" sx={{mt:2}}>{p.generationError}</Alert>}
     {main.length>1&&!data.report&&<p className="muted small">Want every chapter? <button className="text-link2 inline" onClick={p.onCreate}>Create the whole study guide</button></p>}
    </div>)}
    {view==='original'&&original(chapter)}
    <nav className="doc-pager" aria-label="Chapters">{prev?<button className="pg prev" onClick={()=>choose(prev)}><small>{L('Previous')}</small><span dir="auto">{chapterTitle(data,prev)}</span></button>:<span/>}{next?<button className="pg next" onClick={()=>choose(next)}><small>{L('Next')}</small><span dir="auto">{chapterTitle(data,next)}</span></button>:<span/>}</nav>
   </>}
   </div>
  </article>
  {canAsk&&!chat.loaded&&<AiLaunch label={L('Ask AI')+' ('+shortcutLabel()+')'} text={armed?L('Ask'):undefined} onClick={openChat}/>}
  {canAsk&&chat.loaded&&<Suspense fallback={null}><ChatPanel open={chat.open} onOpen={openChat} onClose={()=>setChat(c=>({...c,open:false}))} lang={lang} quote={chat.quote} quoteId={chat.n} armed={armed} chapterKey={book.id+'|'+(section||chapter.id)}
   context={{bookTitle:(data.version?.bookTitle||book.title),author:book.author==='Author not supplied'?'':book.author,chapterTitle:section==='overview'?L('Overview'):chapterTitle(data,chapter),lang,paragraphs:companionItems!.filter(x=>!x.image),takeaways:report?.overview?.takeaways.map(t=>t.text)}}/></Suspense>}
  {zoom&&<div className="lightbox" role="dialog" aria-modal="true" aria-label={zoom.alt} onClick={()=>setZoom(null)} onKeyDown={e=>{if(e.key==='Escape')setZoom(null);}}>
   <button className="lightbox-x" autoFocus aria-label={L('Close')} onClick={()=>setZoom(null)}><CloseRounded/></button>
   <img src={zoom.src} alt={zoom.alt} onClick={e=>e.stopPropagation()}/>
   {zoom.alt&&<p onClick={e=>e.stopPropagation()} dir="auto">{zoom.alt}</p>}
  </div>}
  <Menu anchorEl={ownerMenu} open={!!ownerMenu} onClose={()=>setOwnerMenu(null)} slotProps={{paper:{dir:isRtl(lang)?'rtl':'ltr'}}}>{p.owner?.onEdit&&<MenuItem onClick={()=>{setOwnerMenu(null);p.owner!.onEdit!();}}><ListItemIcon><EditOutlined fontSize="small"/></ListItemIcon>{L('Open in the book editor')}</MenuItem>}{p.owner?.onAudio&&<MenuItem onClick={()=>{setOwnerMenu(null);p.owner!.onAudio!();}}><ListItemIcon><GraphicEqRounded fontSize="small"/></ListItemIcon>{L('Audio…')}</MenuItem>}{p.owner?.onBackground&&<MenuItem onClick={()=>{setOwnerMenu(null);p.owner!.onBackground!();}}><ListItemIcon><WallpaperRounded fontSize="small"/></ListItemIcon>{L('Adjust background…')}</MenuItem>}{(p.owner?.onEdit||p.owner?.onAudio||p.owner?.onBackground)&&<Divider/>}<MenuItem onClick={()=>{setOwnerMenu(null);p.owner!.onToggle();}}><ListItemIcon><VisibilityOutlined fontSize="small"/></ListItemIcon>{L('View as visitor')}</MenuItem></Menu>
  <Menu anchorEl={depthMenu} open={!!depthMenu} onClose={()=>setDepthMenu(null)}>{(Object.keys(depthLabels) as Depth[]).map(d=><MenuItem key={d} selected={d===settings.depth} onClick={()=>{p.onPreferences({depth:d});setDepthMenu(null);}}>{depthLabels[d]}</MenuItem>)}</Menu>
  {phone?<Drawer anchor="bottom" open={!!look} onClose={()=>setLook(null)} slotProps={{paper:{className:'look-sheet'}}}><ReadingPanel lang={lang} reading={reading} onChange={setReading} onClose={()=>setLook(null)}/></Drawer>
  :<Popover open={!!look} anchorEl={look} onClose={()=>setLook(null)} disableRestoreFocus disableScrollLock slotProps={{paper:{className:'look-pop'}}}><ReadingPanel lang={lang} reading={reading} onChange={setReading} onClose={()=>setLook(null)}/></Popover>}
  <Popover open={!!opts} anchorEl={opts} onClose={()=>setOpts(null)} slotProps={{paper:{className:'opts-pop'}}}>
   <TextField select size="small" fullWidth label="Purpose" value={settings.purpose} onChange={e=>p.onPreferences({purpose:e.target.value as Settings['purpose']})}><MenuItem value="understand">Understand</MenuItem><MenuItem value="learn">Learn</MenuItem><MenuItem value="academic">Academic</MenuItem><MenuItem value="apply">Apply</MenuItem></TextField>
   <TextField select size="small" fullWidth label="Summary language" value={settings.language} onChange={e=>p.onPreferences({language:e.target.value})}>{languages.map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>
   <label className="opts-switch"><span>Include critique</span><Switch checked={settings.review==='internal'} onChange={e=>p.onPreferences({review:e.target.checked?'internal':'off'})}/></label>
  </Popover>
 </div>;
}

// Size, spacing, width, page colour and fonts for Persian and English text.
// The font lists open only on request, so the panel fits a phone.
function ReadingPanel({lang,reading,onChange,onClose}:{lang:string;reading:Reading;onChange:(patch:Partial<Reading>)=>void;onClose:()=>void}){
 const L=(text:string)=>tr(lang,text);
 const seg=<K extends keyof Reading>(key:K,options:[Reading[K],string][])=><div className="look-seg" role="group">{options.map(([v,l])=><button key={String(v)} aria-pressed={reading[key]===v} className={reading[key]===v?'on':''} onClick={()=>onChange({[key]:v} as Partial<Reading>)}>{L(l)}</button>)}</div>;
 const[fontsOpen,setFontsOpen]=useState(false);
 const current=faFonts.find(f=>f.id===reading.fa),currentEn=enFonts.find(f=>f.id===reading.en);
 return <div className="look" lang={lang} dir={lang==='fa'?'rtl':'ltr'}>
  <div className="look-head"><strong>{L('Reading settings')}</strong><IconButton size="small" aria-label={L('Close')} onClick={onClose}><CloseRounded/></IconButton></div>
  <div className="look-size"><button aria-label={L('Smaller text')} onClick={()=>onChange({size:Math.max(14,reading.size-1)})}>A</button><input type="range" min={14} max={30} value={reading.size} aria-label={L('Text size')} onChange={e=>onChange({size:+e.target.value})}/><button aria-label={L('Larger text')} className="big" onClick={()=>onChange({size:Math.min(30,reading.size+1)})}>A</button></div>
  <div className="look-themes" role="group" aria-label={L('Page colour')}>{(['paper','white','sepia','night'] as const).map(t=><button key={t} aria-label={L(t)} aria-pressed={reading.theme===t} className={'sw sw-'+t+(reading.theme===t?' on':'')} onClick={()=>onChange({theme:t})}>Aa</button>)}</div>
  <label>{L('Line spacing')}</label>{seg('leading',[['tight','Compact'],['normal','Normal'],['airy','Airy']])}
  <label>{L('Page width')}</label>{seg('width',[['narrow','Narrow'],['medium','Medium'],['wide','Wide']])}
  <button className="look-fold" aria-expanded={fontsOpen} onClick={()=>setFontsOpen(!fontsOpen)}><span>{L('Fonts')}</span><small>{current?.label.split(' · ')[0]} · {currentEn?.label}</small></button>
  {fontsOpen&&<>
  <FontChooser lang={lang} reading={reading} onChange={onChange}/>
  </>}
  <label className="look-switch"><input type="checkbox" checked={reading.zen} onChange={e=>{onChange({zen:e.target.checked});if(e.target.checked)onClose();}}/> {L('Zen mode')} <small>— {L('only the text, nothing else')}</small></label>
  <label className="look-switch"><input type="checkbox" checked={reading.justify} onChange={e=>onChange({justify:e.target.checked})}/> {L('Justify text')}</label>
 </div>;
}
