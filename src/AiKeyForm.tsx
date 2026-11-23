// Choose a provider, paste a key, pick a model. Used in Settings and inside the chat panel when no key is set yet.
import{useState}from'react';
import{IconButton,InputAdornment,MenuItem,TextField,ToggleButton,ToggleButtonGroup}from'@mui/material';
import{VisibilityOffOutlined,VisibilityOutlined}from'@mui/icons-material';
import{PROVIDERS,modelOf,shortcutLabel,useAi,type Provider}from'./ai-settings';
import{tr}from'./i18n';
export default function AiKeyForm({lang,compact,account}:{lang:string;compact?:boolean;account?:{model:string;hint:string}|null}){
 const L=(t:string)=>tr(lang,t),[s,save]=useAi(),[show,setShow]=useState(false);
 const useAccount=!!account&&(s.provider==='account'||!s.chosen);
 const p=PROVIDERS.find(x=>x.id===(s.provider==='account'?'gemini':s.provider))!;
 return <div className="ai-form" dir={lang==='fa'?'rtl':'ltr'}>
  <ToggleButtonGroup fullWidth exclusive size="small" value={account&&useAccount?'account':s.provider==='account'?'gemini':s.provider} onChange={(_,v:Provider|'account'|null)=>{if(v)save({...s,provider:v,chosen:true});}} aria-label={L('AI provider')}>
   {account&&<ToggleButton value="account">{L('My account')}</ToggleButton>}
   {PROVIDERS.map(x=><ToggleButton key={x.id} value={x.id}>{x.name}</ToggleButton>)}
  </ToggleButtonGroup>
  {account&&useAccount?<p className="ai-form-note">{L('Uses the Gemini key saved in your account')} (…{account.hint} · <span dir="ltr">{account.model}</span>). {L('Nothing else to set.')}</p>:<>
  <TextField fullWidth size="small" label={L('API key')+' · '+p.name} placeholder={p.keyHint} type={show?'text':'password'} autoComplete="off" value={s.keys[p.id]||''} onChange={e=>save({...s,keys:{...s.keys,[p.id]:e.target.value.trim()}})}
   slotProps={{htmlInput:{dir:'ltr',spellCheck:false},input:{endAdornment:<InputAdornment position="end"><IconButton size="small" aria-label={L(show?'Hide key':'Show key')} onClick={()=>setShow(!show)}>{show?<VisibilityOffOutlined fontSize="small"/>:<VisibilityOutlined fontSize="small"/>}</IconButton></InputAdornment>}}}/>
  <TextField select fullWidth size="small" label={L('Model')} value={modelOf(s,p.id)} onChange={e=>save({...s,models:{...s.models,[p.id]:e.target.value}})}>
   {p.models.map(m=><MenuItem key={m.id} value={m.id}>{m.name} · {L(m.note)}</MenuItem>)}
  </TextField>
  <p className="ai-form-note">{L('Your key stays in this browser and goes straight to')} {p.name}{lang==='fa'?' ':'; '}{L('Inkling never sees it. Usage is billed to your account.')} <a href={p.keyUrl} target="_blank" rel="noreferrer">{L('Get a key')}</a>{s.keys[p.id]&&<> · <button className="text-link2 inline" onClick={()=>save({...s,keys:{...s.keys,[p.id]:''}})}>{L('Remove key')}</button></>}</p>
  </>}
  {!compact&&<p className="ai-form-note">{L('Open the companion while reading with')} <kbd dir="ltr">{shortcutLabel()}</kbd>.</p>}
 </div>;
}
