import{useEffect,useRef,useState}from'react';
import{Alert,Button,CircularProgress,IconButton,Menu,MenuItem,TextField,Tooltip}from'@mui/material';
import{AccessTimeRounded,ArrowBackRounded,AutoAwesomeRounded,ChevronRightRounded,DescriptionOutlined,DownloadRounded,EditOutlined,FileUploadOutlined,ImageOutlined,LightbulbOutlined,MenuBookRounded,OpenInNewRounded,PlayArrowRounded,StarRounded,TextSnippetOutlined}from'@mui/icons-material';
import type{Book,BookInfo,Chapter,GoogleBookEdition,ImportedSummaries,SavedPassage,SummaryParagraph}from'./types';
import{ApiError,bookInfo,coverImage,pdfReport}from'./api';
import{store}from'./storage';
import{referenceLabels,reportComplete}from'./book-summary';
import{bodyChapter,bookWords,chapterWords,displayName,minutes,readingTime,sectionKind}from'./core';
import{mainChapters,strip,type BookData}from'./bookData';
import{Shelf}from'./HomePage';
import GoogleBooksDialog from'./GoogleBooksDialog';

interface Props{
 book:Book;cover:string;data:BookData;saved:SavedPassage[];
 onCover:(blob:Blob,source:'file'|'online',url?:string)=>Promise<void>;onCreate:()=>void;onRead:(chapterIndex?:number,section?:string)=>void;onListen:(chapterId?:string)=>void;
 onExport:()=>void;onEditContents:()=>void;onRebuild:()=>Promise<void>;onAccount:()=>void;onBack:()=>void;
 imported:ImportedSummaries|null;onImportSummary:(mode:'edit'|'new')=>void;onReadImported:()=>void;
}
const pdfLabels:Record<string,Record<string,string>>={fa:{overview:'نمای کلی',takeaways:'نکته‌های کلیدی',glance:'نگاهی به کتاب',contents:'فهرست',analysis:'تحلیل درونی',reception:'زمینه و بازتاب',publisher:'معرفی ناشر از Google Books',kicker:'Summ · راهنمای مطالعه',disclaimer:'این متن با هوش مصنوعی از روی منبع ساخته و به‌طور خودکار با آن سنجیده شده است. امتیازها و توضیح‌ها از منابع عمومی نام‌برده آمده‌اند. به متن اصلی مراجعه کنید.'}};
async function downscale(blob:Blob){
 const bitmap=await createImageBitmap(blob);const scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/jpeg',.85);
}
const short=(m:number)=>m<60?m+' min':Math.round(m/60)+' h';
export default function BookDetail({book,cover,data,saved,onCover,onCreate,onRead,onListen,onExport,onEditContents,onRebuild,onAccount,onBack,imported,onImportSummary,onReadImported}:Props){
 const{report,summaries}=data;
 const[info,setInfo]=useState<BookInfo|null>(null),[infoState,setInfoState]=useState<'loading'|'ready'|'none'>('loading');
 const[query,setQuery]=useState({title:book.title,author:book.author==='Author not supplied'?'':book.author}),[editing,setEditing]=useState(false),[editionOpen,setEditionOpen]=useState(false);
 const[coverMenu,setCoverMenu]=useState<HTMLElement|null>(null),[more,setMore]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[rebuilding,setRebuilding]=useState(false);
 const upload=useRef<HTMLInputElement>(null);
 async function useOnlineCover(url:string){await onCover(await coverImage(url),'online',url);}
 async function showInfo(result:BookInfo,replace=false){
  setInfo(result);setInfoState('ready');
  const stored=await store.cover(book.id),url=result.covers[0];
  if(url&&(!stored||(replace&&stored.source==='online')))await useOnlineCover(url);
 }
 async function lookup(title:string,author:string,force=false){
  setInfoState('loading');
  try{const cached=force?undefined:await store.info(book.id);const result=cached||await store.saveInfo(book.id,await bookInfo(title,author),force);void showInfo(result,force).catch(()=>{});}
  catch{setInfoState(info?'ready':'none');}
 }
 async function chooseEdition(edition:GoogleBookEdition){const result=await store.saveInfo(book.id,await bookInfo('','',edition.id),true);void showInfo(result,true).catch(()=>{});}
 async function coverFromFile(){
  const file=await store.file(book.id);if(!file)return;setBusy('cover');
  const{extractCover}=await import('./importers');const blob=await extractCover(file,book.format==='EPUB'?'x.epub':'x.pdf');
  if(blob)await onCover(blob,'file');else setError('No cover image was found in the file.');setBusy('');
 }
 useEffect(()=>{if(!book.demo)lookup(query.title,query.author);else setInfoState('none');},[book.id]);
 useEffect(()=>{if(cover||book.demo)return;store.cover(book.id).then(c=>{if(!c&&(book.format==='PDF'||book.format==='EPUB'))coverFromFile();}).catch(()=>{});},[book.id]);
 // Books imported before cleaner extraction are re-read automatically when nothing depends on their old passages.
 const outdated=(book.format==='PDF'||book.format==='EPUB')&&!book.demo&&(book.importVersion||1)<2;
 useEffect(()=>{if(!data.loaded||!outdated||rebuilding)return;if(!report&&!Object.keys(summaries).length&&!saved.some(x=>x.bookId===book.id)){setRebuilding(true);onRebuild().catch(e=>setError((e as Error).message)).finally(()=>setRebuilding(false));}},[data.loaded,outdated]);
 const main=mainChapters(book),done=main.filter(c=>summaries[c.id]).length,complete=reportComplete(book,report);
 const kinds=book.chapters.map((c,i)=>sectionKind(c,i,book.chapters));
 const author=displayName(info?.authors[0]||(book.author==='Author not supplied'?'':book.author));
 const[title,...rest]=book.title.split(/:\s+/);const subtitle=rest.join(': ');
 const pages=info?.pages||Math.max(0,...book.chapters.flatMap(c=>c.blocks.map(b=>b.page||0)))||null;
 const intro=main.flatMap(c=>bodyChapter(c).blocks).find(b=>b.text.length>200);
 const listenable=Object.keys(summaries).length;
 async function downloadPdf(){
  if(!report)return;setBusy('pdf');setError('');
  try{
   const coverBlob=(await store.cover(book.id))?.blob;const chapters=book.chapters.filter(c=>report.chapters[c.id]);
   const labelled=(items:SummaryParagraph[],chapter?:Chapter)=>items.map(p=>({heading:p.heading,text:p.text,ref:chapter?referenceLabels(book,chapter,p).join(' · '):p.evidence_ids.map(id=>book.chapters.find(c=>c.id===id)?.title||'').filter(Boolean).join(' · ')}));
   const blob=await pdfReport({book:{title:book.title,author:book.author},language:report.language,model:report.model,cover:coverBlob?await downscale(coverBlob):null,
    info:info?{year:info.year,pages:info.pages,categories:info.categories,ratings:info.ratings,description:info.description,wikipedia:info.wikipedia}:null,
    overview:report.overview?labelled(report.overview.paragraphs):[],takeaways:report.overview?.takeaways.map(t=>({text:t.text}))||[],
    guide:report.guide?{sections:report.guide.sections.map(s=>({title:s.title,items:labelled(s.items)}))}:null,
    chapters:chapters.map(c=>({title:c.title,paragraphs:labelled(report.chapters[c.id].paragraphs,c),review:labelled(report.chapters[c.id].review,c)})),labels:pdfLabels[report.language]||{}});
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=book.title.replace(/[^\p{L}\p{N}\s-]/gu,'').slice(0,90)+' — Study guide.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(e instanceof ApiError&&e.status===401)onAccount();setError((e as Error).message);}finally{setBusy('');}
 }
 const firstUnread=main.find(c=>!book.completed.includes(c.id))||main[0]||book.chapters[0];
 const startAt=book.lastRead?book.chapterIndex:book.chapters.indexOf(firstUnread);
 const row=(c:Chapter)=>{const s=summaries[c.id];const n=c.title.match(/^(\d+)[.\s]/)?.[1];
  return <button key={c.id} className="ch-row" onClick={()=>onRead(book.chapters.indexOf(c))}><span className="ch-num">{n||'–'}</span><span className="ch-title" dir="auto">{strip(c.title)}</span><span className={'ch-status'+(s?' has':'')}>{s?'Summary · '+short(minutes(s.paragraphs.reduce((t,p)=>t+p.text.split(/\s+/).length,0))):'Original · '+short(minutes(chapterWords(bodyChapter(c))))}</span><ChevronRightRounded/></button>;};
 const fileCover=book.format==='PDF'||book.format==='EPUB';
 return <div className="detail">
  <button className="back-link" onClick={onBack}><ArrowBackRounded/>My library</button>
  {rebuilding&&<Alert severity="info" icon={<CircularProgress size={18}/>}>Re-reading the file with cleaner text extraction…</Alert>}
  {outdated&&!rebuilding&&data.loaded&&(report||Object.keys(summaries).length>0||saved.some(x=>x.bookId===book.id))&&<Alert severity="info" action={<Button onClick={()=>{setRebuilding(true);onRebuild().catch(e=>setError((e as Error).message)).finally(()=>setRebuilding(false));}}>Re-read file</Button>}>Cleaner text extraction is available for this book. Re-reading it resets its summaries and saved passages.</Alert>}
  {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
  <section className="hero">
   <div className="hero-top">
    <div className="hero-cover"><Shelf book={book} url={cover}/>
     <div className="hero-tools">
      <Tooltip title="Edit contents"><IconButton aria-label="Edit contents" onClick={onEditContents}><EditOutlined/></IconButton></Tooltip>
      <Tooltip title="Export notes"><IconButton aria-label="Export notes" onClick={onExport}><TextSnippetOutlined/></IconButton></Tooltip>
      {!book.demo&&<Tooltip title="Change cover"><IconButton aria-label="Change cover" onClick={e=>setCoverMenu(e.currentTarget)}>{busy==='cover'?<CircularProgress size={18}/>:<ImageOutlined/>}</IconButton></Tooltip>}
     </div>
    </div>
    <div className="hero-text">
     <span className="kicker">Study guide{report?.guide?' · '+report.guide.type_label:''}</span>
     <h1 dir="auto">{title}</h1>
     {author&&<p className="hero-author" dir="auto">by {author}</p>}
     {subtitle&&<p className="hero-sub" dir="auto">{subtitle}</p>}
     <div className="stats">
      {info?.ratings[0]&&<span><StarRounded/>{info.ratings[0].rating.toFixed(1)}{info.ratings[0].count?' ('+info.ratings[0].count.toLocaleString()+' ratings)':''}</span>}
      <span><AccessTimeRounded/>{readingTime(bookWords({...book,chapters:book.chapters.map(bodyChapter)})).replace('about ','').replace('-minute read',' min book').replace('-hour read','-hour book')}</span>
      <span><LightbulbOutlined/>{main.length} key chapters</span>
      {pages&&<span><DescriptionOutlined/>{pages} pages</span>}
     </div>
     <Button className="big" variant="contained" startIcon={<MenuBookRounded/>} onClick={()=>onRead(startAt)}>{book.lastRead?'Continue reading':'Start reading'}</Button>
     <Button className="big" variant="outlined" startIcon={imported?<DescriptionOutlined/>:<FileUploadOutlined/>} onClick={imported?onReadImported:()=>onImportSummary('new')}>{imported?'Read your imported summary':'Import a summary you already have'}</Button>
     <Button className="big" variant="outlined" startIcon={<PlayArrowRounded/>} disabled={!listenable} onClick={()=>onListen()}>{listenable?'Listen · '+listenable+(listenable===1?' chapter':' chapters')+' ready':'Listen · summarize chapters first'}</Button>
    </div>
   </div>
   <div className="band">
    {complete?<><div><strong>Study guide complete</strong><span>Overview, key takeaways{report?.guide?', '+report.guide.sections.map(s=>s.title.toLowerCase()).slice(0,3).join(', '):''} and every chapter.</span></div>
      <Button variant="contained" className="dark" startIcon={busy==='pdf'?<CircularProgress size={16} color="inherit"/>:<DownloadRounded/>} disabled={!!busy} onClick={downloadPdf}>{busy==='pdf'?'Typesetting…':'Download PDF'}</Button></>
    :<><div><strong>{done} of {main.length} chapters summarized</strong><span>{done?'Finish the study guide to get the overview, key takeaways, themes and a typeset PDF.':'Summarize every chapter, then get the overview, key takeaways, themes and a typeset PDF.'} You see the cost before anything runs.</span></div>
      <Button variant="contained" className="dark" startIcon={<AutoAwesomeRounded/>} onClick={onCreate}>{done?'Finish the study guide':'Create the study guide'}</Button></>}
   </div>
  </section>
  <section className="about">
   <h2>What’s it about?</h2>
   {(report?.guide||info?.categories.length)?<div className="chips">{[report?.guide?.type_label,...(info?.categories||[]).slice(0,4)].filter(Boolean).map(t=><span key={t}>{t}</span>)}</div>:null}
   {report?.overview?<><p dir="auto">{report.overview.paragraphs[0]?.text}</p><button className="text-link2" onClick={()=>onRead(undefined,'overview')}>Read the overview and key takeaways <ChevronRightRounded/></button></>
    :info?.description?<><p dir="auto">{info.description}</p><small>Publisher description via Google Books</small></>
    :intro?<><p dir="auto">{intro.text.length>520?intro.text.slice(0,intro.text.lastIndexOf(' ',520))+'…':intro.text}</p><small>From the book, p. {intro.page}</small></>:null}
  </section>
  <section className="chapters">
   <h2>Chapters</h2>
   {main.map(row)}
   {kinds.some(k=>k!=='main')&&<><button className="more-toggle" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'Hide':'Show'} front matter, notes and index</button>{more&&book.chapters.filter((_,i)=>kinds[i]!=='main').map(row)}</>}
  </section>
  {!book.demo&&<section className="reception">
   <h2>Reception</h2>
   {infoState==='loading'?<p className="muted"><CircularProgress size={16}/> Looking the book up…</p>:!info||infoState==='none'?<p className="muted">No public record was found for this book.</p>:<>
    <dl className="facts">{info.year&&<div><dt>Published</dt><dd>{info.google_edition?.published_date||info.year}</dd></div>}{info.google_edition?.publisher&&<div><dt>Publisher</dt><dd dir="auto">{info.google_edition.publisher}</dd></div>}{!!info.google_edition?.isbns.length&&<div><dt>ISBN</dt><dd>{info.google_edition.isbns.join(' · ')}</dd></div>}{info.readers&&<div><dt>Open Library readers</dt><dd>{info.readers.toLocaleString()}</dd></div>}{info.ratings.map(r=><div key={r.source}><dt>{r.source}</dt><dd>{r.rating.toFixed(2)} / 5{r.count?' · '+r.count.toLocaleString():''}</dd></div>)}</dl>
    {info.wikipedia&&<><p dir="auto">{info.wikipedia.extract}</p><small>From <a href={info.wikipedia.url} target="_blank" rel="noopener noreferrer">Wikipedia</a> · {info.wikipedia.license}</small></>}
    <div className="links">{info.links.map(l=><a key={l.name} href={l.url} target="_blank" rel="noopener noreferrer">{l.name}<OpenInNewRounded fontSize="inherit"/></a>)}</div></>}
   <div className="reception-actions">{editing?<form className="guide-edit" onSubmit={e=>{e.preventDefault();setEditing(false);lookup(query.title,query.author,true);}}><TextField size="small" label="Title" value={query.title} onChange={e=>setQuery({...query,title:e.target.value})}/><TextField size="small" label="Author" value={query.author} onChange={e=>setQuery({...query,author:e.target.value})}/><Button type="submit" variant="contained">Search again</Button></form>:<Button onClick={()=>setEditing(true)}>Not the right book?</Button>}<Button disabled={infoState==='loading'} onClick={()=>setEditionOpen(true)}>Choose edition</Button></div>
  </section>}
  {editionOpen&&<GoogleBooksDialog initialQuery={[query.title,query.author].filter(Boolean).join(' ')} onClose={()=>setEditionOpen(false)} onChoose={chooseEdition}/>}
  <Menu anchorEl={coverMenu} open={!!coverMenu} onClose={()=>setCoverMenu(null)}>
   {fileCover&&<MenuItem onClick={()=>{setCoverMenu(null);coverFromFile();}}>{book.format==='PDF'?'Use a page from the PDF':'Use the EPUB cover'}</MenuItem>}
   <MenuItem disabled={!info?.covers.length} onClick={()=>{setCoverMenu(null);if(info?.covers[0])useOnlineCover(info.covers[0]).catch(e=>setError(e.message));}}>Use the cover found online</MenuItem>
   <MenuItem onClick={()=>{setCoverMenu(null);upload.current?.click();}}>Upload an image…</MenuItem>
  </Menu>
  <input ref={upload} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)onCover(f,'file');e.target.value='';}}/>
 </div>;
}
