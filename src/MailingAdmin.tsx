import{useEffect,useState}from'react';
import{ArrowBackRounded,DeleteOutlineRounded}from'@mui/icons-material';
import type{BookRequest,MailingOverview,PubBook}from'./types';
import{announceBook,bookRequests,deleteRequest,mailingOverview,removeSubscriber,setRequest}from'./api';

const STATUS:Record<BookRequest['status'],string>={new:'New',planned:'Planned',done:'Done',declined:'Declined'};
const when=(t:number)=>new Date(t*1000).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const message=(e:unknown)=>e instanceof Error?e.message:'Something went wrong.';
// The owner's desk: what readers asked for, who is on the list, and a trial or real send for each public book.
export default function MailingAdmin({books,onBack,toast}:{books:PubBook[];onBack:()=>void;toast:(text:string)=>void}){
 const[requests,setRequests]=useState<BookRequest[]|null>(null),[mail,setMail]=useState<MailingOverview|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const load=()=>{bookRequests().then(setRequests).catch(e=>setError(message(e)));mailingOverview().then(setMail).catch(e=>setError(message(e)));};
 useEffect(load,[]);
 const run=async(key:string,job:()=>Promise<string|void>)=>{setBusy(key);setError('');try{const done=await job();if(done)toast(done);load();}catch(e){setError(message(e));}finally{setBusy('');}};
 const sentFor=(id:string)=>mail?.sent.find(s=>s.bookId===id);
 const publicBooks=books.filter(b=>b.visibility==='public');
 return <div className="admin-mail">
  <button className="text-link" onClick={onBack}><ArrowBackRounded/>Back</button>
  <h1>Requests and mailing list</h1>
  {error&&<p className="m-error" role="alert">{error}</p>}
  <section><h2>Subscribers</h2>
   {mail?<><div className="admin-stats"><span><b>{mail.active}</b>on the list</span><span><b>{mail.pending}</b>unconfirmed</span><span><b>{mail.left}</b>left</span></div>
    <p className="admin-note">{mail.auto?'A new public book is mailed automatically ten minutes after it was last edited.':'Automatic mailing is off. Send each book below yourself.'}</p>
    {mail.people.length>0&&<details><summary>Show addresses</summary><ul className="admin-people">{mail.people.map(p=><li key={p.email}><span dir="ltr">{p.email}</span><small>{p.status} · {p.source} · {when(p.created)}</small><button aria-label={'Remove '+p.email} onClick={()=>run('rm'+p.email,async()=>{await removeSubscriber(p.email);})}><DeleteOutlineRounded/></button></li>)}</ul></details>}</>:<p>Loading…</p>}
  </section>
  <section><h2>Mail a book</h2>
   <p className="admin-note">Send yourself a trial first. Sending to everyone happens once per book.</p>
   <ul className="admin-books">{publicBooks.map(b=>{const sent=sentFor(b.id),done=!!sent;return <li key={b.id}><span dir="auto"><b>{b.title.split(':')[0]}</b><small>{sent?'Sent to '+sent.count+' · '+when(sent.sent):'Not sent yet'}</small></span>
    <button disabled={!!busy} onClick={()=>run('t'+b.id,async()=>{const r=await announceBook(b.id,true);return r.sent?'Trial email sent to you.':'The trial email could not be sent.';})}>{busy==='t'+b.id?'Sending…':'Send me a trial'}</button>
    <button className="primary" disabled={!!busy||done||(mail?.active||0)===0} onClick={()=>{if(confirm('Email “'+b.title.split(':')[0]+'” to '+mail?.active+' subscribers? This happens once.'))run('a'+b.id,async()=>{const r=await announceBook(b.id,false);return 'Sent to '+r.sent+(r.failed?' · '+r.failed+' failed':'')+'.';});}}>{busy==='a'+b.id?'Sending…':'Send to everyone'}</button></li>;})}</ul>
  </section>
  <section><h2>Requested books</h2>
   {requests===null?<p>Loading…</p>:requests.length===0?<p className="admin-note">No requests yet.</p>:<ul className="admin-requests">{requests.map(r=><li key={r.id} className={r.status}>
    <div><b dir="auto">{r.title}</b>{r.author&&<span dir="auto"> · {r.author}</span>}{r.same>1&&<em> · asked {r.same} times</em>}
     {r.note&&<p dir="auto">{r.note}</p>}<small>{when(r.created)}{r.email?' · '+r.email:''}{r.told?' · told it is ready':''}</small></div>
    <div className="admin-actions">
     <select aria-label="Status" value={r.status} onChange={e=>run('s'+r.id,async()=>{await setRequest(r.id,e.target.value,r.bookId||undefined);})}>{Object.entries(STATUS).filter(([k])=>k!=='done'||r.status==='done'||!publicBooks.length).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
     {r.status!=='done'&&publicBooks.length>0&&<select aria-label="Mark done with this book" value="" onChange={e=>{if(e.target.value)run('d'+r.id,async()=>{const x=await setRequest(r.id,'done',e.target.value);return x.told?'Marked done. They have been told.':'Marked done.';});}}><option value="">Done with…</option>{publicBooks.map(b=><option key={b.id} value={b.id}>{b.title.split(':')[0]}</option>)}</select>}
     <button aria-label="Delete request" onClick={()=>run('x'+r.id,async()=>{await deleteRequest(r.id);})}><DeleteOutlineRounded/></button></div></li>)}</ul>}
  </section>
 </div>;
}
