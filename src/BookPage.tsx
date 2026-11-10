import{useEffect,useMemo,useRef,useState}from'react';
import{Alert,Button,CircularProgress,IconButton,LinearProgress,Menu,MenuItem,Popover,Switch,TextField,ToggleButton,ToggleButtonGroup}from'@mui/material';
import{AutoAwesomeRounded,BookmarkBorderRounded,BookmarkRounded,DownloadRounded,EditOutlined,ExpandMoreRounded,GraphicEqRounded,ImageOutlined,OpenInNewRounded,PauseRounded,PlayArrowRounded,StarRounded,TuneRounded}from'@mui/icons-material';
import type{Account,Block,Book,BookInfo,BookReport,Chapter,Depth,SavedPassage,Settings,Summary,SummaryParagraph}from'./types';
import{ApiError,bookInfo,coverImage,narrate,pdfReport}from'./api';
import{store}from'./storage';
import{referenceLabels,reportComplete}from'./book-summary';
import{bookWords,depthLabels,languages,minutes,selectedPassages}from'./core';
import{money,usageCost}from'./cost';
import type{Price}from'./cost';
import Cover from'./Cover';import{Logo}from'./Header';

interface Props{
 book:Book;chapter:Chapter;settings:Settings;account:Account|null;price:Price|null;saved:SavedPassage[];cover:string;reportVersion:number;
 summary:Summary|null;generating:boolean;generationError:string;
 onCover:(blob:Blob,source:'file'|'online')=>void;onCreate:()=>void;onAccount:()=>void;onPreferences:(patch:Partial<Settings>)=>void;
 onGenerate:()=>void;onCancel:()=>void;onBookmark:(block:Block,wording:string,chapter:Chapter)=>void;onEvidence:(block:Block,wording:string,chapter:Chapter)=>void;
 onChoose:(index:number)=>void;onExport:()=>void;onEditContents:()=>void;onFinished:()=>void;
}
const ELEVEN_PER_1K=.1;
const pdfLabels:Record<string,Record<string,string>>={fa:{overview:'نمای کلی',takeaways:'نکته‌های کلیدی',glance:'نگاهی به کتاب',contents:'فهرست',analysis:'تحلیل درونی',reception:'زمینه و بازتاب',publisher:'معرفی ناشر از Google Books',kicker:'Summ · راهنمای مطالعه',disclaimer:'این متن با هوش مصنوعی از روی منبع ساخته و به‌طور خودکار با آن سنجیده شده است. امتیازها و توضیح‌ها از منابع عمومی نام‌برده آمده‌اند. به متن اصلی مراجعه کنید.'}};
function hash(text:string){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
// Narration requests stay under the server's 4,500-character limit and break at paragraph boundaries.
function chunks(parts:{title:string;text:string}[]){
 const out:{title:string;text:string}[]=[];
 for(const part of parts){let current='';for(const paragraph of part.text.split('\n\n')){if(current&&current.length+paragraph.length>4000){out.push({title:part.title,text:current});current='';}current+=(current?'\n\n':'')+paragraph.slice(0,4400);}if(current)out.push({title:part.title,text:current});}
 return out;
}
async function downscale(blob:Blob){
 const bitmap=await createImageBitmap(blob);const scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/jpeg',.85);
}
export default function BookPage({book,chapter,settings,account,price,saved,cover,reportVersion,summary,generating,generationError,onCover,onCreate,onAccount,onPreferences,onGenerate,onCancel,onBookmark,onEvidence,onChoose,onExport,onEditContents,onFinished}:Props){
 const[report,setReport]=useState<BookReport>(),[info,setInfo]=useState<BookInfo|null>(null),[infoState,setInfoState]=useState<'loading'|'ready'|'none'>('loading');
 const[tab,setTab]=useState<'guide'|'text'>('guide'),[section,setSection]=useState('overview'),[textMode,setTextMode]=useState<'full'|'highlights'>('full');
 const[query,setQuery]=useState({title:book.title,author:book.author==='Author not supplied'?'':book.author}),[editing,setEditing]=useState(false);
 const[navOpen,setNavOpen]=useState({guide:true,chapters:true}),[opts,setOpts]=useState<HTMLElement|null>(null),[depthMenu,setDepthMenu]=useState<HTMLElement|null>(null);
 const[busy,setBusy]=useState(''),[error,setError]=useState('');
 const[engine,setEngine]=useState<'offline'|'elevenlabs'>('offline'),[queue,setQueue]=useState<{title:string;text:string}[]>([]),[track,setTrack]=useState(0),[ready,setReady]=useState<string[]>([]),[playing,setPlaying]=useState(false);
 const audio=useRef<HTMLAudioElement>(null),narration=useRef<AbortController|null>(null);
 const language=report?.language||settings.language;
 useEffect(()=>{let live=true;store.latestReport(book.id).then(key=>key?store.report(key):undefined).then(r=>{if(live)setReport(r);}).catch(()=>{});return()=>{live=false;};},[book.id,reportVersion]);
 async function lookup(title:string,author:string,force=false){
  setInfoState('loading');
  try{
   const saved=force?undefined:await store.info(book.id);const result=saved||await bookInfo(title,author);
   if(!saved)await store.saveInfo(book.id,result);setInfo(result);setInfoState('ready');
   // A cover taken from the file always wins; online covers only fill a gap or replace an earlier online pick.
   const stored=await store.cover(book.id);
   if(result.covers[0]&&(!stored||(force&&stored.source==='online')))onCover(await coverImage(result.covers[0]),'online');
  }catch{setInfo(null);setInfoState('none');}
 }
 useEffect(()=>{if(!book.demo)lookup(query.title,query.author);else setInfoState('none');return()=>narration.current?.abort();},[book.id]);
 const chapters=book.chapters.filter(c=>report?.chapters[c.id]);
 const complete=reportComplete(book,report);
 const narrationParts=()=>[...(report?.overview?[{title:'Overview',text:report.overview.paragraphs.map(p=>(p.heading?p.heading+'. ':'')+p.text).join('\n\n')}]:[]),...chapters.map(c=>({title:c.title,text:c.title+'.\n\n'+report!.chapters[c.id].paragraphs.map(p=>(p.heading?p.heading+'. ':'')+p.text).join('\n\n')}))];
 const narrationChars=narrationParts().reduce((n,p)=>n+p.text.length,0);
 const audioKey=(text:string)=>book.id+':audio:'+engine+':'+language+':'+hash(text);
 async function listen(){
  if(!account){onAccount();return;}
  narration.current?.abort();const run=new AbortController();narration.current=run;
  const list=chunks(narrationParts());setQueue(list);setTrack(0);setReady([]);setError('');
  const urls:string[]=[];
  try{
   for(const [i,item] of list.entries()){
    if(run.signal.aborted)return;
    let blob=await store.audio(audioKey(item.text));
    if(!blob){blob=await narrate(item.text,language,engine,run.signal);await store.saveAudio(audioKey(item.text),blob);}
    urls[i]=URL.createObjectURL(blob);setReady([...urls]);
    if(i===0&&audio.current){audio.current.src=urls[0];audio.current.play().then(()=>setPlaying(true)).catch(()=>{});}
   }
  }catch(e){if(!run.signal.aborted){if(e instanceof ApiError&&(e.status===401||e.status===412))onAccount();setError((e as Error).message);}}
 }
 function next(){const n=track+1;if(ready[n]&&audio.current){setTrack(n);audio.current.src=ready[n];audio.current.play().catch(()=>{});}else setPlaying(false);}
 async function downloadPdf(){
  if(!report)return;setBusy('pdf');setError('');
  try{
   const coverBlob=(await store.cover(book.id))?.blob;
   const labelled=(items:SummaryParagraph[],chapter?:Chapter)=>items.map(p=>({heading:p.heading,text:p.text,ref:chapter?referenceLabels(book,chapter,p).join(' · '):p.evidence_ids.map(id=>book.chapters.find(c=>c.id===id)?.title||'').filter(Boolean).join(' · ')}));
   const blob=await pdfReport({book:{title:book.title,author:book.author},language,model:report.model,cover:coverBlob?await downscale(coverBlob):null,
    info:info?{year:info.year,pages:info.pages,categories:info.categories,ratings:info.ratings,description:info.description,wikipedia:info.wikipedia}:null,
    overview:report.overview?labelled(report.overview.paragraphs):[],takeaways:report.overview?.takeaways.map(t=>({text:t.text}))||[],
    guide:report.guide?{sections:report.guide.sections.map(s=>({title:s.title,items:labelled(s.items)}))}:null,
    chapters:chapters.map(c=>({title:c.title,paragraphs:labelled(report.chapters[c.id].paragraphs,c),review:labelled(report.chapters[c.id].review,c)})),labels:pdfLabels[language]||{}});
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=book.title.replace(/[^\p{L}\p{N}\s-]/gu,'').slice(0,90)+' — Study guide.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(e instanceof ApiError&&e.status===401)onAccount();setError((e as Error).message);}finally{setBusy('');}
 }
 async function coverFromFile(){
  const file=await store.file(book.id);if(!file)return;setBusy('cover');
  const{extractCover}=await import('./importers');const blob=await extractCover(file,book.format==='EPUB'?'x.epub':'x.pdf');
  if(blob)onCover(blob,'file');else setError('No cover image was found in the file.');setBusy('');
 }
 const guideSections=useMemo(()=>[{id:'overview',label:'Overview'},{id:'glance',label:'At a glance'},...(report?.guide?.sections||[]).map(s=>({id:'g:'+s.kind,label:s.title}))],[report]);
 const readMinutes=minutes(bookWords(book));
 const strip=(t:string)=>t.replace(/^\d+[.\s]+/,'');
 const current=section.startsWith('c:')?book.chapters.find(c=>c.id===section.slice(2)):undefined;
 const shownChapter=tab==='text'?chapter:current;
 const guideSection=section.startsWith('g:')?report?.guide?.sections.find(s=>'g:'+s.kind===section):undefined;
 const chapterSummary=current?((summary&&chapter.id===current.id)?summary:report?.chapters[current.id]):undefined;
 const kept=(block:Block,wording:string)=>saved.some(s=>s.bookId===book.id&&s.blockId===block.id&&s.text===wording);
 const spent=usageCost(chapterSummary?.usage,price);
 const aiLabel=!account?'Log in to summarize':!account.key?'Add your Gemini key':chapterSummary?'Summarize again':'Summarize this chapter';
 function pick(c:Chapter){const i=book.chapters.indexOf(c);onChoose(i);if(tab==='guide')setSection('c:'+c.id);}
 function summaryParagraphs(items:SummaryParagraph[],c?:Chapter){
  return items.map((p,i)=><div className="doc-p" key={i}>{p.heading&&<h3 dir="auto">{p.heading}</h3>}<p dir="auto">{p.text}</p><div className="doc-refs">{c?p.evidence_ids.map(id=>{const b=c.blocks.find(b=>b.id===id);return b?<button key={id} onClick={()=>onEvidence(b,b.text,c)}>{b.page?'Page '+b.page:b.location}</button>:null;}):p.evidence_ids.map(id=>{const ch=book.chapters.find(x=>x.id===id);return ch?<button key={id} onClick={()=>{pick(ch);}}>{strip(ch.title)}</button>:null;})}</div></div>);
 }
 function passage(block:Block,wording:string,key:string,c:Chapter){
  return <div className="doc-p text-p" key={key}><p dir="auto">{wording}</p><div className="doc-refs"><button onClick={()=>onEvidence(block,wording,c)}>{block.page?'Page '+block.page:block.location}</button><IconButton size="small" aria-label={kept(block,wording)?'Unsave passage':'Save passage'} onClick={()=>onBookmark(block,wording,c)}>{kept(block,wording)?<BookmarkRounded fontSize="inherit"/>:<BookmarkBorderRounded fontSize="inherit"/>}</IconButton></div></div>;
 }
 const finished=(c:Chapter)=>book.completed.includes(c.id);
 const idx=(c:Chapter)=>book.chapters.indexOf(c);
 function pager(c:Chapter){const next=book.chapters[idx(c)+1],prev=book.chapters[idx(c)-1];return <nav className="doc-pager" aria-label="Chapters"><span>{prev&&<button onClick={()=>pick(prev)}>‹ {strip(prev.title)}</button>}</span><button onClick={onFinished}>{finished(c)?'Marked as read ✓':'Mark as read'}</button><span>{next&&<button onClick={()=>pick(next)}>{strip(next.title)} ›</button>}</span></nav>;}
 return <div className="book" dir="ltr">
  <section className="book-head">
   <div className="bk-card"><div className="card-top"><span className="card-brand"><Logo dark/>Summ</span><span className="card-tag">Study guide</span></div><h2 dir="auto">{book.title}</h2><p className="card-author" dir="auto">{info?.authors[0]||(book.author==='Author not supplied'?'':book.author)}</p><Cover book={book} url={cover} className="bk-cover"/></div>
   <div className="book-main">
    <h1 dir="auto">{book.title}</h1>
    <p className="book-author" dir="auto">{info?.authors[0]||(book.author==='Author not supplied'?'':book.author)}</p>
    <p className="book-meta">{info?.pages?info.pages+' pages · ':''}{readMinutes}-minute read{info?.year?' · '+info.year:''}</p>
    <div className="tags">{[report?.guide?.type_label,...(info?.categories||[]).slice(0,3)].filter(Boolean).map(t=><span key={t} className="tag">{t}</span>)}{info?.ratings.map(r=><a key={r.source} className="tag rate" href={r.url||'#'} target="_blank" rel="noopener noreferrer"><StarRounded fontSize="inherit"/>{r.rating.toFixed(1)}{r.count?' ('+r.count.toLocaleString()+')':''} {r.source}</a>)}</div>
    {info?.description&&<p className="book-blurb" dir="auto">{info.description.slice(0,260)}{info.description.length>260?'…':''}</p>}
    <div className="book-actions">
     {complete?<Button variant="contained" startIcon={busy==='pdf'?<CircularProgress size={16} color="inherit"/>:<DownloadRounded/>} disabled={!!busy} onClick={downloadPdf}>{busy==='pdf'?'Typesetting…':'Download PDF'}</Button>:<Button variant="contained" startIcon={<AutoAwesomeRounded/>} onClick={onCreate}>{chapters.length?'Finish the study guide':'Create study guide'}</Button>}
     <Button variant="outlined" startIcon={<GraphicEqRounded/>} disabled={!chapters.length} onClick={listen}>Listen</Button>
     <IconButton className="ring" aria-label="Edit contents" onClick={onEditContents}><EditOutlined/></IconButton>
     <IconButton className="ring" aria-label="Export notes" onClick={onExport}><DownloadRounded/></IconButton>
     {!book.demo&&<IconButton className="ring" aria-label={book.format==='PDF'||book.format==='EPUB'?'Cover from file':'Cover from web'} onClick={()=>book.format==='PDF'||book.format==='EPUB'?coverFromFile():info?.covers[0]&&coverImage(info.covers[0]).then(b=>onCover(b,'online'))}><ImageOutlined/></IconButton>}
    </div>
   </div>
  </section>
  <div className="book-tabs" role="tablist"><button role="tab" aria-selected={tab==='guide'} className={tab==='guide'?'on':''} onClick={()=>setTab('guide')}>Study guide</button><button role="tab" aria-selected={tab==='text'} className={tab==='text'?'on':''} onClick={()=>setTab('text')}>Original text</button></div>
  {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  {queue.length>0&&<div className="guide-player" role="region" aria-label="Narration">
   <Button aria-label={playing?'Pause narration':'Play narration'} variant="contained" onClick={()=>{if(!audio.current)return;if(playing){audio.current.pause();setPlaying(false);}else if(ready[track]){audio.current.src||=ready[track];audio.current.play().then(()=>setPlaying(true)).catch(()=>{});}}}>{playing?<PauseRounded/>:<PlayArrowRounded/>}</Button>
   <div><strong dir="auto">{queue[track]?.title}</strong><span>Part {track+1} of {queue.length} · {ready.length<queue.length?'preparing '+(ready.length+1)+' of '+queue.length+'…':'all parts ready'}</span><LinearProgress variant="determinate" value={ready.length/queue.length*100}/></div>
   <audio ref={audio} onEnded={next} onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)}/>
  </div>}
  <div className="book-body">
   <nav className="doc-nav" aria-label="Sections">
    {tab==='guide'&&<><button className="nav-head" aria-expanded={navOpen.guide} onClick={()=>setNavOpen({...navOpen,guide:!navOpen.guide})}>Study guide<ExpandMoreRounded className={navOpen.guide?'open':''}/></button>
     {navOpen.guide&&guideSections.map(s=><button key={s.id} className={'nav-item'+(section===s.id?' on':'')} onClick={()=>setSection(s.id)} dir="auto">{s.label}</button>)}</>}
    <button className="nav-head" aria-expanded={navOpen.chapters} onClick={()=>setNavOpen({...navOpen,chapters:!navOpen.chapters})}>{tab==='guide'?'Chapter summaries':'Chapters'}<ExpandMoreRounded className={navOpen.chapters?'open':''}/></button>
    {navOpen.chapters&&book.chapters.map(c=><button key={c.id} className={'nav-item'+((tab==='guide'?section==='c:'+c.id:chapter.id===c.id)?' on':'')+(finished(c)?' done':'')} onClick={()=>pick(c)} dir="auto">{strip(c.title)}</button>)}
    {tab==='guide'&&<div className="nav-listen"><ToggleButtonGroup size="small" exclusive fullWidth value={engine} onChange={(_,v)=>{if(v)setEngine(v);}} aria-label="Voice"><ToggleButton value="offline">Offline voice</ToggleButton><ToggleButton value="elevenlabs" disabled={!account?.voice}>ElevenLabs</ToggleButton></ToggleButtonGroup>
     <small>{narrationChars?<>{narrationChars.toLocaleString()} characters · about {Math.max(1,Math.round(narrationChars/900))} min · {engine==='offline'?'free':'≈ '+money(narrationChars/1000*ELEVEN_PER_1K)}</>:'Summaries needed to listen.'}</small></div>}
   </nav>
   <article className="doc" dir={tab==='guide'&&['fa','ar'].includes(language)?'rtl':'ltr'}>
    {tab==='guide'&&section==='overview'&&<>
     <h2>Summary and study guide</h2><h3 className="doc-h">Overview</h3>
     {report?.overview?<>{summaryParagraphs(report.overview.paragraphs)}<div className="doc-box"><strong>Key takeaways</strong><ul>{report.overview.takeaways.map((t,i)=><li key={i} dir="auto">{t.text}</li>)}</ul></div></>
     :<>{info?.description?<p dir="auto">{info.description}</p>:<p>{book.demo?'An original sample written for Summ.':'No summary yet.'}</p>}
      <div className="doc-box"><strong>Make this a study guide</strong><p>Summ summarizes every chapter, checks each summary against your text, then adds sections that fit the book: characters and themes for a novel, key ideas and terms for nonfiction. You see the cost first.</p><Button variant="contained" onClick={onCreate}>{chapters.length?'Resume':'Create study guide'}</Button></div></>}
    </>}
    {tab==='guide'&&section==='glance'&&<>
     <h2>At a glance</h2>
     {infoState==='loading'?<div className="guide-loading"><CircularProgress size={20}/> Looking the book up…</div>:infoState==='none'||!info?<p>No public record was found for this book.</p>:<>
      <dl className="facts">{info.year&&<div><dt>Published</dt><dd>{info.year}</dd></div>}{info.pages&&<div><dt>Length</dt><dd>{info.pages} pages</dd></div>}{info.readers&&<div><dt>Open Library readers</dt><dd>{info.readers.toLocaleString()}</dd></div>}{info.ratings.map(r=><div key={r.source}><dt>{r.source}</dt><dd>{r.rating.toFixed(2)} / 5{r.count?' · '+r.count.toLocaleString():''}</dd></div>)}</dl>
      {info.wikipedia&&<><h3 className="doc-h">Background and reception</h3><p dir="auto">{info.wikipedia.extract}</p><p className="doc-src">From <a href={info.wikipedia.url} target="_blank" rel="noopener noreferrer">Wikipedia</a> · {info.wikipedia.license}</p></>}
      <h3 className="doc-h">Reviews elsewhere</h3><div className="links">{info.links.map(l=><a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer">{l.name}<OpenInNewRounded fontSize="inherit"/></a>)}</div>
      <p className="doc-src">Goodreads has no public API and forbids automated copying, so Summ links to it instead of showing its ratings.</p></>}
     {!book.demo&&(editing?<form className="guide-edit" onSubmit={e=>{e.preventDefault();setEditing(false);lookup(query.title,query.author,true);}}><TextField size="small" label="Title" value={query.title} onChange={e=>setQuery({...query,title:e.target.value})}/><TextField size="small" label="Author" value={query.author} onChange={e=>setQuery({...query,author:e.target.value})}/><Button type="submit" variant="contained">Search again</Button></form>:<Button onClick={()=>setEditing(true)}>Not the right book?</Button>)}
    </>}
    {guideSection&&<><h2 dir="auto">{guideSection.title}</h2>{summaryParagraphs(guideSection.items)}<p className="doc-src">Built from the checked chapter summaries and checked again against them. Consult the book.</p></>}
    {tab==='guide'&&current&&<>
     <h2 dir="auto">{strip(current.title)}</h2>
     <div className="doc-bar">
      <Button size="small" onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button>
      <Button size="small" startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button>
      <span className="grow"/>
      <Button size="small" variant="contained" startIcon={<AutoAwesomeRounded/>} disabled={generating||chapter.id!==current.id} onClick={onGenerate}>{generating?'Summarizing…':aiLabel}</Button>
     </div>
     {generating&&<div className="doc-status"><LinearProgress/><span>Summarizing… <button onClick={onCancel}>Cancel</button></span></div>}
     {generationError&&chapter.id===current.id&&<Alert severity="error" sx={{mb:2}}>{generationError}</Alert>}
     {chapterSummary?<>{summaryParagraphs(chapterSummary.paragraphs,current)}{chapterSummary.review.length>0&&<><h3 className="doc-h">Critique</h3>{summaryParagraphs(chapterSummary.review,current)}</>}<p className="doc-src">AI summary{chapterSummary.model?' · '+chapterSummary.model:''}{spent!=null?' · '+money(spent):''}. Checked against the source passages.</p></>
      :!generating&&<><p className="doc-src">No summary yet. These are the opening passages of the chapter:</p>{selectedPassages(current,'glance').map(({block,text})=>passage(block,text,block.id,current))}</>}
     {pager(current)}
    </>}
    {tab==='text'&&<>
     <h2 dir="auto">{strip(chapter.title)}</h2>
     <div className="doc-bar"><ToggleButtonGroup size="small" exclusive value={textMode} onChange={(_,v)=>{if(v)setTextMode(v);}} aria-label="Text view"><ToggleButton value="full">Full text</ToggleButton><ToggleButton value="highlights">Highlights</ToggleButton></ToggleButtonGroup>{textMode==='highlights'&&<Button size="small" onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button>}</div>
     {textMode==='full'?chapter.blocks.map(b=>passage(b,b.text,b.id,chapter)):selectedPassages(chapter,settings.depth).map(({block,text})=>passage(block,text,block.id,chapter))}
     {pager(chapter)}
    </>}
   </article>
  </div>
  <Menu anchorEl={depthMenu} open={!!depthMenu} onClose={()=>setDepthMenu(null)}>{(Object.keys(depthLabels) as Depth[]).map(d=><MenuItem key={d} selected={d===settings.depth} onClick={()=>{onPreferences({depth:d});setDepthMenu(null);}}>{depthLabels[d]}</MenuItem>)}</Menu>
  <Popover open={!!opts} anchorEl={opts} onClose={()=>setOpts(null)} slotProps={{paper:{className:'opts-pop'}}}>
   <TextField select size="small" fullWidth label="Purpose" value={settings.purpose} onChange={e=>onPreferences({purpose:e.target.value as Settings['purpose']})}><MenuItem value="understand">Understand</MenuItem><MenuItem value="learn">Learn</MenuItem><MenuItem value="academic">Academic</MenuItem><MenuItem value="apply">Apply</MenuItem></TextField>
   <TextField select size="small" fullWidth label="Language" value={settings.language} onChange={e=>onPreferences({language:e.target.value})}>{languages.map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>
   <label className="opts-switch"><span>Include critique</span><Switch checked={settings.review==='internal'} onChange={e=>onPreferences({review:e.target.checked?'internal':'off'})}/></label>
  </Popover>
 </div>;
}
