// Everything the reader kept: notes written "in your own words", voice notes, and highlights with their comments,
// grouped by book, with a way back to each chapter, a plain-text copy and a full backup file.
// Notes, highlights and comments are kept with the reader's account (encrypted on the server); this page says whether
// everything has reached it.
import{AutoAwesomeRounded,CloudDoneOutlined,CloudOffOutlined,CloudSyncOutlined,DeleteOutlineRounded,FileDownloadOutlined,EditNoteRounded}from'@mui/icons-material';
import{putNote,useNotes,type Note}from'./notes';
import{download}from'./export-book';
import{deleteClip,noteKey,useClips,type Clip}from'./voice-notes';
import{ClipChips}from'./VoiceNote';
import{allMarks,removeMark,sync,useMarks,useSyncState,type Mark}from'./marks';
import{tr,num}from'./i18n';
export default function NotebookPage({lang,navigate}:{lang:string;navigate:(path:string)=>void}){
 const L=(t:string)=>tr(lang,t),written=useNotes(),clips=useClips(),marks=useMarks(),synced=useSyncState();
 // voice notes count as notes too, even before they are transcribed
 const byKey=clips.reduce((m,c)=>m.set(noteKey(c.bookId,c.chapterId),[...(m.get(noteKey(c.bookId,c.chapterId))||[]),c]),new Map<string,Clip[]>());
 const notes=[...written,...[...byKey.values()].filter(cs=>!written.some(n=>noteKey(n.bookId,n.chapterId)===noteKey(cs[0].bookId,cs[0].chapterId))).map(cs=>({...cs[0],text:'',at:cs[cs.length-1].at}))].sort((a,b)=>b.at-a.at);
 const ids=[...new Set([...notes.map(n=>n.bookId),...marks.map(m=>m.book)])];
 const books=ids.map(id=>({id,notes:notes.filter(n=>n.bookId===id),marks:marks.filter(m=>m.book===id)}))
  .map(b=>({...b,title:b.notes[0]?.bookTitle||b.marks[0]?.bookTitle||'',slug:b.notes[0]?.slug||b.marks[0]?.slug||'',at:Math.max(0,...b.notes.map(n=>n.at),...b.marks.map(m=>m.updated))}))
  .sort((a,b)=>b.at-a.at);
 const date=(at:number)=>new Date(at).toLocaleDateString(lang==='fa'?'fa-IR':undefined,{dateStyle:'medium'});
 const chapterPath=(slug:string,chapter:string)=>'/b/'+slug+'/read'+(chapter&&chapter!=='overview'?'/c:'+chapter:'');
 const count=notes.length+marks.length;
 function exportText(){
  const text=books.map(b=>'# '+b.title+'\n\n'
   +b.notes.filter(n=>n.text.trim()).map(n=>'## '+n.chapterTitle+'\n'+n.text.trim()+'\n').join('\n')
   +(b.marks.length?'\n'+b.marks.map(m=>'> '+m.quote+'\n'+(m.note.trim()?(m.source==='ai'?'['+(m.model||'AI')+'] ':'')+m.note.trim()+'\n':'')+'— '+m.chapterTitle+'\n').join('\n'):'')).join('\n\n');
  download(new Blob([text],{type:'text/plain;charset=utf-8'}),'inkling-notebook.txt');
 }
 function exportBackup(){
  const data={app:'Inkling',kind:'notebook-backup',at:new Date().toISOString(),notes:written,highlights:allMarks()};
  download(new Blob([JSON.stringify(data,null,1)],{type:'application/json'}),'inkling-notebook-backup.json');
 }
 const status=synced==='synced'?{icon:<CloudDoneOutlined/>,text:L('Saved to your account')}:synced==='local'?{icon:<CloudOffOutlined/>,text:L('Only on this device. Sign in to keep them safe in your account.')}
  :synced==='offline'?{icon:<CloudOffOutlined/>,text:L('Offline. Saved on this device; they reach your account when you are back online.')}
  :synced==='error'?{icon:<CloudOffOutlined/>,text:L('Not saved to your account yet. Trying again soon.')}:{icon:<CloudSyncOutlined/>,text:L('Saving to your account…')};
 return <div className="notebook" dir={lang==='fa'?'rtl':'ltr'}>
  <h1 className="library-title">{L('Notebook')}</h1>
  <p className="library-sub">{count?num(lang,notes.length)+' '+L(notes.length===1?'note':'notes')+' · '+num(lang,marks.length)+' '+L(marks.length===1?'highlight':'highlights'):L('Notes you write at the end of a chapter appear here.')}</p>
  {count>0&&<p className={'nb-sync '+synced}>{status.icon}<span>{status.text}</span>{synced==='error'&&<button className="text-link2 inline" onClick={()=>void sync()}>{L('Try again')}</button>}</p>}
  {count>0&&<div className="nb-exports"><button className="text-link2 nb-export" onClick={exportText}><FileDownloadOutlined fontSize="small"/>{L('Download as text')}</button><button className="text-link2 nb-export" onClick={exportBackup}><FileDownloadOutlined fontSize="small"/>{L('Download a backup')}</button></div>}
  {!count&&<div className="empty-state"><EditNoteRounded/><p>{L('Open any chapter and write its main idea in your own words, under “In your own words”.')}</p><button className="text-link2" onClick={()=>navigate('/library')}>{L('Browse the library')}</button></div>}
  {books.map(b=><section key={b.id} className="nb-book"><h2 dir="auto"><button onClick={()=>navigate('/b/'+b.slug)}>{b.title}</button></h2>
   {b.notes.map((n:Note)=><article key={n.chapterId} className="nb-note"><header><button dir="auto" onClick={()=>navigate(chapterPath(n.slug,n.chapterId))}>{n.chapterTitle}</button><small>{date(n.at)}</small><button className="nb-del" aria-label={L('Delete note')} onClick={()=>{if(confirm(L('Delete this note?'))){putNote({...n,text:''});(byKey.get(noteKey(n.bookId,n.chapterId))||[]).forEach(c=>void deleteClip(c.id));}}}><DeleteOutlineRounded fontSize="small"/></button></header>{n.text&&<p dir="auto">{n.text}</p>}<ClipChips clips={byKey.get(noteKey(n.bookId,n.chapterId))||[]} lang={lang}/></article>)}
   {b.marks.length>0&&<ul className="nb-marks">{b.marks.map((m:Mark)=><li key={m.id} className={'nb-mark c-'+m.color}>
    <blockquote dir="auto">{m.quote}</blockquote>
    {m.note.trim()&&<p dir="auto">{m.source==='ai'&&<span className="nb-ai"><AutoAwesomeRounded/>{m.model||'AI'}</span>}{m.note}</p>}
    <footer><button dir="auto" onClick={()=>navigate(chapterPath(m.slug,m.chapter))}>{m.chapterTitle}</button><small>{date(m.updated)}</small><button className="nb-del" aria-label={L('Remove highlight')} onClick={()=>{if(confirm(L('Remove this highlight and its comment?')))removeMark(m.id);}}><DeleteOutlineRounded fontSize="small"/></button></footer>
   </li>)}</ul>}
  </section>)}
 </div>;
}
