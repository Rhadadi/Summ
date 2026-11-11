import{useEffect,useRef,useState}from'react';
import{Alert,Button,CircularProgress,IconButton,Menu,MenuItem,TextField,Tooltip}from'@mui/material';
import{AccessTimeRounded,ArrowBackRounded,AutoAwesomeRounded,PublicOutlined,ChevronRightRounded,DescriptionOutlined,DownloadRounded,EditOutlined,FileUploadOutlined,ImageOutlined,LightbulbOutlined,MenuBookRounded,OpenInNewRounded,PlayArrowRounded,StarRounded,TextSnippetOutlined}from'@mui/icons-material';
import type{Review,Book,BookInfo,Chapter,GoogleBookEdition,SavedPassage,SummaryParagraph}from'./types';
import{ApiError,bookInfo,coverImage,pdfReport}from'./api';
import{store}from'./storage';
import{referenceLabels,reportComplete}from'./book-summary';
import{bodyChapter,bookWords,chapterWords,displayName,languages,minutes,readingTime,sectionKind}from'./core';
import{chapterTitle,mainChapters,strip,type BookData}from'./bookData';
import{Shelf}from'./HomePage';
import GoogleBooksDialog from'./GoogleBooksDialog';
import ReviewSection from'./ReviewSection';
import{num,rtl,tr}from'./i18n';

