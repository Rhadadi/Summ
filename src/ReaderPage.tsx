import{useEffect,useRef,useState}from'react';
import{Alert,Button,CircularProgress,Drawer,IconButton,LinearProgress,Menu,MenuItem,Popover,Switch,TextField}from'@mui/material';
import{ArrowBackIosNewRounded,AutoAwesomeRounded,BookmarkBorderRounded,EditOutlined,BookmarkRounded,ChevronRightRounded,ExpandMoreRounded,FormatListBulletedRounded,LightbulbOutlined,PlayArrowRounded,TuneRounded}from'@mui/icons-material';
import type{Account,Block,Book,Chapter,Depth,SavedPassage,Settings,Summary,SummaryParagraph}from'./types';
import{bodyChapter,bookWords,depthLabels,isHeading,languages,sectionKind}from'./core';
import{costRange,estimateChapter,money,usageCost}from'./cost';
import type{Price}from'./cost';
import{chapterTitle,mainChapters,strip,type BookData}from'./bookData';

interface Props{
 book:Book;chapter:Chapter;section:string;settings:Settings;account:Account|null;price:Price|null;saved:SavedPassage[];data:BookData;
 summary:Summary|null;generating:boolean;generationError:string;
 onPreferences:(patch:Partial<Settings>)=>void;onGenerate:()=>void;onCancel:()=>void;onBookmark:(block:Block,wording:string,chapter:Chapter)=>void;onEvidence:(block:Block,wording:string,chapter:Chapter)=>void;
 onChoose:(index:number)=>void;onSection:(section:string)=>void;onBack:()=>void;onFinished:()=>void;onListen:(chapterId?:string)=>void;onCreate:()=>void;
 readOnly?:boolean;
}
const rtl=(lang?:string)=>lang&&['fa','ar'].includes(lang)?'rtl':'ltr';
export default function ReaderPage(p:Props){
 const{book,chapter,section,settings,data,account}=p;
 const[view,setView]=useState<'summary'|'original'>('summary'),[list,setList]=useState(false),[more,setMore]=useState(false);
 const[opts,setOpts]=useState<HTMLElement|null>(null),[depthMenu,setDepthMenu]=useState<HTMLElement|null>(null);
 const top=useRef<HTMLDivElement>(null);
 useEffect(()=>{top.current?.scrollIntoView({block:'start'});window.scrollTo({top:0});},[chapter.id,section]);
 const main=mainChapters(book),kinds=book.chapters.map((c,i)=>sectionKind(c,i,book.chapters));
 const report=data.report;

 const guideItems=[...(report?.overview?[{id:'overview',label:'Overview and key takeaways'}]:[]),...(report?.guide?.sections||[]).map(s=>({id:'g:'+s.kind,label:s.title}))];
 const isChapter=!section;
 const summary=isChapter?(p.summary||data.summaries[chapter.id]||null):null;
 const index=main.indexOf(chapter);
 const kept=(b:Block)=>p.saved.some(s=>s.bookId===book.id&&s.blockId===b.id);
 const estimate=p.price?costRange(estimateChapter(chapter,settings),p.price).likely:null;
 const spent=usageCost(summary?.usage,p.price);
 const aiLabel=!account?'Log in to summarize':!account.key?'Add your Gemini key':summary?'Summarize again':'Summarize this chapter';
 function choose(c:Chapter){setList(false);p.onChoose(book.chapters.indexOf(c));}
 function paragraphs(items:SummaryParagraph[],c?:Chapter){
  return items.map((x,i)=><div className="r2-p" key={i}>{x.heading&&<h3 dir="auto">{x.heading}</h3>}<p dir="auto">{x.text}<span className="refs">{c?[...new Map(x.evidence_ids.map(id=>c.blocks.find(b=>b.id===id)).filter((b):b is Block=>!!b).map(b=>[b.page??b.id,b])).values()].map(b=>p.readOnly?<span className="pg-chip" key={b.id}>{b.page?'p. '+b.page:'¶'}</span>:<button key={b.id} onClick={()=>p.onEvidence(b,b.text,c)}>{b.page?'p. '+b.page:'¶'}</button>):x.evidence_ids.map(id=>{const ch=book.chapters.find(y=>y.id===id);return ch?<button key={id} onClick={()=>choose(ch)}>{strip(ch.title).slice(0,40)}</button>:null;})}{c&&(x.pages||[]).map(n=>{const b=c.blocks.find(y=>y.page===n&&!y.note);return b&&!p.readOnly?<button key={'p'+n} onClick={()=>p.onEvidence(b,b.text,c)}>p. {n}</button>:<span className="pg-chip" key={'p'+n}>p. {n}</span>;})}</span></p></div>);
 }
 // Original text reads as a book page: headings, flowing paragraphs, page numbers in the margin, notes at the end.
 function original(c:Chapter){
  let page:number|undefined;const notes=c.blocks.filter(b=>b.note);
  const words=(t:string)=>new Set(t.toLowerCase().match(/\p{L}{3,}/gu)||[]);const titleWords=words(c.title);
  const body=c.blocks.filter(b=>!b.note);
  const first=body[0]&&body[0].text.length<300&&[...words(body[0].text)].filter(w=>titleWords.has(w)).length>=Math.min(4,titleWords.size*.7)?1:0;
  return <>{body.slice(first).map(b=>{
   const marker=b.page!==page?b.page:undefined;page=b.page;
   if(isHeading(b.text))return <h3 key={b.id} className="text-h" dir="auto">{b.text}</h3>;
   return <div className="text-p" key={b.id}>{marker&&<button className="folio" onClick={()=>p.onEvidence(b,b.text,c)} aria-label={'Page '+marker}>{marker}</button>}<p dir="auto">{b.text}</p><IconButton className="keep" size="small" aria-label={kept(b)?'Unsave passage':'Save passage'} onClick={()=>p.onBookmark(b,b.text,c)}>{kept(b)?<BookmarkRounded fontSize="inherit"/>:<BookmarkBorderRounded fontSize="inherit"/>}</IconButton></div>;
  })}{notes.length>0&&<details className="notes"><summary>Notes ({notes.length})</summary>{notes.map(b=><p key={b.id} dir="auto"><button className="folio-inline" onClick={()=>p.onEvidence(b,b.text,c)}>p. {b.page}</button> {b.text}</p>)}</details>}</>;
 }
 const row=(c:Chapter)=>{const n=data.titles[c.id]?(main.includes(c)?String(main.indexOf(c)+1):''):c.title.match(/^(\d+)[.\s]/)?.[1];const on=isChapter&&c.id===chapter.id;return <button key={c.id} className={'r2-row'+(on?' on':'')+(book.completed.includes(c.id)?' done':'')} aria-current={on?'true':undefined} onClick={()=>choose(c)}><span className="n">{n||''}</span><span className="t" dir="auto">{chapterTitle(data,c)}{data.summaries[c.id]&&<i className="dot" aria-label="Summarized"/>}</span><ChevronRightRounded/></button>;};
 const panel=<nav className="r2-list" aria-label="Contents">
  <IconButton className="r2-back" aria-label="Back to the book" onClick={p.onBack}><ArrowBackIosNewRounded/></IconButton>
  {guideItems.length>0&&<><p className="r2-head"><LightbulbOutlined/>Study guide</p>{guideItems.map(g=><button key={g.id} className={'r2-row'+(section===g.id?' on':'')} onClick={()=>{setList(false);p.onSection(g.id);}}><span className="n"/><span className="t" dir="auto">{g.label}</span><ChevronRightRounded/></button>)}</>}
  <p className="r2-head"><FormatListBulletedRounded/>Chapters</p>
  {main.map(row)}
  {kinds.some(k=>k!=='main')&&<><button className="more-toggle" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'Hide':'More sections'}: front matter, index</button>{more&&book.chapters.filter((_,i)=>kinds[i]!=='main').map(row)}</>}
 </nav>;
 const guideSection=section.startsWith('g:')?report?.guide?.sections.find(s=>'g:'+s.kind===section):undefined;
 const seq=main.includes(chapter)?main:book.chapters,next=seq[seq.indexOf(chapter)+1],prev=seq[seq.indexOf(chapter)-1];
 return <div className="r2">
  <aside className="r2-side">{panel}</aside>
  <Drawer open={list} onClose={()=>setList(false)} slotProps={{paper:{className:'r2-drawer'}}}>{panel}</Drawer>
  <article className="r2-main" ref={top}>
   <div className="r2-mobilebar"><IconButton aria-label="Back to the book" onClick={p.onBack}><ArrowBackIosNewRounded/></IconButton><span>{isChapter?(index>=0?'Chapter '+(index+1)+' of '+main.length:'Section'):'Study guide'}</span><IconButton aria-label="Contents" onClick={()=>setList(true)}><FormatListBulletedRounded/></IconButton></div>
   {section==='overview'&&report?.overview&&<div dir={rtl(report.language)}>
    <p className="r2-kicker">STUDY GUIDE</p><h1>Overview</h1>
    {paragraphs(report.overview.paragraphs)}
    <div className="r2-box"><strong>Key takeaways</strong><ul>{report.overview.takeaways.map((t,i)=><li key={i} dir="auto">{t.text}</li>)}</ul></div>
   </div>}
   {guideSection&&<div dir={rtl(report?.language)}><p className="r2-kicker">STUDY GUIDE</p><h1 dir="auto">{guideSection.title}</h1>{paragraphs(guideSection.items)}</div>}
   {isChapter&&<>
    <div className="r2-top"><p className="r2-kicker">{index>=0?'CHAPTER '+(index+1)+' OF '+main.length:'SECTION'}</p>
     {!p.readOnly&&<div className="r2-switch" role="group" aria-label="View"><button aria-pressed={view==='summary'} className={view==='summary'?'on':''} onClick={()=>setView('summary')}>Summary</button><button aria-pressed={view==='original'} className={view==='original'?'on':''} onClick={()=>setView('original')}>Original</button></div>}
    </div>
    <h1 dir="auto">{chapterTitle(data,chapter)}</h1>
    {view==='summary'&&(summary?<>
     <div className="r2-meta"><span title={summary.model||undefined}>{summary.model==='imported'&&data.version?data.version.label+' summary':'AI summary'}{spent!=null?' · '+money(spent):''}</span><span className="grow"/>
      <Button size="small" startIcon={<PlayArrowRounded/>} onClick={()=>p.onListen(chapter.id)}>Listen</Button>
      {!p.readOnly&&summary.model!=='imported'&&<><Button size="small" onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button>
      <Button size="small" startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button>
      <Button size="small" disabled={p.generating} onClick={p.onGenerate}>{p.generating?'Summarizing…':'Redo'}</Button></>}</div>
     {p.generating&&<div className="doc-status"><LinearProgress/><span>Summarizing… <button onClick={p.onCancel}>Cancel</button></span></div>}
     <div dir={rtl(summary.language)}>{paragraphs(summary.paragraphs,chapter)}{summary.review.length>0&&<><h2 className="r2-sub">Critique</h2>{paragraphs(summary.review,chapter)}</>}</div></>
    :p.readOnly?<div className="r2-box"><strong>This chapter isn’t part of the published summary</strong><p>Pick another chapter from the list.</p></div>
    :<div className="r2-box">
     <strong>This chapter isn’t summarized yet</strong>
     <p>{bookWords({...book,chapters:[bodyChapter(chapter)]}).toLocaleString()} words{estimate!=null?' · about '+money(estimate)+' with your Gemini key':''}. Or read the original text.</p>
     <div className="box-actions"><Button variant="contained" startIcon={p.generating?<CircularProgress size={16} color="inherit"/>:<AutoAwesomeRounded/>} disabled={p.generating} onClick={p.onGenerate}>{p.generating?'Summarizing…':aiLabel}</Button><Button onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button><Button startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button><Button onClick={()=>setView('original')}>Read the original</Button></div>
     {p.generating&&<div className="doc-status"><LinearProgress/><span>Reading the chapter and checking each paragraph against it… <button onClick={p.onCancel}>Cancel</button></span></div>}
     {p.generationError&&<Alert severity="error" sx={{mt:2}}>{p.generationError}</Alert>}
     {main.length>1&&!data.report&&<p className="muted small">Want every chapter? <button className="text-link2 inline" onClick={p.onCreate}>Create the whole study guide</button></p>}
    </div>)}
    {view==='original'&&original(chapter)}
    <nav className="doc-pager" aria-label="Chapters">{prev?<button className="pg prev" onClick={()=>choose(prev)}><small>Previous</small><span dir="auto">{chapterTitle(data,prev)}</span></button>:<span/>}{next?<button className="pg next" onClick={()=>choose(next)}><small>Next</small><span dir="auto">{chapterTitle(data,next)}</span></button>:<span/>}<button className="pg-read" onClick={p.onFinished}>{book.completed.includes(chapter.id)?'Marked as read ✓':'Mark this chapter as read'}</button></nav>
   </>}
  </article>
  <Menu anchorEl={depthMenu} open={!!depthMenu} onClose={()=>setDepthMenu(null)}>{(Object.keys(depthLabels) as Depth[]).map(d=><MenuItem key={d} selected={d===settings.depth} onClick={()=>{p.onPreferences({depth:d});setDepthMenu(null);}}>{depthLabels[d]}</MenuItem>)}</Menu>
  <Popover open={!!opts} anchorEl={opts} onClose={()=>setOpts(null)} slotProps={{paper:{className:'opts-pop'}}}>
   <TextField select size="small" fullWidth label="Purpose" value={settings.purpose} onChange={e=>p.onPreferences({purpose:e.target.value as Settings['purpose']})}><MenuItem value="understand">Understand</MenuItem><MenuItem value="learn">Learn</MenuItem><MenuItem value="academic">Academic</MenuItem><MenuItem value="apply">Apply</MenuItem></TextField>
   <TextField select size="small" fullWidth label="Summary language" value={settings.language} onChange={e=>p.onPreferences({language:e.target.value})}>{languages.map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>
   <label className="opts-switch"><span>Include critique</span><Switch checked={settings.review==='internal'} onChange={e=>p.onPreferences({review:e.target.checked?'internal':'off'})}/></label>
  </Popover>
 </div>;
}
