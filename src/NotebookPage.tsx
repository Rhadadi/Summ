// Every note written "in your own words", grouped by book, with a way back to its chapter and a plain-text copy.
import{DeleteOutlineRounded,FileDownloadOutlined,EditNoteRounded}from'@mui/icons-material';
import{putNote,useNotes,type Note}from'./notes';
import{download}from'./export-book';
import{tr,num}from'./i18n';
export default function NotebookPage({lang,navigate}:{lang:string;navigate:(path:string)=>void}){
 const L=(t:string)=>tr(lang,t),notes=useNotes();
 const books=[...notes.reduce((m,n)=>m.set(n.bookId,[...(m.get(n.bookId)||[]),n]),new Map<string,Note[]>()).values()];
 const date=(at:number)=>new Date(at).toLocaleDateString(lang==='fa'?'fa-IR':undefined,{dateStyle:'medium'});
 function exportAll(){
  const text=books.map(ns=>'# '+ns[0].bookTitle+'\n\n'+ns.map(n=>'## '+n.chapterTitle+'\n'+n.text.trim()+'\n').join('\n')).join('\n\n');
  download(new Blob([text],{type:'text/plain;charset=utf-8'}),'inkling-notebook.txt');
 }
 return <div className="notebook" dir={lang==='fa'?'rtl':'ltr'}>
  <h1 className="library-title">{L('Notebook')}</h1>
  <p className="library-sub">{notes.length?num(lang,notes.length)+' '+L(notes.length===1?'note':'notes')+' · '+L('kept on this device'):L('Notes you write at the end of a chapter appear here.')}</p>
  {notes.length>0&&<button className="text-link2 nb-export" onClick={exportAll}><FileDownloadOutlined fontSize="small"/>{L('Download as text')}</button>}
  {!notes.length&&<div className="empty-state"><EditNoteRounded/><p>{L('Open any chapter and write its main idea in your own words, under “In your own words”.')}</p><button className="text-link2" onClick={()=>navigate('/library')}>{L('Browse the library')}</button></div>}
  {books.map(ns=><section key={ns[0].bookId} className="nb-book"><h2 dir="auto"><button onClick={()=>navigate('/b/'+ns[0].slug)}>{ns[0].bookTitle}</button></h2>
   {ns.map(n=><article key={n.chapterId} className="nb-note"><header><button dir="auto" onClick={()=>navigate('/b/'+n.slug+'/read/c:'+n.chapterId)}>{n.chapterTitle}</button><small>{date(n.at)}</small><button className="nb-del" aria-label={L('Delete note')} onClick={()=>{if(confirm(L('Delete this note?')))putNote({...n,text:''});}}><DeleteOutlineRounded fontSize="small"/></button></header><p dir="auto">{n.text}</p></article>)}
  </section>)}
 </div>;
}