interface Props{
 book:Book;cover:string;data:BookData;saved:SavedPassage[];
 onCover:(blob:Blob,source:'file'|'online',url?:string)=>Promise<void>;onCreate:()=>void;onRead:(chapterIndex?:number,section?:string)=>void;onListen:(chapterId?:string)=>void;
 onExport:()=>void;onEditContents:()=>void;onRebuild:()=>Promise<void>;onAccount:()=>void;onBack:()=>void;
 onImport?:()=>void;onVersion?:(id:string)=>void;review?:Review|null;reviewApproved?:boolean;onReview?:()=>void;
 readOnly?:boolean;pubInfo?:Partial<BookInfo>|null;onPublish?:()=>void;backLabel?:string;
}
const pdfLabels:Record<string,Record<string,string>>={fa:{overview:'نمای کلی',takeaways:'نکته‌های کلیدی',glance:'نگاهی به کتاب',contents:'فهرست',analysis:'تحلیل درونی',reception:'زمینه و بازتاب',publisher:'معرفی ناشر از Google Books',kicker:'Inkling · راهنمای مطالعه',disclaimer:'این متن با هوش مصنوعی از روی منبع ساخته و به‌طور خودکار با آن سنجیده شده است. امتیازها و توضیح‌ها از منابع عمومی نام‌برده آمده‌اند. به متن اصلی مراجعه کنید.'}};
async function downscale(blob:Blob){
 const bitmap=await createImageBitmap(blob);const scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
 return canvas.toDataURL('image/jpeg',.85);
}
// Library categories arrive as "PHILOSOPHY / Ethics & Moral Philosophy"; readers need a few plain words.
export const tagsOf=(categories:string[])=>{const seen=new Set<string>();return categories.flatMap(c=>c.split('/')).map(t=>t.trim()).filter(Boolean).map(t=>t===t.toUpperCase()?t.toLowerCase().replace(/(^|\s)\p{L}/gu,m=>m.toUpperCase()):t).filter(t=>t.length<34&&!/^general$/i.test(t)&&!seen.has(t.toLowerCase())&&!!seen.add(t.toLowerCase())).slice(0,4);};
const short=(m:number)=>m<60?m+' min':Math.round(m/60)+' h';
export default function BookDetail({book,cover,data,saved,onCover,onCreate,onRead,onListen,onExport,onEditContents,onRebuild,onAccount,onBack,onImport,onVersion,review=null,reviewApproved=true,onReview,readOnly=false,pubInfo=null,onPublish,backLabel}:Props){
 const{report,summaries}=data;
 const[info,setInfo]=useState<BookInfo|null>(readOnly?(pubInfo as BookInfo|null):null),[infoState,setInfoState]=useState<'loading'|'ready'|'none'>(readOnly?(pubInfo?'ready':'none'):'loading');
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
 useEffect(()=>{if(readOnly)return;if(!book.demo)lookup(query.title,query.author);else setInfoState('none');},[book.id]);
 useEffect(()=>{if(readOnly||cover||book.demo)return;store.cover(book.id).then(c=>{if(!c&&(book.format==='PDF'||book.format==='EPUB'))coverFromFile();}).catch(()=>{});},[book.id]);
 // Books imported before cleaner extraction are re-read automatically when nothing depends on their old passages.
 const outdated=(book.format==='PDF'||book.format==='EPUB')&&!book.demo&&(book.importVersion||1)<2;
 useEffect(()=>{if(!data.loaded||!outdated||rebuilding)return;if(!report&&!Object.keys(summaries).length&&!saved.some(x=>x.bookId===book.id)){setRebuilding(true);onRebuild().catch(e=>setError((e as Error).message)).finally(()=>setRebuilding(false));}},[data.loaded,outdated]);
 const main=mainChapters(book),done=main.filter(c=>summaries[c.id]).length,imported=!!data.version,complete=imported?done>0:reportComplete(book,report);
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
    chapters:chapters.map(c=>({title:data.titles[c.id]||c.title,paragraphs:labelled(report.chapters[c.id].paragraphs,c),review:labelled(report.chapters[c.id].review,c)})),labels:pdfLabels[report.language]||{}});
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=book.title.replace(/[^\p{L}\p{N}\s-]/gu,'').slice(0,90)+' — Study guide.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(e instanceof ApiError&&e.status===401)onAccount();setError((e as Error).message);}finally{setBusy('');}
 }
 const firstUnread=main.find(c=>!book.completed.includes(c.id))||main[0]||book.chapters[0];
 const startAt=book.lastRead?book.chapterIndex:book.chapters.indexOf(firstUnread);
 const row=(c:Chapter)=>{const s=summaries[c.id];const n=data.titles[c.id]?(main.includes(c)?String(main.indexOf(c)+1):''):c.title.match(/^(\d+)[.\s]/)?.[1]||(main.includes(c)?String(main.indexOf(c)+1):'');
  return <button key={c.id} className="ch-row" onClick={()=>onRead(book.chapters.indexOf(c))}><span className="ch-num">{n||'–'}</span><span className="ch-title" dir="auto">{chapterTitle(data,c)}</span><span className={'ch-status'+(s?' has':'')}>{s?L('Summary')+' · '+shortL(minutes(s.paragraphs.reduce((t,p)=>t+p.text.split(/\s+/).length,0))):'Original · '+short(minutes(chapterWords(bodyChapter(c))))}</span><ChevronRightRounded/></button>;};
 const fileCover=book.format==='PDF'||book.format==='EPUB';
 const shortL=(m:number)=>m<60?num(lang,m)+' '+L('min'):num(lang,Math.round(m/60))+' '+(lang==='fa'?'ساعت':'h');
 const lang=readOnly?(data.version?.language||report?.language||Object.values(summaries)[0]?.language):undefined,L=(t:string)=>tr(lang,t);
 return <div className="detail" dir={rtl(lang)?'rtl':undefined}>
  <button className="back-link" onClick={onBack}><ArrowBackRounded/>{backLabel||'My library'}</button>
  {rebuilding&&<Alert severity="info" icon={<CircularProgress size={18}/>}>Re-reading the file with cleaner text extraction…</Alert>}
  {outdated&&!rebuilding&&data.loaded&&(report||Object.keys(summaries).length>0||saved.some(x=>x.bookId===book.id))&&<Alert severity="info" action={<Button onClick={()=>{setRebuilding(true);onRebuild().catch(e=>setError((e as Error).message)).finally(()=>setRebuilding(false));}}>Re-read file</Button>}>Cleaner text extraction is available for this book. Re-reading it resets its summaries and saved passages.</Alert>}
  {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
  <section className="hero">
   <div className="hero-top">
    <div className="hero-cover"><Shelf book={book} url={cover}/>
     {!readOnly&&<div className="hero-tools">
      <Tooltip title="Edit contents"><IconButton aria-label="Edit contents" onClick={onEditContents}><EditOutlined/></IconButton></Tooltip>
      <Tooltip title="Export notes"><IconButton aria-label="Export notes" onClick={onExport}><TextSnippetOutlined/></IconButton></Tooltip>
      {!book.demo&&<Tooltip title="Change cover"><IconButton aria-label="Change cover" onClick={e=>setCoverMenu(e.currentTarget)}>{busy==='cover'?<CircularProgress size={18}/>:<ImageOutlined/>}</IconButton></Tooltip>}
     </div>}
    </div>
    <div className="hero-text">
     <span className="kicker">{L('Study guide')}{report?.guide?' · '+report.guide.type_label:''}</span>
     <h1 dir="auto">{title}</h1>
     {author&&<p className="hero-author" dir="auto">{lang==='fa'?'نوشتهٔ ':'by '}{author}</p>}
     {subtitle&&<p className="hero-sub" dir="auto">{subtitle}</p>}
     {tagsOf([...(review?.themes||[]),...(info?.categories||[])]).length>0&&<div className="hero-tags">{tagsOf([...(review?.themes||[]).slice(0,2),...(info?.categories||[])]).map(t=><span key={t} dir="auto">{t}</span>)}</div>}
     <div className="stats">
      {info?.ratings[0]&&<span><StarRounded/>{num(lang,+info.ratings[0].rating.toFixed(1))}{info.ratings[0].count?' ('+num(lang,info.ratings[0].count)+' '+L('ratings')+')':''}</span>}
      <span><AccessTimeRounded/>{readOnly?num(lang,minutes(Object.values(summaries).reduce((n,x)=>n+x.paragraphs.reduce((m,y)=>m+y.text.split(/\s+/).length,0),0)))+' '+L('min of summaries'):readingTime(bookWords({...book,chapters:book.chapters.map(bodyChapter)})).replace('about ','').replace('-minute read',' min book').replace('-hour read','-hour book')}</span>
      <span><LightbulbOutlined/>{num(lang,main.length)} {L('key chapters')}</span>
      {pages&&<span><DescriptionOutlined/>{num(lang,pages)} {L('pages')}</span>}
     </div>
     <Button className="big" variant="contained" startIcon={<MenuBookRounded/>} onClick={()=>onRead(startAt)}>{L(book.lastRead?'Continue reading':'Start reading')}</Button>
     {!readOnly&&!!onImport&&<Button className="big" variant="outlined" startIcon={<FileUploadOutlined/>} onClick={onImport}>{data.versions.length?'Add another summary':'Prepare or import a summary'}</Button>}
     <Button className="big" variant="outlined" startIcon={<PlayArrowRounded/>} disabled={!listenable&&!readOnly} onClick={()=>onListen()}>{readOnly?L('Listen'):listenable?'Listen · '+listenable+(listenable===1?' chapter':' chapters')+' ready':'Listen · summarize chapters first'}</Button>
     {!readOnly&&!!onPublish&&<Button className="big" variant="text" startIcon={<PublicOutlined/>} onClick={onPublish}>{book.published?'Published · manage':'Publish this summary'}</Button>}
    </div>
   </div>
   {!readOnly&&<div className="band">
    {complete?<><div><strong>{imported?data.version!.label+' summary · '+(languages.find(l=>l.code===data.version!.language)?.label.replace(/ ·.*/,'')||data.version!.language):'Study guide complete'}</strong><span>{imported?done+(done===1?' chapter':' chapters')+(report?.overview?' with an overview and key takeaways.':'.'):<>Overview, key takeaways{report?.guide?', '+report.guide.sections.map(s=>s.title.toLowerCase()).slice(0,3).join(', '):''} and every chapter.</>}</span></div>
      <Button variant="contained" className="dark" startIcon={busy==='pdf'?<CircularProgress size={16} color="inherit"/>:<DownloadRounded/>} disabled={!!busy} onClick={downloadPdf}>{busy==='pdf'?'Typesetting…':'Download PDF'}</Button></>
    :<><div><strong>{done} of {main.length} chapters summarized</strong><span>{done?'Finish the study guide to get the overview, key takeaways, themes and a typeset PDF.':'Summarize every chapter, then get the overview, key takeaways, themes and a typeset PDF.'} You see the cost before anything runs.</span></div>
      <Button variant="contained" className="dark" startIcon={<AutoAwesomeRounded/>} onClick={onCreate}>{done?'Finish the study guide':'Create the study guide'}</Button></>}
   </div>}
  </section>
  <section className="about">
   <h2>{L('What’s it about?')}</h2>
   {report?.overview?<><p className="about-lead" dir="auto">{report.overview.paragraphs[0]?.text}</p><button className="text-link2" onClick={()=>onRead(undefined,'overview')}>{L('Read the overview and key takeaways')} <ChevronRightRounded/></button></>
    :info?.description?<><p className="about-lead" dir="auto">{info.description}</p><small>Publisher description via Google Books</small></>
    :intro?<><p className="about-lead" dir="auto">{intro.text.length>520?intro.text.slice(0,intro.text.lastIndexOf(' ',520))+'…':intro.text}</p><small>From the book, p. {intro.page}</small></>:null}
  </section>
  <section className="chapters">
   <h2>{L('Chapters')}</h2>
   {data.versions.length>1&&!!onVersion&&<div className="version-chips" role="group" aria-label="Summary version">{data.versions.map(v=><button key={v.id} className={'version-chip'+(data.version?.id===v.id?' on':'')} aria-pressed={data.version?.id===v.id} onClick={()=>onVersion(v.id)}>{v.label} · {languages.find(l=>l.code===v.language)?.label.replace(/ ·.*/,'')||v.language}</button>)}</div>}
   {main.map(row)}
   {kinds.some(k=>k!=='main')&&<><button className="more-toggle" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'Hide':'Show'} front matter, notes and index</button>{more&&book.chapters.filter((_,i)=>kinds[i]!=='main').map(row)}</>}
  </section>
  {(!book.demo||readOnly)&&<section className="reception">
   <h2>{L('What others say')}</h2>
   {infoState==='loading'&&!review?<p className="muted"><CircularProgress size={16}/> {L('Looking the book up…')}</p>:<>
    <ReviewSection lang={lang} review={review} scores={(info?.ratings||[]).filter(r=>(r.count||0)>=20).map(r=>({value:r.rating,source:r.source,count:r.count,url:r.url}))} title={book.title} author={author} draft={!!review&&!reviewApproved&&!readOnly}/>
    {!review&&info?.wikipedia&&<div className="rv-wiki"><p dir="auto">{info.wikipedia.extract}</p><small>{L('From Wikipedia')} · <a href={info.wikipedia.url} target="_blank" rel="noopener noreferrer">{info.wikipedia.title}</a> · {info.wikipedia.license}</small></div>}
    {info&&<p className="facts-line">{[info.google_edition?.publisher,info.google_edition?.published_date||info.year,pages?num(lang,pages)+' '+L('pages'):'',info.google_edition?.isbns[0]?'ISBN '+info.google_edition.isbns[0]:''].filter(Boolean).join(' · ')}</p>}
   </>}
   {!readOnly&&<div className="reception-actions">{!!onReview&&<Button variant={review?'text':'outlined'} startIcon={<AutoAwesomeRounded/>} onClick={onReview}>{review?'Edit the reception':'Research reviews and ratings'}</Button>}{editing?<form className="guide-edit" onSubmit={e=>{e.preventDefault();setEditing(false);lookup(query.title,query.author,true);}}><TextField size="small" label="Title" value={query.title} onChange={e=>setQuery({...query,title:e.target.value})}/><TextField size="small" label="Author" value={query.author} onChange={e=>setQuery({...query,author:e.target.value})}/><Button type="submit" variant="contained">Search again</Button></form>:<Button onClick={()=>setEditing(true)}>Not the right book?</Button>}<Button disabled={infoState==='loading'} onClick={()=>setEditionOpen(true)}>Choose edition</Button></div>}
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
