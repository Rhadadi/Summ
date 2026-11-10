import{useEffect,useRef,useState}from'react';
import{Alert,Autocomplete,Button,Dialog,DialogContent,DialogTitle,Divider,IconButton,TextField,ToggleButton,ToggleButtonGroup}from'@mui/material';
import{CheckRounded,CloseRounded,LockOutlined}from'@mui/icons-material';
import type{Account,AppConfig}from'./types';
import{deleteAccount,googleLogin,login,logout,register,removeKey,removeVoiceKey,saveKey,saveVoiceKey}from'./api';
import{listPrice,modelSuggestions}from'./cost';

declare global{interface Window{google?:{accounts:{id:{initialize:(o:{client_id:string;callback:(r:{credential:string})=>void})=>void;renderButton:(el:HTMLElement,o:Record<string,unknown>)=>void}}}}}
function loadGoogle():Promise<void>{
 if(window.google?.accounts)return Promise.resolve();
 return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>resolve();s.onerror=()=>reject(Error('Google sign-in could not load.'));document.head.appendChild(s);});
}
interface Props{open:boolean;account:Account|null;config:AppConfig|null;onClose:()=>void;onAccount:(account:Account|null)=>void;onSignedOut:()=>void}
export default function AccountDialog({open,account,config,onClose,onAccount,onSignedOut}:Props){
 const[mode,setMode]=useState<'login'|'register'>('login'),[username,setUsername]=useState(''),[password,setPassword]=useState('');
 const[apiKey,setApiKey]=useState(''),[model,setModel]=useState('gemini-flash-latest'),[priceIn,setPriceIn]=useState(''),[priceOut,setPriceOut]=useState('');
 const[voiceKey,setVoiceKey]=useState(''),[voiceId,setVoiceId]=useState('');
 useEffect(()=>{if(open){setVoiceKey('');setVoiceId(account?.voice?.option||'');}},[open,account?.voice]);
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmDelete,setConfirmDelete]=useState(false);
 const googleButton=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;setError('');setNotice('');setConfirmDelete(false);setPassword('');setApiKey('');const key=account?.key;setModel(key?.model||'gemini-flash-latest');setPriceIn(key?.price_in!=null?String(key.price_in):'');setPriceOut(key?.price_out!=null?String(key.price_out):'');},[open,account?.key]);
 useEffect(()=>{
  const clientId=config?.google_client_id;if(!open||account||!clientId)return;let live=true;
  // The dialog content mounts after the open transition starts, so wait a frame for the container.
  const frame=requestAnimationFrame(()=>loadGoogle().then(()=>{if(!live||!googleButton.current||!window.google)return;window.google.accounts.id.initialize({client_id:clientId,callback:r=>act(()=>googleLogin(r.credential).then(onAccount))});window.google.accounts.id.renderButton(googleButton.current,{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:320});}).catch(e=>{if(live)setError(e.message);}));
  return()=>{live=false;cancelAnimationFrame(frame);};
 },[open,account,config?.google_client_id]);
 async function act(task:()=>Promise<unknown>,done=''){setBusy(true);setError('');setNotice('');try{await task();if(done)setNotice(done);}catch(e){setError(e instanceof Error?e.message:'Something went wrong.');}finally{setBusy(false);}}
 const price=(value:string)=>value.trim()===''?null:Number(value);
 const list=listPrice(model);
 const pricesValid=[priceIn,priceOut].every(v=>v.trim()===''||(Number.isFinite(Number(v))&&Number(v)>=0))&&(priceIn.trim()==='')===(priceOut.trim()==='');
 return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="account-title" slotProps={{paper:{className:'account-sheet'}}}>
  <DialogTitle id="account-title" className="dialog-heading"><span>{account?'Account':'Sign in to Summ'}</span><IconButton aria-label="Close account" onClick={onClose}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent>
   {!account?<form className="account-form" onSubmit={e=>{e.preventDefault();act(()=>(mode==='login'?login:register)(username,password).then(onAccount));}}>
    <p className="dialog-lead">Your books stay on this device. Your account holds only your own Gemini key, so summaries are billed to you.</p>
    {config?.google_client_id&&<><div className="google-button" ref={googleButton}/><div className="or-divider"><span>or</span></div></>}
    {config?.signup!==false&&<ToggleButtonGroup fullWidth exclusive value={mode} onChange={(_,v)=>{if(v)setMode(v);}} aria-label="Account action"><ToggleButton value="login">Sign in</ToggleButton><ToggleButton value="register">Create account</ToggleButton></ToggleButtonGroup>}
    <TextField fullWidth label="Username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} helperText={mode==='register'?'3–32 letters, digits, dots, dashes or underscores.':''}/>
    <TextField fullWidth type="password" label="Password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} helperText={mode==='register'?'At least 10 characters.':''}/>
    <Button type="submit" variant="contained" size="large" disabled={busy||!username.trim()||!password}>{busy?'One moment…':mode==='login'?'Sign in':'Create account'}</Button>
   </form>:<div className="account-form">
    <div className="account-user"><span className="account-avatar">{account.user.name.slice(0,1).toUpperCase()}</span><div><strong>{account.user.name}</strong><span>{account.key?'Gemini key ending …'+account.key.hint:'No Gemini key yet'}</span></div></div>
    {account.key?<Alert icon={<CheckRounded/>} severity="success">Verified with Google and encrypted on the server.</Alert>:<Alert severity="info">Create a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>, then paste it here.</Alert>}
    <TextField fullWidth type="password" autoComplete="off" label={account.key?'Replace key (optional)':'Gemini API key'} value={apiKey} onChange={e=>setApiKey(e.target.value)}/>
    <Autocomplete freeSolo options={modelSuggestions} inputValue={model} onInputChange={(_,v)=>setModel(v.trim())} renderInput={params=><TextField {...params} label="Model" helperText={list?'List price $'+list.input+' in / $'+list.output+' out per 1M tokens.'+(list.note?' '+list.note:''):'No list price known for this model. Enter yours below for dollar estimates.'}/>}/>
    <div className="price-row"><TextField label="Input $ / 1M" inputMode="decimal" placeholder={list?String(list.input):''} value={priceIn} onChange={e=>setPriceIn(e.target.value)}/><TextField label="Output $ / 1M" inputMode="decimal" placeholder={list?String(list.output):''} value={priceOut} onChange={e=>setPriceOut(e.target.value)}/></div>
    <p className="settings-help">Leave prices empty to use Google’s list price. They only drive the estimate shown before each run.</p>
    <Button variant="contained" size="large" disabled={busy||!model||!pricesValid||(!account.key&&!apiKey.trim())} onClick={()=>act(()=>saveKey({...(apiKey.trim()?{api_key:apiKey.trim()}:{}),model,price_in:price(priceIn),price_out:price(priceOut)}).then(a=>{onAccount(a);setApiKey('');}),'Saved. Google accepted the key and model.')}>{busy?'Checking with Google…':'Save'}</Button>
    {account.key&&<Button color="error" disabled={busy} onClick={()=>act(()=>removeKey().then(onAccount),'Key removed from the server.')}>Remove key</Button>}
    <Divider/>
    <h3 className="settings-section-title">Narration with ElevenLabs (optional)</h3>
    <p className="settings-help">The free offline voice works without this. With your own <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer">ElevenLabs key</a>, narration uses their voices and is billed to your plan (about $0.10 per 1,000 characters).{account.voice?' Saved key ending …'+account.voice.hint+'.':''}</p>
    <TextField fullWidth type="password" autoComplete="off" label={account.voice?'Replace ElevenLabs key (optional)':'ElevenLabs API key'} value={voiceKey} onChange={e=>setVoiceKey(e.target.value)}/>
    <TextField fullWidth label="Voice ID (optional)" value={voiceId} onChange={e=>setVoiceId(e.target.value.replace(/[^A-Za-z0-9]/g,''))} helperText="Leave empty for a standard narrator voice."/>
    <div className="account-actions"><Button variant="outlined" disabled={busy||(!account.voice&&!voiceKey.trim())} onClick={()=>act(()=>saveVoiceKey({...(voiceKey.trim()?{api_key:voiceKey.trim()}:{}),voice:voiceId}).then(a=>{onAccount(a);setVoiceKey('');}),'ElevenLabs settings saved.')}>Save narration</Button>{account.voice&&<Button color="error" disabled={busy} onClick={()=>act(()=>removeVoiceKey().then(onAccount),'ElevenLabs key removed.')}>Remove</Button>}</div>
    <Divider/>
    <div className="account-actions"><Button disabled={busy} onClick={()=>act(()=>logout().then(onSignedOut))}>Sign out</Button>{confirmDelete?<Button color="error" variant="contained" disabled={busy} onClick={()=>act(()=>deleteAccount().then(onSignedOut))}>Delete account and key</Button>:<Button color="error" disabled={busy} onClick={()=>setConfirmDelete(true)}>Delete account…</Button>}</div>
   </div>}
   {notice&&<Alert severity="success" sx={{mt:2}}>{notice}</Alert>}{error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
   <div className="small-note"><LockOutlined fontSize="small"/><span>Sessions use a secure, HttpOnly cookie. Keys are encrypted at rest and never sent back to the browser.</span></div>
  </DialogContent>
 </Dialog>;
}
