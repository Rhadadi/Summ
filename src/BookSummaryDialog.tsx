import{useEffect,useMemo,useRef,useState}from'react';
import{Alert,Button,CircularProgress,Dialog,DialogContent,DialogTitle,IconButton,LinearProgress,MenuItem,TextField}from'@mui/material';
import{AutoStoriesRounded,CloseRounded,DownloadRounded,PrintOutlined}from'@mui/icons-material';
import type{Account,Book,BookReport,Chapter,Depth,Settings,SummaryParagraph}from'./types';
import{languages}from'./core';
import{composeSummary,guide,summarize,summaryKey}from'./api';
import{store}from'./storage';
import{addUsage,referenceLabels,reportComplete,reportHtml,reportKey,reportMarkdown,runBookReport}from'./book-summary';
import{estimateBook,money,usageCost}from'./cost';
import type{Price}from'./cost';
import type{CostRequest}from'./CostDialog';
import type{BookProgress}from'./book-summary';

interface Props{open:boolean;book:Book;settings:Settings;account:Account|null;price:Price|null;onConfirm:(request:CostRequest)=>void;onClose:()=>void;onLanguage:(language:string)=>void;onAccount:()=>void;onAccountError:(error:unknown)=>boolean;onChapterReady:(id:string)=>void;onReport:()=>void;onGuide:()=>void}
export default function BookSummaryDialog({open,book,settings,account,price,onConfirm,onClose,onLanguage,onAccount,onAccountError,onChapterReady,onReport,onGuide}:Props){
 const model=account?.key?.model||'';
 const[detail,setDetail]=useState<Depth>(settings.depth==='glance'?'detailed':settings.depth);
 const[report,setReport]=useState<BookReport>(),[loading,setLoading]=useState(true),[running,setRunning]=useState(false),[error,setError]=useState(''),[paused,setPaused]=useState(false),[progress,setProgress]=useState<BookProgress>();
 const controller=useRef<AbortController|null>(null);
 const options=useMemo(()=>({...settings,depth:detail}),[settings,detail]);
 const key=useMemo(()=>reportKey(book,options,model),[book.id,book.hash,book.chapters,options.language,options.depth,options.purpose,options.review,model]);
 useEffect(()=>{
  let live=true;controller.current?.abort();controller.current=null;setRunning(false);setLoading(true);setReport(undefined);setProgress(undefined);setError('');setPaused(false);
  store.report(key).then(saved=>{if(live){setReport(saved);setLoading(false);}}).catch(()=>{if(live){setError('Could not load the saved summary. Check browser site storage permissions.');setLoading(false);}});
  return()=>{live=false;controller.current?.abort();};
 },[key]);
 const completed=book.chapters.filter(chapter=>report?.chapters[chapter.id]).length;
 const complete=reportComplete(book,report);
 const close=()=>{controller.current?.abort();onClose();};
 // Finished chapters carry their parts' usage; unfinished chapters' parts are counted on their own.
 const spent=report?usageCost(addUsage(...Object.values(report.chapters).map(c=>c.usage),...Object.entries(report.parts).filter(([k])=>!report.chapters[k.slice(0,k.lastIndexOf(':'))]).map(([,p])=>p.usage),report.overview?.usage),price):null;
 function start(){
  if(!account?.key){onAccount();return;}
  onConfirm({title:'Summarize the whole book',estimate:estimateBook(book,options,report),note:completed?completed+' finished chapters are skipped at no cost.':'You can pause at any time; finished chapters are kept.',run:execute});
 }
 async function execute(){
  const run=new AbortController();controller.current=run;setRunning(true);setError('');setPaused(false);
  try{
   await runBookReport(book,options,model,report,{
    signal:run.signal,
    summarize:chapter=>summarize(options,chapter,run.signal),
    compose:(title,sections,kind)=>composeSummary(options,title,sections,kind,run.signal),
    guide:sections=>guide(options,book.title,book.author,sections,run.signal),
    save:async value=>{await store.saveReport(key,value);await store.setLatestReport(book.id,key);onReport();if(controller.current===run)setReport(value);},
    cacheChapter:async(chapter,summary)=>{await store.saveSummary(summaryKey(book.id,book.hash,chapter,options,model),summary);if(controller.current===run)onChapterReady(chapter.id);},
    progress:value=>{if(controller.current===run)setProgress(value);}
   });
  }catch(reason){if(controller.current===run){if(run.signal.aborted)setPaused(true);else if(!onAccountError(reason))setError(reason instanceof Error?reason.message:'Processing stopped. Completed chapters are saved; resume to continue.');}}
  finally{if(controller.current===run)setRunning(false);}
 }
 function download(format:'html'|'md'){
  if(!report)return;const content=format==='html'?reportHtml(book,report):reportMarkdown(book,report);
  const url=URL.createObjectURL(new Blob([content],{type:format==='html'?'text/html;charset=utf-8':'text/markdown;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=book.title.replace(/[^\p{L}\p{N}\s-]/gu,'').slice(0,90)+' — Summary.'+format;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function print(){
  if(!report)return;const target=window.open('','_blank');
  if(!target){setError('Allow a new window to print, or download the formatted HTML summary.');return;}
  target.opener=null;target.document.write(reportHtml(book,report));target.document.close();target.focus();target.print();
 }
 function paragraphs(items:SummaryParagraph[],chapter?:Chapter){return items.map((paragraph,index)=><div className="book-report-paragraph" key={index}>{paragraph.heading&&<h4 dir="auto">{paragraph.heading}</h4>}<p dir="auto">{paragraph.text}</p><small>{referenceLabels(book,chapter,paragraph).join(' · ')}</small></div>);}
 const percent=complete?100:Math.min(98,Math.round(((progress?.completed??completed)+(progress?.stage==='chapter'?(progress.part-1)/progress.parts:0))/Math.max(1,book.chapters.length)*94));
 return <Dialog open={open} onClose={close} fullWidth maxWidth="lg" aria-labelledby="book-summary-title" slotProps={{paper:{className:'book-summary-dialog'}}}>
  <DialogTitle id="book-summary-title" className="book-summary-title"><span><AutoStoriesRounded/> Whole-book summary</span><IconButton aria-label={running?'Pause and close book summary':'Close book summary'} onClick={close}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent>
   <div className="book-summary-intro"><h2 dir="auto">{book.title}</h2><p>One complete report: a book overview, key takeaways, and a structured summary of every chapter.</p></div>
   <div className="book-summary-options"><TextField select label="Summary language" value={settings.language} disabled={running} onChange={event=>onLanguage(event.target.value)}>{languages.map(language=><MenuItem key={language.code} value={language.code}>{language.label}</MenuItem>)}</TextField><TextField select label="Summary detail" value={detail} disabled={running} onChange={event=>setDetail(event.target.value as Depth)}><MenuItem value="overview">Concise</MenuItem><MenuItem value="detailed">Detailed</MenuItem><MenuItem value="close">Comprehensive</MenuItem></TextField><div><strong>{book.chapters.length} chapters</strong><span>Model: {model||'Add your Gemini key'}{spent!=null&&spent>0?' · spent '+money(spent):''}</span></div></div>
   <p className="book-summary-help">Long chapters are processed in full, in manageable sections. Keep this report open while it runs. Completed work is saved in this browser, so you can pause and resume. Processing uses your Gemini API account.</p>
   <div className="book-summary-controls">{loading?<CircularProgress size={24}/>:complete?<><strong className="book-summary-ready">All {book.chapters.length} chapters summarized</strong><Button variant="contained" onClick={()=>{close();onGuide();}}>Open study guide</Button></>:<Button variant="contained" onClick={start} disabled={running}>{running?'Creating whole-book summary…':completed||Object.keys(report?.parts||{}).length?'Resume whole-book summary':'Create whole-book summary'}</Button>}{running&&<Button onClick={()=>controller.current?.abort()}>Pause</Button>}{report&&completed>0&&<><Button startIcon={<DownloadRounded/>} onClick={()=>download('html')}>Download formatted HTML</Button><Button onClick={()=>download('md')}>Markdown</Button><Button startIcon={<PrintOutlined/>} onClick={print}>Print / Save PDF</Button></>}</div>
   {running&&<div className="book-summary-progress" role="status"><LinearProgress variant="determinate" value={percent}/><p>{progress?.stage==='guide'?'Building the study guide: characters, themes, key ideas…':progress?.stage==='overview'?'All chapters complete. Writing the book overview and key takeaways…':progress?'Chapter '+(progress.completed+1)+' of '+progress.total+' · '+progress.chapter+(progress.parts>1?' · Section '+progress.part+' of '+progress.parts:''):'Preparing all chapters…'}</p></div>}
   {paused&&<Alert severity="info">Paused. Completed chapters and sections are saved. Resume to continue.</Alert>}
   {error&&<Alert severity="error">{error}<Button onClick={()=>{close();onAccount();}}>Account</Button></Alert>}
   {!complete&&completed>0&&<Alert severity="info">{completed} of {book.chapters.length} chapters ready. The report below is partial until every chapter and the overview are complete.</Alert>}
   {report&&completed>0&&<article className="book-report" dir={['fa','ar'].includes(report.language)?'rtl':'ltr'}>
    <header className="book-report-cover"><span>SUMM · {complete?'COMPLETE BOOK SUMMARY':'SUMMARY IN PROGRESS'}</span><h2 dir="auto">{book.title}</h2><p dir="auto">{book.author}</p><small>{completed} of {book.chapters.length} chapters · {model}</small></header>
    {report.overview&&<section><h3>Book overview</h3>{paragraphs(report.overview.paragraphs)}<h3>Key takeaways</h3><ul>{report.overview.takeaways.map((takeaway,i)=><li key={i} dir="auto">{takeaway.text}</li>)}</ul></section>}
    <nav className="book-report-contents" aria-label="Summary contents"><h3>Contents</h3><ol>{book.chapters.map((chapter,i)=><li key={chapter.id}>{report.chapters[chapter.id]?<a href={'#book-report-chapter-'+i} onClick={event=>{event.preventDefault();document.getElementById('book-report-chapter-'+i)?.scrollIntoView({behavior:'auto',block:'start'});}}>{chapter.title}</a>:<span>{chapter.title} — pending</span>}</li>)}</ol></nav>
    {book.chapters.map((chapter,i)=>{const summary=report.chapters[chapter.id];return summary?<section className="book-report-chapter" id={'book-report-chapter-'+i} key={chapter.id}><h3 dir="auto">{i+1}. {chapter.title}</h3>{paragraphs(summary.paragraphs,chapter)}{summary.review.length>0&&<><h4>Internal analysis</h4>{paragraphs(summary.review,chapter)}</>}</section>:null;})}
    <footer>AI-generated. Chapter summaries are checked against supplied passages. The overview is synthesized and checked against chapter summaries. Automated checks do not guarantee accuracy or completeness; consult the original text.</footer>
   </article>}
  </DialogContent>
 </Dialog>;
}
