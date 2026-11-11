import{lazy,Suspense,useEffect,useMemo,useRef,useState}from'react';
import{Alert,Button,CircularProgress,IconButton,LinearProgress,Menu,MenuItem,Popover,Switch,TextField,ToggleButton,ToggleButtonGroup}from'@mui/material';
import{AutoAwesomeRounded,BookmarkBorderRounded,BookmarkRounded,DownloadRounded,EditOutlined,ExpandMoreRounded,FileUploadOutlined,GraphicEqRounded,ImageOutlined,OpenInNewRounded,PauseRounded,PlayArrowRounded,StarRounded,TuneRounded}from'@mui/icons-material';
import type{Account,Block,Book,BookInfo,BookReport,Chapter,Depth,GoogleBookEdition,ImportedSummaries,ImportedSummary,SavedPassage,Settings,Summary,SummaryParagraph}from'./types';
import{ApiError,bookInfo,coverImage,narrate,pdfReport}from'./api';
import{store}from'./storage';
import{referenceLabels,reportComplete}from'./book-summary';
import{bodyChapter,bookWords,depthLabels,displayName,isHeading,languages,readingTime,sectionKind}from'./core';
import{costRange,estimateChapter,money,usageCost}from'./cost';
import type{Price}from'./cost';
import Cover from'./Cover';import{Logo}from'./Header';
import GoogleBooksDialog from'./GoogleBooksDialog';

const SummaryImportDialog=lazy(()=>import('./SummaryImportDialog'));
const ImportedSummaryView=lazy(()=>import('./ImportedSummaryView'));

