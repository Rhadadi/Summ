import{useEffect,useState}from'react';
import{CheckRounded,MailOutlineRounded,MenuBookRounded}from'@mui/icons-material';
import type{Account}from'./types';
import{leaveMail,mailStatus,requestBook,subscribeMail}from'./api';
import{tr}from'./i18n';

type Joined='none'|'pending'|'active'|'unsubscribed';
const message=(e:unknown)=>e instanceof Error?e.message:'Something went wrong. Please try again.';
// Two doors for readers: ask for a book to be summarised, and hear about each new one by email, with or without an account.
export default function Community({lang,account,mailEnabled}:{lang:string;account:Account|null;mailEnabled:boolean}){
 const L=(t:string)=>tr(lang,t),mine=account?.user.email||'';
 const[title,setTitle]=useState(''),[by,setBy]=useState(''),[note,setNote]=useState(''),[reply,setReply]=useState(mine),[trap,setTrap]=useState(''),[asked,setAsked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const[email,setEmail]=useState(mine),[joined,setJoined]=useState<Joined>('none'),[mailBusy,setMailBusy]=useState(false),[mailError,setMailError]=useState('');
 useEffect(()=>{setReply(r=>r||mine);setEmail(r=>r||mine);},[mine]);
 useEffect(()=>{if(!account||!mine)return;let live=true;mailStatus().then(s=>{if(live)setJoined(s.status);}).catch(()=>{});return()=>{live=false;};},[account,mine]);
 const ask=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{await requestBook({title,author:by,note,email:reply,lang,website:trap});setAsked(true);setTitle('');setBy('');setNote('');}catch(x){setError(message(x));}finally{setBusy(false);}};
 const join=async(e?:React.FormEvent)=>{e?.preventDefault();if(mailBusy)return;setMailBusy(true);setMailError('');
  try{const r=await subscribeMail(account&&mine&&(!email||email===mine)?'':email,lang,trap);setJoined(r.status);}catch(x){setMailError(message(x));}finally{setMailBusy(false);}};
 const leave=async()=>{setMailBusy(true);try{await leaveMail();setJoined('unsubscribed');}catch(x){setMailError(message(x));}finally{setMailBusy(false);}};
 const own=!!account&&!!mine&&(!email||email===mine);
 return <section className="m-community" dir={lang==='fa'?'rtl':'ltr'} aria-label={L('Ask for a book')}>
  <div className={'m-community-grid'+(mailEnabled?'':' single')}>
   <div className="m-pane">
    <span className="m-pane-icon"><MenuBookRounded/></span>
    <h2>{L('Is there a book you wish you could read in minutes?')}</h2>
    <p>{L('Tell us which one. We read what you ask for, and the most requested books come first.')}</p>
    {asked?<div className="m-thanks" role="status"><CheckRounded/><div><strong>{L('Thank you. Your request is in.')}</strong><span>{reply?L('We will write to you when the summary is ready.'):L('Ask for another any time.')}</span><button onClick={()=>setAsked(false)}>{L('Ask for another book')}</button></div></div>
    :<form className="m-form" onSubmit={ask}>
     <input required minLength={2} maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder={L('Book title')} aria-label={L('Book title')} dir="auto"/>
     <input maxLength={200} value={by} onChange={e=>setBy(e.target.value)} placeholder={L('Author (optional)')} aria-label={L('Author (optional)')} dir="auto"/>
     <textarea maxLength={1000} rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder={L('Why this book? (optional)')} aria-label={L('Why this book? (optional)')} dir="auto"/>
     <input type="email" maxLength={254} value={reply} onChange={e=>setReply(e.target.value)} placeholder={L('Your email, to hear when it is ready (optional)')} aria-label={L('Your email, to hear when it is ready (optional)')} dir="ltr"/>
     <input className="m-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={e=>setTrap(e.target.value)} name="website"/>
     {error&&<p className="m-error" role="alert">{error}</p>}
     <button className="m-go" disabled={busy||title.trim().length<2}>{busy?L('Sending…'):L('Send the request')}</button>
    </form>}
   </div>
   {mailEnabled&&<div className="m-pane m-pane-dark">
    <span className="m-pane-icon"><MailOutlineRounded/></span>
    <h2>{L('Hear about every new book first')}</h2>
    <p>{L('One short, beautiful email each time a new summary is published. No account needed, and you can leave with one click.')}</p>
    {joined==='active'?<div className="m-thanks" role="status"><CheckRounded/><div><strong>{L('You are on the list.')}</strong><span>{L('We will write to you when the next book arrives.')}</span>{own&&<button onClick={leave} disabled={mailBusy}>{L('Leave the list')}</button>}</div></div>
    :joined==='pending'?<div className="m-thanks" role="status"><MailOutlineRounded/><div><strong>{L('Check your inbox.')}</strong><span>{L('If this address is not on the list yet, we have sent it a link to confirm. It takes one tap.')}</span></div></div>
    :<form className="m-form" onSubmit={join}>
     {own&&joined!=='unsubscribed'?<p className="m-line">{L('Use the email of your account')}: <b dir="ltr">{mine}</b></p>
     :<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder={L('Your email')} aria-label={L('Your email')} dir="ltr"/>}
     {mailError&&<p className="m-error" role="alert">{mailError}</p>}
     <button className="m-go" disabled={mailBusy||(!own&&!email.includes('@'))}>{mailBusy?L('Sending…'):joined==='unsubscribed'?L('Join the list again'):L('Keep me posted')}</button>
     {account&&mine&&!own&&<button type="button" className="m-alt" onClick={()=>setEmail(mine)}>{L('Use my account email')}</button>}
    </form>}
   </div>}
  </div>
 </section>;
}
