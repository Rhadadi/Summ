import{useEffect,useMemo,useRef,useState}from'react';
import{Alert,Button,Chip,CircularProgress,LinearProgress,TextField,ToggleButton,ToggleButtonGroup}from'@mui/material';
import{ArrowBackRounded,AutoStoriesRounded,DownloadRounded,EditOutlined,GraphicEqRounded,ImageOutlined,MenuBookRounded,OpenInNewRounded,PauseRounded,PlayArrowRounded,StarRounded}from'@mui/icons-material';
import type{Account,Book,BookInfo,BookReport,Chapter,Settings,SummaryParagraph}from'./types';
import{ApiError,bookInfo,coverImage,narrate,pdfReport}from'./api';
import{store}from'./storage';
import{referenceLabels,reportComplete}from'./book-summary';
import{bookWords,minutes}from'./core';
import{money}from'./cost';

interface Props{book:Book;settings:Settings;account:Account|null;cover:string;reportVersion:number;onCover:(blob:Blob,source:'file'|'online')=>void;onCreate:()=>void;onAccount:()=>void;onRead:(index:number)=>void;onBack:()=>void}
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
export default function GuidePage({book,settings,account,cover,reportVersion,onCover,onCreate,onAccount,onRead,onBack}:Props){
 const[report,setReport]=useState<BookReport>(),[info,setInfo]=useState<BookInfo|null>(null),[infoState,setInfoState]=useState<'loading'|'ready'|'none'>('loading');
 const[section,setSection]=useState('overview'),[query,setQuery]=useState({title:book.title,author:book.author==='Author not supplied'?'':book.author}),[editing,setEditing]=useState(false);
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
 const sections=useMemo(()=>[{id:'overview',label:'Overview'},{id:'glance',label:'At a glance & reception'},...(report?.guide?.sections||[]).map(s=>({id:'g:'+s.kind,label:s.title}))],[report]);
 const readMinutes=minutes(bookWords(book));
 function paragraphs(items:SummaryParagraph[],chapter?:Chapter){
  return items.map((p,i)=><div className="guide-paragraph" key={i}>{p.heading&&<h3 dir="auto">{p.heading}</h3>}<p dir="auto">{p.text}</p><div className="guide-refs">{chapter?referenceLabels(book,chapter,p).map(label=><span key={label}>{label}</span>):p.evidence_ids.map(id=>{const c=book.chapters.find(c=>c.id===id);return c?<button key={id} onClick={()=>setSection('c:'+id)}>{c.title}</button>:null;})}</div></div>);
 }
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
 const current=section.startsWith('c:')?book.chapters.find(c=>c.id===section.slice(2)):undefined;
 const guideSection=section.startsWith('g:')?report?.guide?.sections.find(s=>'g:'+s.kind===section):undefined;
 return <div className="guide-page" dir="ltr">
  <Button className="guide-back" startIcon={<ArrowBackRounded/>} onClick={onBack}>Reader</Button>
  <header className="guide-hero">
   <div className="guide-cover">{cover?<img src={cover} alt={'Cover of '+book.title}/>:<div className="guide-cover-blank"><AutoStoriesRounded/><span dir="auto">{book.title}</span></div>}</div>
   <div className="guide-heading">
    <span className="eyebrow">{report?.guide?.type_label?report.guide.type_label+' · ':''}Study guide</span>
    <h1 dir="auto">{book.title}</h1>
    <p className="guide-author" dir="auto">{info?.authors[0]||book.author}</p>
    <p className="guide-meta"><MenuBookRounded fontSize="small"/>{info?.pages?info.pages+' pages · ':''}{readMinutes} min original{info?.year?' · first published '+info.year:''}</p>
    <div className="guide-pills">{(info?.categories||[]).slice(0,5).map(c=><Chip key={c} size="small" label={c}/>)}</div>
    {!!info?.ratings.length&&<div className="guide-ratings">{info.ratings.map(r=><a key={r.source} href={r.url||'#'} target="_blank" rel="noopener noreferrer"><StarRounded fontSize="small"/><strong>{r.rating.toFixed(2)}</strong><span>{r.count?r.count.toLocaleString()+' ratings · ':''}{r.source}</span></a>)}</div>}
    <div className="guide-actions">
     {complete?<Button variant="contained" startIcon={busy==='pdf'?<CircularProgress size={16} color="inherit"/>:<DownloadRounded/>} disabled={!!busy} onClick={downloadPdf}>{busy==='pdf'?'Typesetting…':'Download PDF'}</Button>:<Button variant="contained" startIcon={<AutoStoriesRounded/>} onClick={onCreate}>{chapters.length?'Finish the study guide':'Create the study guide'}</Button>}
     <Button variant="outlined" startIcon={<GraphicEqRounded/>} disabled={!chapters.length} onClick={listen}>Listen</Button>
     {!book.demo&&<Button startIcon={<ImageOutlined/>} disabled={!!busy} onClick={()=>book.format==='PDF'||book.format==='EPUB'?coverFromFile():info?.covers[0]&&coverImage(info.covers[0]).then(b=>onCover(b,'online'))}>{book.format==='PDF'||book.format==='EPUB'?'Cover from file':'Cover from web'}</Button>}
    </div>
   </div>
  </header>
  {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
  {queue.length>0&&<div className="guide-player" role="region" aria-label="Narration">
   <Button aria-label={playing?'Pause narration':'Play narration'} variant="contained" onClick={()=>{if(!audio.current)return;if(playing){audio.current.pause();setPlaying(false);}else if(ready[track]){audio.current.src||=ready[track];audio.current.play().then(()=>setPlaying(true)).catch(()=>{});}}}>{playing?<PauseRounded/>:<PlayArrowRounded/>}</Button>
   <div><strong dir="auto">{queue[track]?.title}</strong><span>Part {track+1} of {queue.length} · {ready.length<queue.length?'preparing '+(ready.length+1)+' of '+queue.length+'…':'all parts ready'}</span><LinearProgress variant="determinate" value={ready.length/queue.length*100}/></div>
   <audio ref={audio} onEnded={next} onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)}/>
  </div>}
  <div className="guide-body">
   <nav className="guide-nav" aria-label="Study guide sections">
    <p className="guide-nav-label">Study guide</p>
    {sections.map(s=><button key={s.id} className={section===s.id?'active':''} onClick={()=>setSection(s.id)} dir="auto">{s.label}</button>)}
    <p className="guide-nav-label">Chapter summaries</p>
    {book.chapters.map(c=><button key={c.id} className={section==='c:'+c.id?'active':''} disabled={!report?.chapters[c.id]} onClick={()=>setSection('c:'+c.id)} dir="auto">{c.title}</button>)}
    <p className="guide-nav-label">Listen</p>
    <div className="guide-listen">
     <ToggleButtonGroup size="small" exclusive fullWidth value={engine} onChange={(_,v)=>{if(v)setEngine(v);}} aria-label="Voice"><ToggleButton value="offline">Offline voice</ToggleButton><ToggleButton value="elevenlabs" disabled={!account?.voice}>ElevenLabs</ToggleButton></ToggleButtonGroup>
     <small>{narrationChars?<>{narrationChars.toLocaleString()} characters · about {Math.max(1,Math.round(narrationChars/900))} min of audio · {engine==='offline'?'free, generated on the server':'≈ '+money(narrationChars/1000*ELEVEN_PER_1K)+' on your ElevenLabs plan'}</>:'Create the study guide to listen to it.'}{!account?.voice&&<> · <button className="text-link" onClick={onAccount}>Add an ElevenLabs key</button></>}</small>
    </div>
   </nav>
   <article className="guide-content" dir={['fa','ar'].includes(language)?'rtl':'ltr'}>
    {section==='overview'&&<>
     <h2>Overview</h2>
     {report?.overview?<>{paragraphs(report.overview.paragraphs)}<div className="guide-callout"><span className="eyebrow">Key takeaways</span><ul>{report.overview.takeaways.map((t,i)=><li key={i} dir="auto">{t.text}</li>)}</ul></div></>
     :<>{info?.description&&<><p dir="auto">{info.description}</p><p className="guide-source">Publisher description via Google Books</p></>}
      <div className="guide-callout"><strong>Make this a full study guide.</strong><p>Summ reads every chapter, writes checked summaries, then builds the sections that fit this kind of book: characters and themes for a novel, key ideas and arguments for nonfiction. You see the cost before anything runs.</p><Button variant="contained" onClick={onCreate}>{chapters.length?'Resume':'Create the study guide'}</Button></div></>}
    </>}
    {section==='glance'&&<>
     <h2>At a glance & reception</h2>
     {infoState==='loading'?<div className="guide-loading"><CircularProgress size={20}/> Looking the book up…</div>:infoState==='none'||!info?<p>No public record was found for this book. {book.demo?'This sample was written for Summ.':'Check the title and author below.'}</p>:<>
      <dl className="guide-facts">{info.year&&<div><dt>First published</dt><dd>{info.year}</dd></div>}{info.pages&&<div><dt>Length</dt><dd>{info.pages} pages</dd></div>}{info.readers&&<div><dt>Open Library readers</dt><dd>{info.readers.toLocaleString()}</dd></div>}{info.ratings.map(r=><div key={r.source}><dt>{r.source} rating</dt><dd>{r.rating.toFixed(2)} / 5{r.count?' from '+r.count.toLocaleString():''}</dd></div>)}</dl>
      {info.wikipedia&&<><h3>Background and reception</h3><p dir="auto">{info.wikipedia.extract}</p><p className="guide-source">From <a href={info.wikipedia.url} target="_blank" rel="noopener noreferrer">Wikipedia</a> · {info.wikipedia.license}</p></>}
      <h3>Reviews and ratings elsewhere</h3><div className="guide-links">{info.links.map(l=><a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer">{l.name}<OpenInNewRounded fontSize="small"/></a>)}</div>
      <p className="guide-source">Goodreads offers no public API and does not allow automated copying, so Summ links to it instead of showing its ratings.</p>
     </>}
     {!book.demo&&(editing?<form className="guide-edit" onSubmit={e=>{e.preventDefault();setEditing(false);lookup(query.title,query.author,true);}}><TextField size="small" label="Title" value={query.title} onChange={e=>setQuery({...query,title:e.target.value})}/><TextField size="small" label="Author" value={query.author} onChange={e=>setQuery({...query,author:e.target.value})}/><Button type="submit" variant="contained">Search again</Button></form>:<Button startIcon={<EditOutlined/>} onClick={()=>setEditing(true)}>Not the right book?</Button>)}
    </>}
    {guideSection&&<><h2 dir="auto">{guideSection.title}</h2>{paragraphs(guideSection.items)}<p className="guide-source">Built from the checked chapter summaries and checked again against them. Interpretation is labeled; consult the book.</p></>}
    {current&&report?.chapters[current.id]&&<><h2 dir="auto">{current.title}</h2>{paragraphs(report.chapters[current.id].paragraphs,current)}{report.chapters[current.id].review.length>0&&<><h3>Internal analysis</h3>{paragraphs(report.chapters[current.id].review,current)}</>}<Button startIcon={<MenuBookRounded/>} onClick={()=>onRead(book.chapters.indexOf(current))}>Read this chapter in the original</Button></>}
   </article>
  </div>
 </div>;
}