interface Props{
 book:Book;chapter:Chapter;settings:Settings;account:Account|null;price:Price|null;saved:SavedPassage[];cover:string;reportVersion:number;
 summary:Summary|null;generating:boolean;generationError:string;
 onCover:(blob:Blob,source:'file'|'online',url?:string)=>Promise<void>;onCreate:()=>void;onAccount:()=>void;onPreferences:(patch:Partial<Settings>)=>void;
 onGenerate:()=>void;onCancel:()=>void;onBookmark:(block:Block,wording:string,chapter:Chapter)=>void;onEvidence:(block:Block,wording:string,chapter:Chapter)=>void;
 onChoose:(index:number)=>void;onExport:()=>void;onEditContents:()=>void;onFinished:()=>void;onRebuild:()=>Promise<void>;
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
export default function BookPage({book,chapter,settings,account,price,saved,cover,reportVersion,summary,generating,generationError,onCover,onCreate,onAccount,onPreferences,onGenerate,onCancel,onBookmark,onEvidence,onChoose,onExport,onEditContents,onFinished,onRebuild}:Props){
 const[report,setReport]=useState<BookReport>(),[info,setInfo]=useState<BookInfo|null>(null),[infoState,setInfoState]=useState<'loading'|'ready'|'none'>('loading');
 const[tab,setTab]=useState<'guide'|'text'|'imported'>('guide'),[section,setSection]=useState('overview'),[reportLoaded,setReportLoaded]=useState(false),[coverMenu,setCoverMenu]=useState<HTMLElement|null>(null),[rebuilding,setRebuilding]=useState(false);
 const[importedSummaries,setImportedSummaries]=useState<ImportedSummaries|null>(null),[selectedImport,setSelectedImport]=useState('');
 const[summaryImportMode,setSummaryImportMode]=useState<'edit'|'new'|null>(null);
 const[query,setQuery]=useState({title:book.title,author:book.author==='Author not supplied'?'':book.author}),[editing,setEditing]=useState(false);
 const[editionOpen,setEditionOpen]=useState(false);
 const[navOpen,setNavOpen]=useState({guide:true,chapters:true,front:false,back:false}),[opts,setOpts]=useState<HTMLElement|null>(null),[depthMenu,setDepthMenu]=useState<HTMLElement|null>(null);
 const[busy,setBusy]=useState(''),[error,setError]=useState('');
 const[engine,setEngine]=useState<'offline'|'elevenlabs'>('offline'),[queue,setQueue]=useState<{title:string;text:string}[]>([]),[track,setTrack]=useState(0),[ready,setReady]=useState<string[]>([]),[playing,setPlaying]=useState(false);
 const audio=useRef<HTMLAudioElement>(null),narration=useRef<AbortController|null>(null);
 const language=report?.language||settings.language;
 const importLanguage=selectedImport||importedSummaries?.latestLanguage||settings.language;
 const importedSummary=importedSummaries?.versions[importLanguage];
 const importLanguages=Object.keys(importedSummaries?.versions??{});
 useEffect(()=>{let live=true;store.latestReport(book.id).then(key=>key?store.report(key):undefined).then(r=>{if(live){setReport(r);setReportLoaded(true);}}).catch(()=>{});return()=>{live=false;};},[book.id,reportVersion]);
 useEffect(()=>{let live=true;store.importedSummaries(book.id).then(value=>{if(live){setImportedSummaries(value);if(value)setTab(current=>current==='guide'?'imported':current);}}).catch(()=>{});return()=>{live=false;};},[book.id]);
 async function openSummaryImport(mode:'edit'|'new'){
  try{setImportedSummaries(await store.importedSummaries(book.id));setSummaryImportMode(mode);}
  catch{setError('Could not open the saved summary on this device.');}
 }
 function showImportedSummary(){
  setTab('imported');
  requestAnimationFrame(()=>tabs.current?.scrollIntoView({block:'start'}));
 }
 async function saveImportedSummary(value:ImportedSummary,language:string){
  setImportedSummaries(await store.saveImportedSummary(book.id,language,value));
  setSelectedImport(language);
  setSummaryImportMode(null);
  showImportedSummary();
 }
 async function useOnlineCover(url:string){await onCover(await coverImage(url),'online',url);}
 async function showInfo(result:BookInfo,replace=false){
  setInfo(result);setInfoState('ready');
  const stored=await store.cover(book.id),url=result.covers[0];
  if(url&&(!stored||(replace&&stored.source==='online')))await useOnlineCover(url);
 }
 async function lookup(title:string,author:string,force=false){
  setInfoState('loading');
  try{
   const saved=force?undefined:await store.info(book.id);
   const result=saved||await store.saveInfo(book.id,await bookInfo(title,author),force);
   void showInfo(result,force).catch(()=>{});
  }catch{setInfoState(info?'ready':'none');}
 }
 async function chooseEdition(edition:GoogleBookEdition){
  const result=await store.saveInfo(book.id,await bookInfo('','',edition.id),true);
  void showInfo(result,true).catch(()=>{});
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
 const upload=useRef<HTMLInputElement>(null);
 // Books imported before cleaner extraction are re-read automatically when nothing depends on their old passages.
 const outdated=(book.format==='PDF'||book.format==='EPUB')&&!book.demo&&(book.importVersion||1)<2;
 useEffect(()=>{
  if(!reportLoaded||!outdated||rebuilding)return;
  if(!report&&!saved.some(x=>x.bookId===book.id)){setRebuilding(true);onRebuild().catch(e=>setError((e as Error).message)).finally(()=>setRebuilding(false));}
 },[reportLoaded,outdated]);
 useEffect(()=>{if(cover||book.demo)return;store.cover(book.id).then(c=>{if(!c&&(book.format==='PDF'||book.format==='EPUB'))coverFromFile();}).catch(()=>{});},[book.id]);
 const author=displayName(info?.authors[0]||(book.author==='Author not supplied'?'':book.author));
 const kinds=book.chapters.map((c,i)=>sectionKind(c,i,book.chapters));
 const groups=[{key:'chapters' as const,label:'Chapters',items:book.chapters.filter((_,i)=>kinds[i]==='main')},{key:'front' as const,label:'Front matter',items:book.chapters.filter((_,i)=>kinds[i]==='front')},{key:'back' as const,label:'Back matter',items:book.chapters.filter((_,i)=>kinds[i]==='back')}].filter(g=>g.items.length);
 const guideSections=useMemo(()=>[{id:'overview',label:'Overview'},{id:'glance',label:'At a glance'},...(report?.guide?.sections||[]).map(s=>({id:'g:'+s.kind,label:s.title}))],[report]);
 const strip=(t:string)=>t.replace(/^\d+[.\s]+/,'');
 const rtl=(lang?:string)=>lang&&['fa','ar'].includes(lang)?'rtl':'ltr';
 const current=section.startsWith('c:')?book.chapters.find(c=>c.id===section.slice(2)):undefined;
 const guideSection=section.startsWith('g:')?report?.guide?.sections.find(s=>'g:'+s.kind===section):undefined;
 const chapterSummary=current?((summary&&chapter.id===current.id)?summary:report?.chapters[current.id]):undefined;
 const kept=(block:Block)=>saved.some(s=>s.bookId===book.id&&s.blockId===block.id);
 const spent=usageCost(chapterSummary?.usage,price);
 const aiLabel=!account?'Log in to summarize':!account.key?'Add your Gemini key':chapterSummary?'Summarize again':'Summarize this chapter';
 const estimate=current&&price?costRange(estimateChapter(current,settings),price).likely:null;
 const tabs=useRef<HTMLDivElement>(null);
 // Changing chapter brings the text into view instead of the book header.
 function pick(c:Chapter){onChoose(book.chapters.indexOf(c));if(tab==='guide')setSection('c:'+c.id);requestAnimationFrame(()=>{const top=(tabs.current?.getBoundingClientRect().top||0)+scrollY-72;if(scrollY>top||scrollY<top-400)scrollTo({top});});}
 function summaryParagraphs(items:SummaryParagraph[],c?:Chapter){
  return items.map((p,i)=><div className="doc-p" key={i}>{p.heading&&<h3 dir="auto">{p.heading}</h3>}<p dir="auto">{p.text}<span className="refs">{c?[...new Map(p.evidence_ids.map(id=>c.blocks.find(b=>b.id===id)).filter((b):b is Block=>!!b).map(b=>[b.page??b.id,b])).values()].map(b=><button key={b.id} onClick={()=>onEvidence(b,b.text,c)}>{b.page?'p. '+b.page:'¶'}</button>):p.evidence_ids.map(id=>{const ch=book.chapters.find(x=>x.id===id);return ch?<button key={id} onClick={()=>pick(ch)}>{strip(ch.title).slice(0,40)}</button>:null;})}</span></p></div>);
 }
 // Original text reads as a book page: headings, flowing paragraphs, page numbers in the margin, notes at the end.
 function original(c:Chapter){
  let page:number|undefined;const notes=c.blocks.filter(b=>b.note);
  // PDFs repeat the chapter title as the first line of text; the page heading already shows it.
  const words=(t:string)=>new Set(t.toLowerCase().match(/\p{L}{3,}/gu)||[]);const titleWords=words(c.title);
  const body=c.blocks.filter(b=>!b.note);
  const first=body[0]&&body[0].text.length<300&&[...words(body[0].text)].filter(w=>titleWords.has(w)).length>=Math.min(4,titleWords.size*.7)?1:0;
  return <>{body.slice(first).map(b=>{
   const marker=b.page!==page?b.page:undefined;page=b.page;
   if(isHeading(b.text))return <h3 key={b.id} className="text-h" dir="auto">{b.text}</h3>;
   return <div className="text-p" key={b.id}>{marker&&<button className="folio" onClick={()=>onEvidence(b,b.text,c)} aria-label={'Page '+marker}>{marker}</button>}<p dir="auto">{b.text}</p><IconButton className="keep" size="small" aria-label={kept(b)?'Unsave passage':'Save passage'} onClick={()=>onBookmark(b,b.text,c)}>{kept(b)?<BookmarkRounded fontSize="inherit"/>:<BookmarkBorderRounded fontSize="inherit"/>}</IconButton></div>;
  })}{notes.length>0&&<details className="notes"><summary>Notes ({notes.length})</summary>{notes.map(b=><p key={b.id} dir="auto"><button className="folio-inline" onClick={()=>onEvidence(b,b.text,c)}>p. {b.page}</button> {b.text}</p>)}</details>}</>;
 }
 const finished=(c:Chapter)=>book.completed.includes(c.id);
 function pager(c:Chapter){const i=book.chapters.indexOf(c),next=book.chapters[i+1],prev=book.chapters[i-1];return <nav className="doc-pager" aria-label="Chapters">{prev?<button className="pg prev" onClick={()=>pick(prev)}><small>Previous</small><span dir="auto">{strip(prev.title)}</span></button>:<span/>}{next?<button className="pg next" onClick={()=>pick(next)}><small>Next</small><span dir="auto">{strip(next.title)}</span></button>:<span/>}<button className="pg-read" onClick={onFinished}>{finished(c)?'Marked as read ✓':'Mark this chapter as read'}</button></nav>;}
 const fileCover=book.format==='PDF'||book.format==='EPUB';
 return <div className="book">
  <section className="book-head">
   <div className="bk-card"><div className="card-top"><span className="card-brand"><Logo dark/>Summ</span><span className="card-tag">Study guide</span></div><h2 dir="auto">{book.title}</h2><p className="card-author" dir="auto">{author}</p><Cover book={book} url={cover} className="bk-cover"/></div>
   <div className="book-main">
    <h1 dir="auto">{book.title}</h1>
    {author&&<p className="book-author" dir="auto">{author}</p>}
    <p className="book-meta">{info?.pages?info.pages+' pages · ':''}{readingTime(bookWords({...book,chapters:book.chapters.map(bodyChapter)}))}{info?.year?' · '+info.year:''}</p>
    {(report?.guide||info?.categories.length||info?.ratings.length)?<div className="tags">{[report?.guide?.type_label,...(info?.categories||[]).slice(0,3)].filter(Boolean).map(t=><span key={t} className="tag">{t}</span>)}{info?.ratings.map(r=><a key={r.source} className="tag rate" href={r.url||'#'} target="_blank" rel="noopener noreferrer"><StarRounded fontSize="inherit"/>{r.rating.toFixed(1)}{r.count?' ('+r.count.toLocaleString()+')':''} · {r.source}</a>)}</div>:null}
    {info?.description&&<p className="book-blurb" dir="auto">{info.description.slice(0,260)}{info.description.length>260?'…':''}</p>}
    <div className="book-actions">
     {complete?<Button variant="contained" startIcon={busy==='pdf'?<CircularProgress size={16} color="inherit"/>:<DownloadRounded/>} disabled={!!busy} onClick={downloadPdf}>{busy==='pdf'?'Typesetting…':'Download PDF'}</Button>:<Button variant="contained" startIcon={<AutoAwesomeRounded/>} onClick={onCreate}>{chapters.length?'Finish the study guide':'Create study guide'}</Button>}
     <Button variant="outlined" startIcon={<FileUploadOutlined/>} onClick={importedSummary?showImportedSummary:()=>void openSummaryImport('new')}>{importedSummary?'Read imported summary':'Import summary'}</Button>
     {chapters.length>0&&<Button variant="outlined" startIcon={<GraphicEqRounded/>} onClick={listen}>Listen</Button>}
     <IconButton className="ring" aria-label="Edit contents" title="Edit contents" onClick={onEditContents}><EditOutlined/></IconButton>
     <IconButton className="ring" aria-label="Export notes" title="Export notes" onClick={onExport}><DownloadRounded/></IconButton>
     {!book.demo&&<IconButton className="ring" aria-label="Change cover" title="Change cover" onClick={e=>setCoverMenu(e.currentTarget)}><ImageOutlined/></IconButton>}
    </div>
   </div>
  </section>
  {rebuilding&&<Alert severity="info" icon={<CircularProgress size={18}/>}>Re-reading the file with cleaner text extraction…</Alert>}
  {outdated&&!rebuilding&&reportLoaded&&(report||saved.some(x=>x.bookId===book.id))&&<Alert severity="info" action={<Button onClick={()=>{setRebuilding(true);onRebuild().catch(e=>setError((e as Error).message)).finally(()=>setRebuilding(false));}}>Re-read file</Button>}>Cleaner text extraction is available for this book. Re-reading it resets its summaries and saved passages.</Alert>}
  <div className="book-tabs" role="tablist" ref={tabs}><button role="tab" aria-selected={tab==='guide'} className={tab==='guide'?'on':''} onClick={()=>setTab('guide')}>Study guide</button><button role="tab" aria-selected={tab==='text'} className={tab==='text'?'on':''} onClick={()=>setTab('text')}>Original text</button>{importedSummary&&<button role="tab" aria-selected={tab==='imported'} className={tab==='imported'?'on':''} onClick={()=>setTab('imported')}>Imported summary</button>}</div>
  {error&&<Alert severity="error" sx={{mt:2}} onClose={()=>setError('')}>{error}</Alert>}
  {queue.length>0&&<div className="guide-player" role="region" aria-label="Narration">
   <Button aria-label={playing?'Pause narration':'Play narration'} variant="contained" onClick={()=>{if(!audio.current)return;if(playing){audio.current.pause();setPlaying(false);}else if(ready[track]){audio.current.src||=ready[track];audio.current.play().then(()=>setPlaying(true)).catch(()=>{});}}}>{playing?<PauseRounded/>:<PlayArrowRounded/>}</Button>
   <div><strong dir="auto">{queue[track]?.title}</strong><span>Part {track+1} of {queue.length} · {ready.length<queue.length?'preparing '+(ready.length+1)+' of '+queue.length+'…':'all parts ready'}</span><LinearProgress variant="determinate" value={ready.length/queue.length*100}/></div>
   <audio ref={audio} onEnded={next} onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)}/>
  </div>}
  {tab==='imported'&&importedSummary?<div className="book-body imported-summary-body">
   <div className="summary-file-actions">
    {importLanguages.length>1&&<TextField select size="small" label="Imported summary language" value={importLanguage} onChange={event=>setSelectedImport(event.target.value)}>{languages.filter(option=>importLanguages.includes(option.code)).map(option=><MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>)}</TextField>}
    <Button startIcon={<EditOutlined/>} onClick={()=>void openSummaryImport('edit')}>Edit imported summary</Button>
    <Button onClick={()=>void openSummaryImport('new')}>Add another language</Button>
   </div>
   <Suspense fallback={<CircularProgress aria-label="Opening imported summary"/>}><ImportedSummaryView key={importLanguage} summary={importedSummary} language={importLanguage} expectedChapters={groups.find(group=>group.key==='chapters')?.items.length??0}/></Suspense>
  </div>:<div className="book-body">
   <nav className="doc-nav" aria-label="Sections">
    {tab==='guide'&&<><button className="nav-head" aria-expanded={navOpen.guide} onClick={()=>setNavOpen({...navOpen,guide:!navOpen.guide})}>Study guide<ExpandMoreRounded className={navOpen.guide?'open':''}/></button>
     {navOpen.guide&&guideSections.map(s=><button key={s.id} className={'nav-item'+(section===s.id?' on':'')} onClick={()=>setSection(s.id)} dir="auto">{s.label}</button>)}</>}
    {groups.map(g=><div key={g.key}><button className="nav-head" aria-expanded={navOpen[g.key]} onClick={()=>setNavOpen({...navOpen,[g.key]:!navOpen[g.key]})}>{g.label}<ExpandMoreRounded className={navOpen[g.key]?'open':''}/></button>
     {navOpen[g.key]&&g.items.map(c=><button key={c.id} className={'nav-item'+((tab==='guide'?section==='c:'+c.id:chapter.id===c.id)?' on':'')+(finished(c)?' done':'')+(report?.chapters[c.id]?' has':'')} onClick={()=>pick(c)} dir="auto">{c.title}</button>)}</div>)}
    {tab==='guide'&&chapters.length>0&&<div className="nav-listen"><ToggleButtonGroup size="small" exclusive fullWidth value={engine} onChange={(_,v)=>{if(v)setEngine(v);}} aria-label="Voice"><ToggleButton value="offline">Offline voice</ToggleButton><ToggleButton value="elevenlabs" disabled={!account?.voice}>ElevenLabs</ToggleButton></ToggleButtonGroup>
     <small>{narrationChars.toLocaleString()} characters · about {Math.max(1,Math.round(narrationChars/900))} min of audio · {engine==='offline'?'free':'≈ '+money(narrationChars/1000*ELEVEN_PER_1K)}</small></div>}
   </nav>
   <article className="doc">
    {tab==='guide'&&section==='overview'&&<>
     <h2>Summary and study guide</h2>
     {report?.overview?<div dir={rtl(report.language)}><h3 className="doc-h">Overview</h3>{summaryParagraphs(report.overview.paragraphs)}<div className="doc-box"><strong>Key takeaways</strong><ul>{report.overview.takeaways.map((t,i)=><li key={i} dir="auto">{t.text}</li>)}</ul></div></div>
     :<>{info?.description&&<><h3 className="doc-h">About the book</h3><p dir="auto">{info.description}</p></>}
      <div className="doc-box"><strong>{chapters.length?'Your study guide is partly done':'No study guide yet'}</strong><p>{chapters.length?chapters.length+' of '+book.chapters.filter((_,i)=>kinds[i]==='main').length+' chapters are summarized. Resume to finish the overview and the guide.':'Summ summarizes each chapter, checks every summary against your text, then adds sections that fit this book. You see the cost before anything runs.'}</p><Button variant="contained" onClick={onCreate}>{chapters.length?'Resume':'Create study guide'}</Button></div></>}
    </>}
    {tab==='guide'&&section==='glance'&&<>
     <h2>At a glance</h2>
     {infoState==='loading'?<div className="guide-loading"><CircularProgress size={20}/> Looking the book up…</div>:infoState==='none'||!info?<p>No public record was found for this book.</p>:<>
      <dl className="facts">{info.year&&<div><dt>Published</dt><dd>{info.google_edition?.published_date||info.year}</dd></div>}{info.pages&&<div><dt>Length</dt><dd>{info.pages} pages</dd></div>}{info.google_edition?.publisher&&<div><dt>Publisher</dt><dd dir="auto">{info.google_edition.publisher}</dd></div>}{!!info.google_edition?.isbns.length&&<div><dt>ISBN</dt><dd>{info.google_edition.isbns.join(' · ')}</dd></div>}{info.readers&&<div><dt>Open Library readers</dt><dd>{info.readers.toLocaleString()}</dd></div>}{info.ratings.map(r=><div key={r.source}><dt>{r.source}</dt><dd>{r.rating.toFixed(2)} / 5{r.count?' · '+r.count.toLocaleString():''}</dd></div>)}</dl>
      {info.wikipedia&&<><h3 className="doc-h">Background and reception</h3><p dir="auto">{info.wikipedia.extract}</p><p className="doc-src">From <a href={info.wikipedia.url} target="_blank" rel="noopener noreferrer">Wikipedia</a> · {info.wikipedia.license}</p></>}
      <h3 className="doc-h">Reviews elsewhere</h3><div className="links">{info.links.map(l=><a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer">{l.name}<OpenInNewRounded fontSize="inherit"/></a>)}</div></>}
     {!book.demo&&(editing?<form className="guide-edit" onSubmit={e=>{e.preventDefault();setEditing(false);lookup(query.title,query.author,true);}}><TextField size="small" label="Title" value={query.title} onChange={e=>setQuery({...query,title:e.target.value})}/><TextField size="small" label="Author" value={query.author} onChange={e=>setQuery({...query,author:e.target.value})}/><Button type="submit" variant="contained">Search again</Button></form>:<Button onClick={()=>setEditing(true)}>Not the right book?</Button>)}
     {!book.demo&&<Button disabled={infoState==='loading'} onClick={()=>setEditionOpen(true)}>Choose edition</Button>}
    </>}
    {tab==='guide'&&guideSection&&<div dir={rtl(report?.language)}><h2 dir="auto">{guideSection.title}</h2>{summaryParagraphs(guideSection.items)}</div>}
    {tab==='guide'&&current&&<>
     <h2 dir="auto">{strip(current.title)}</h2>
     {chapterSummary?<>
      <div className="doc-bar"><span className="doc-src">AI summary{chapterSummary.model?' · '+chapterSummary.model:''}{spent!=null?' · '+money(spent):''}</span><span className="grow"/><Button size="small" onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button><Button size="small" startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button><Button size="small" disabled={generating||chapter.id!==current.id} onClick={onGenerate}>{generating?'Summarizing…':'Redo'}</Button></div>
      {generating&&<div className="doc-status"><LinearProgress/><span>Summarizing… <button onClick={onCancel}>Cancel</button></span></div>}
      <div dir={rtl(chapterSummary.language)}>{summaryParagraphs(chapterSummary.paragraphs,current)}{chapterSummary.review.length>0&&<><h3 className="doc-h">Critique</h3>{summaryParagraphs(chapterSummary.review,current)}</>}</div></>
     :<div className="doc-box">
      <strong>This chapter isn't summarized yet</strong>
      <p>{bookWords({...book,chapters:[bodyChapter(current)]}).toLocaleString()} words of text{estimate!=null?' · about '+money(estimate)+' with your Gemini key':''}.</p>
      <div className="box-actions"><Button variant="contained" startIcon={generating?<CircularProgress size={16} color="inherit"/>:<AutoAwesomeRounded/>} disabled={generating||chapter.id!==current.id} onClick={onGenerate}>{generating?'Summarizing…':aiLabel}</Button><Button onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button><Button startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button><Button onClick={()=>setTab('text')}>Read the original</Button></div>
      {generating&&<div className="doc-status"><LinearProgress/><span>Reading the chapter and checking each paragraph against it… <button onClick={onCancel}>Cancel</button></span></div>}
      {generationError&&chapter.id===current.id&&<Alert severity="error" sx={{mt:2}}>{generationError}</Alert>}
     </div>}
     {pager(current)}
    </>}
    {tab==='text'&&<><h2 dir="auto">{strip(chapter.title)}</h2>{original(chapter)}{pager(chapter)}</>}
   </article>
  </div>}
  {summaryImportMode&&<Suspense fallback={<LinearProgress aria-label="Opening summary importer"/>}><SummaryImportDialog book={book} language={summaryImportMode==='edit'?importLanguage:[settings.language,'fa','en'].find(code=>!importLanguages.includes(code))??settings.language} initial={summaryImportMode==='edit'?importedSummary??null:null} existingLanguages={importLanguages} onClose={()=>setSummaryImportMode(null)} onSave={saveImportedSummary}/></Suspense>}
  {editionOpen&&<GoogleBooksDialog initialQuery={[query.title,query.author].filter(Boolean).join(' ')} onClose={()=>setEditionOpen(false)} onChoose={chooseEdition}/>}
  <Menu anchorEl={depthMenu} open={!!depthMenu} onClose={()=>setDepthMenu(null)}>{(Object.keys(depthLabels) as Depth[]).map(d=><MenuItem key={d} selected={d===settings.depth} onClick={()=>{onPreferences({depth:d});setDepthMenu(null);}}>{depthLabels[d]}</MenuItem>)}</Menu>
  <Menu anchorEl={coverMenu} open={!!coverMenu} onClose={()=>setCoverMenu(null)}>
   {fileCover&&<MenuItem onClick={()=>{setCoverMenu(null);coverFromFile();}}>{book.format==='PDF'?'Use a page from the PDF':'Use the EPUB cover'}</MenuItem>}
   <MenuItem disabled={!info?.covers.length} onClick={()=>{setCoverMenu(null);if(info?.covers[0])useOnlineCover(info.covers[0]).catch(e=>setError(e.message));}}>Use the cover found online</MenuItem>
   <MenuItem onClick={()=>{setCoverMenu(null);upload.current?.click();}}>Upload an image…</MenuItem>
  </Menu>
  <input ref={upload} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)onCover(f,'file');e.target.value='';}}/>
  <Popover open={!!opts} anchorEl={opts} onClose={()=>setOpts(null)} slotProps={{paper:{className:'opts-pop'}}}>
   <TextField select size="small" fullWidth label="Purpose" value={settings.purpose} onChange={e=>onPreferences({purpose:e.target.value as Settings['purpose']})}><MenuItem value="understand">Understand</MenuItem><MenuItem value="learn">Learn</MenuItem><MenuItem value="academic">Academic</MenuItem><MenuItem value="apply">Apply</MenuItem></TextField>
   <TextField select size="small" fullWidth label="Summary language" value={settings.language} onChange={e=>onPreferences({language:e.target.value})}>{languages.map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>
   <label className="opts-switch"><span>Include critique</span><Switch checked={settings.review==='internal'} onChange={e=>onPreferences({review:e.target.checked?'internal':'off'})}/></label>
  </Popover>
 </div>;
}
