import{useEffect,useState}from'react';
import{CheckRounded,MailOutlineRounded}from'@mui/icons-material';
import{confirmMail,unsubscribeMail}from'./api';
import{tr}from'./i18n';

// The links inside the emails land here. Confirming happens on arrival; leaving asks for one tap, so a mail scanner cannot do it by accident.
export default function MailPage({kind,token,lang,navigate}:{kind:'confirm'|'unsubscribe';token:string;lang:string;navigate:(path:string)=>void}){
 const L=(t:string)=>tr(lang,t);
 const[state,setState]=useState<'wait'|'done'|'failed'>('wait'),[email,setEmail]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(kind!=='confirm')return;let live=true;confirmMail(token).then(r=>{if(live){setEmail(r.email);setState('done');}}).catch(()=>{if(live)setState('failed');});return()=>{live=false;};},[kind,token]);
 const leave=async()=>{setBusy(true);try{const r=await unsubscribeMail(token);setEmail(r.email);setState('done');}catch{setState('failed');}finally{setBusy(false);}};
 const heading=state==='failed'?L('This link is no longer valid.'):kind==='confirm'?(state==='done'?L('You are on the list.'):L('Confirming…')):state==='done'?L('You have left the list.'):L('Leave the list?');
 const text=state==='failed'?L('It may have been used already. You can join again from the home page.'):kind==='confirm'?(state==='done'?L('We will write to you when the next book arrives.'):''):state==='done'?L('We will not email you again. Changed your mind? Join again from the home page.'):L('You will stop receiving emails about new books.');
 return <div className="mail-page" dir={lang==='fa'?'rtl':'ltr'}><div className="mail-card">
  <span className="m-pane-icon">{state==='done'?<CheckRounded/>:<MailOutlineRounded/>}</span>
  <h1>{heading}</h1>{email&&state==='done'&&<p className="m-line" dir="ltr">{email}</p>}{text&&<p>{text}</p>}
  {kind==='unsubscribe'&&state==='wait'&&<button className="m-go" disabled={busy} onClick={leave}>{L('Unsubscribe me')}</button>}
  <button className="m-alt" onClick={()=>navigate('/')}>{L('Back to the library')}</button>
 </div></div>;
}
