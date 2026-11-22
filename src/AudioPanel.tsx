// Audio for a published book, any time after publishing: status per language, and a form to make it with the offline voice or the owner's
// own ElevenLabs voice. Owners and editors only. The server does the work; this polls its status every 3 s while a run is going.
import{useEffect,useMemo,useRef,useState}from'react';
import{Alert,Button,Checkbox,Chip,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,LinearProgress,MenuItem,Slider,Switch,Tab,Tabs,TextField,useMediaQuery}from'@mui/material';
import{CloseRounded,DeleteOutlineRounded,GraphicEqRounded,PauseRounded,PlayArrowRounded,ReplayRounded,StopRounded,WarningAmberRounded}from'@mui/icons-material';
import type{Account,ElevenVoice,NarrationEstimate,NarrationStatus,PubDoc}from'./types';
import{ApiError,cancelNarration,deleteNarration,estimateNarration,myVoiceModels,myVoices,narrate,narrationStatus,saveVoiceKey,startNarration}from'./api';
import{actionLabel,changedKeys,chosenKeys,charsOf,costUsd,ELEVEN_SPEED,formFrom,mixesVoices,minutes,needsConfirm,OFFLINE_SPEED,RECOMMENDED,sampleText,settingsOf,type Form}from'./audio-form.ts';
import{languages}from'./core';
import{num,rtl as isRtl,tr}from'./i18n';
import'./audio.css';

interface Props{
 bookId:string;
 // The saved book (not a draft): audio is made from what readers see.
 doc:PubDoc;lang:string;hasKey:boolean;defaultVoice:string;onAccount:()=>void;onVoice:(a:Account)=>void;
 // Unsaved edits exist somewhere: generation waits until they are saved.
 unsaved?:boolean;startLanguage?:string;startScope?:'changed';
 // Called when audio appeared, changed or went away, so the page can show or hide Listen.
 onChanged?:()=>void}
const langName=(code:string,ui:string)=>{const n=languages.find(l=>l.code===code)?.label||code,parts=n.split(' · ');return ui==='fa'?parts[0]:parts[parts.length-1];};

export default function AudioPanel(p:Props){
 const langs=useMemo(()=>[...new Set(p.doc.versions.map(v=>v.language))],[p.doc]);
 const[language,setLanguage]=useState(langs.includes(p.startLanguage||'')?p.startLanguage!:langs[0]||'en');
 const L=(t:string)=>tr(p.lang,t);
 return <div className="au-panel" dir={isRtl(p.lang)?'rtl':'ltr'}>
  {langs.length>1&&<Tabs value={language} onChange={(_,v)=>setLanguage(v)} variant="scrollable" scrollButtons="auto" aria-label={L('Audio language')} className="au-tabs">{langs.map(l=><Tab key={l} value={l} label={langName(l,p.lang)}/>)}</Tabs>}
  <LanguageAudio key={language} {...p} language={language}/>
 </div>;
}

function LanguageAudio({bookId,doc,lang,language,hasKey,defaultVoice,onAccount,onVoice,unsaved=false,startScope,onChanged}:Props&{language:string}){
 const L=(t:string)=>tr(lang,t),N=(n:number)=>num(lang,n);
 const versions=doc.versions.filter(v=>v.language===language);
 const[status,setStatus]=useState<NarrationStatus|null>(null),[loadError,setLoadError]=useState('');
 const[type,setType]=useState(versions[0]?.type||''),[est,setEst]=useState<NarrationEstimate|null>(null);
 const[form,setForm]=useState<Form>(()=>formFrom(null,hasKey)),[open,setOpen]=useState(false),seeded=useRef(false);
 const[error,setError]=useState(''),[busy,setBusy]=useState(''),[confirm,setConfirm]=useState<'start'|'delete'|null>(null),[listen,setListen]=useState(false),[note,setNote]=useState('');
 const[voices,setVoices]=useState<{list:ElevenVoice[];error:string}|null>(null),[models,setModels]=useState<{id:string;name:string}[]>([]),[custom,setCustom]=useState('');
 const[more,setMore]=useState(false);
 const set=(patch:Partial<Form>)=>setForm(f=>({...f,...patch})),setEleven=(patch:Partial<Form['eleven']>)=>setForm(f=>({...f,eleven:{...f.eleven,...patch}}));
 const hasAudio=!!status&&status.tracks.length>0,running=status?.status==='running';
 // ---- status: once, then every 3 s while a run is going
 const before=useRef<string>('');
 const refresh=()=>narrationStatus(bookId,language,true).then(s=>{setStatus(s);setLoadError('');}).catch(e=>setLoadError((e as Error).message));
 useEffect(()=>{void refresh();},[bookId,language]);  // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!running)return;const t=setInterval(()=>void refresh(),3000);return()=>clearInterval(t);},[running,bookId,language]);  // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  if(!status)return;
  // The first answer sets the form to what made the current audio and opens the form when there is none; later answers only report changes.
  if(!seeded.current){seeded.current=true;setForm(f=>({...formFrom(status,hasKey),scope:startScope&&status.tracks.length?startScope:f.scope}));setOpen(!status.tracks.length||!!startScope);if(status.type&&versions.some(v=>v.type===status.type))setType(status.type);}
  if(before.current==='running'&&status.status!=='running')onChanged?.();
  before.current=status.status;
 },[status]);  // eslint-disable-line react-hooks/exhaustive-deps
 // ---- the server's count of what can be narrated, and which of it is out of date; again whenever a run ends
 useEffect(()=>{let live=true;estimateNarration(bookId,language,type||undefined).then(e=>{if(live)setEst(e);}).catch(()=>{if(live)setEst(null);});return()=>{live=false;};},[bookId,language,type,status?.status,status?.updated]);
 // ---- ElevenLabs voices and models, fetched on the server with the stored key, only when that engine is chosen
 useEffect(()=>{
  if(form.engine!=='elevenlabs'||!hasKey||voices)return;
  let live=true;
  myVoices().then(r=>{if(live)setVoices({list:r.voices,error:r.error||''});}).catch(e=>{if(live)setVoices({list:[],error:(e as Error).message});});
  myVoiceModels(language).then(r=>{if(live){setModels(r.models);setForm(f=>f.model?f:{...f,model:r.default});}}).catch(()=>{});
  return()=>{live=false;};
 },[form.engine,hasKey,language]);  // eslint-disable-line react-hooks/exhaustive-deps
 // ---- what a run would cover
 const items=est?.items||[],stale=useMemo(()=>items.filter(i=>i.stale),[est]),changed=changedKeys(items,hasAudio);
 // Chapters kept from the current audio belong to one version; another version is made whole.
 const otherVersion=hasAudio&&!!status?.type&&status.type!==type;
 const scope=otherVersion?'all':form.scope;
 const keys=chosenKeys({scope,picked:form.picked},items,hasAudio),chars=est?charsOf(items,keys):0,seconds=est&&est.chars?Math.round(chars*est.seconds/est.chars):0;
 const eleven=form.engine==='elevenlabs',voiceNow=form.voice||defaultVoice;
 const partial=keys!==undefined,mixed=mixesVoices(partial,status,form.engine,form.voice,defaultVoice);
 const label=actionLabel(hasAudio,scope,keys?.length||0),nothing=partial&&!keys!.length;
 const dir=isRtl(lang)?'rtl':'ltr',sep=lang==='fa'?'، ':', ';
 // ---- preview: a short sample through the same engine and settings, played here
 const player=useRef<HTMLAudioElement|null>(null),[playing,setPlaying]=useState(''),abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>{abort.current?.abort();player.current?.pause();},[]);
 const play=(url:string,id:string)=>{
  if(playing===id){player.current?.pause();setPlaying('');return;}
  player.current?.pause();const a=new Audio(url);player.current=a;a.onended=()=>setPlaying(x=>x===id?'':x);a.onerror=()=>{setPlaying('');setError(L('The sample could not be played.'));};
  setPlaying(id);void a.play().catch(()=>setPlaying(''));
 };
 async function preview(){
  if(playing==='sample'){player.current?.pause();setPlaying('');return;}
  const text=sampleText(doc,language,type,keys);if(!text){setError(L('There is nothing to read in this selection.'));return;}
  setError('');setBusy('preview');abort.current?.abort();abort.current=new AbortController();
  try{const blob=await narrate(text,language,form.engine,abort.current.signal,eleven?form.voice||undefined:undefined,settingsOf(form));play(URL.createObjectURL(blob),'sample');}
  catch(e){if((e as Error).name!=='AbortError'){setError((e as Error).message);if((e as ApiError).status===412)onAccount();}}finally{setBusy('');}
 }
 // ---- start, stop, delete
 async function start(){
  setConfirm(null);setError('');setNote('');setBusy('start');
  try{const s=await startNarration(bookId,language,type||undefined,form.engine,keys,settingsOf(form));setStatus(s);setOpen(false);setListen(false);onChanged?.();}
  catch(e){setError((e as Error).message);if((e as ApiError).status===412)onAccount();}finally{setBusy('');}
 }
 const go=()=>needsConfirm(form.engine,chars)?setConfirm('start'):void start();
 async function stop(){setBusy('stop');setError('');try{const s=await cancelNarration(bookId,language);setStatus(s);if(!s.tracks.length)setOpen(true);}catch(e){setError((e as Error).message);void refresh();}finally{setBusy('');}}
 async function remove(){setConfirm(null);setBusy('delete');setError('');try{setStatus(await deleteNarration(bookId,language));setListen(false);setOpen(true);onChanged?.();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function makeDefault(){
  setError('');setNote('');setBusy('default');
  try{onVoice(await saveVoiceKey({voice:form.voice}));setNote(L('Saved as your default voice.'));}catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 const pickVoice=(id:string)=>{set({voice:id});setCustom('');};
 const customOk=/^[A-Za-z0-9]{1,64}$/.test(custom);
 const engineLabel=(e?:string)=>e==='elevenlabs'?'ElevenLabs':e==='mixed'?L('Mixed voices'):L('Offline voice');
 const mins=status&&status.tracks.length&&status.tracks.every(t=>t.seconds!=null)?minutes(status.tracks.reduce((n,t)=>n+(t.seconds||0),0)):null;
 const speedUsed=status?.settings?.speed??1;
 const made=status?.updated?new Date(status.updated*1000).toLocaleDateString(lang==='fa'?'fa-IR':undefined,{dateStyle:'medium'}):'';
 const runEngine=status?.runEngine||status?.engine;
 const state=!status?'load':running?'running':status.status==='failed'?'failed':hasAudio?'ready':'none';
 if(!versions.length)return null;
 return <div className="au-body">
  {unsaved&&<Alert severity="info" icon={<WarningAmberRounded/>}>{L('Audio is made from the saved text. Save first.')}</Alert>}
  {loadError&&<Alert severity="error">{loadError}</Alert>}
  {/* ---- status card */}
  <section className={'au-card '+state} aria-live="polite">
   {state==='load'&&<div className="au-line"><CircularProgress size={18}/><span>{L('Checking the audio…')}</span></div>}
   {state==='none'&&<div className="au-head"><span className="au-badge"><GraphicEqRounded/></span><div><strong>{L('No audio yet')}</strong><p>{L('Readers don’t see a Listen button until you make one.')}</p></div></div>}
   {state==='running'&&<><div className="au-head"><span className="au-badge on"><CircularProgress size={22}/></span><div><strong>{L('Making audio…')}</strong><p>{L('part')+' '+N(Math.min(status!.total,status!.done+1))+' '+L('of')+' '+N(status!.total)+' · '+engineLabel(runEngine)}</p></div><Button className="au-stop" size="small" color="inherit" disabled={busy==='stop'} startIcon={<StopRounded/>} onClick={stop}>{L('Stop')}</Button></div><LinearProgress variant={status!.done?'determinate':'indeterminate'} value={status!.total?status!.done/status!.total*100:0}/></>}
   {state==='ready'&&<><div className="au-head"><span className="au-badge ok"><GraphicEqRounded/></span><div><strong>{L('Audio is ready')}</strong>
     <p>{N(status!.tracks.length)+' '+L(status!.tracks.length===1?'part':'parts')+(mins?' · '+L('about')+' '+N(mins)+' '+L('min'):'')+' · '+engineLabel(status!.engine)+(status!.engine==='offline'||status!.engine==='elevenlabs'?' '+N(speedUsed)+'×':'')+(made?' · '+L('made')+' '+made:'')}</p></div></div>
    <div className="au-actions">
     <Button size="small" variant="outlined" startIcon={listen?<PauseRounded/>:<PlayArrowRounded/>} onClick={()=>setListen(l=>!l)}>{L(listen?'Hide player':'Listen')}</Button>
     <Button size="small" variant="outlined" startIcon={<ReplayRounded/>} onClick={()=>{set({scope:'all'});setOpen(true);}}>{L('Regenerate')}</Button>
     <Button size="small" color="error" startIcon={<DeleteOutlineRounded/>} disabled={busy==='delete'} onClick={()=>setConfirm('delete')}>{L('Delete')}</Button>
    </div>
    {listen&&<audio className="au-audio" controls autoPlay preload="none" src={status!.tracks[0].url+'?v='+(status!.updated||0)}/>}
    {stale.length>0&&<div className="au-stale" role="status"><Chip size="small" icon={<WarningAmberRounded/>} label={L('Out of date')}/><p>{N(stale.length)+' '+L(stale.length===1?'chapter changed since':'chapters changed since')+': '+stale.slice(0,4).map(i=>i.key==='overview'?L('Overview'):i.title).join(sep)+(stale.length>4?' …':'')}</p>
     <Button size="small" variant="contained" disableElevation onClick={()=>{set({scope:'changed'});setOpen(true);}}>{L('Update these chapters')}</Button></div>}</>}
   {state==='failed'&&<><div className="au-head"><span className="au-badge bad"><WarningAmberRounded/></span><div><strong>{L('The audio could not be made')}</strong><p className="au-err">{status!.error}</p></div></div>
    <div className="au-actions"><Button size="small" variant="contained" disableElevation startIcon={<ReplayRounded/>} disabled={!!busy||unsaved||nothing} onClick={go}>{L('Try again')}</Button></div>
    {hasAudio&&<p className="au-note">{L('The previous audio is still available to listeners.')}</p>}</>}
   {(running||hasAudio)&&<p className="au-note">{L('Listeners keep hearing the current audio until the new one is ready.')}</p>}
  </section>
  {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}{note&&<Alert severity="success" onClose={()=>setNote('')}>{note}</Alert>}
  {/* ---- make audio */}
  {status&&!open&&!running&&<Button className="au-open" variant="text" onClick={()=>setOpen(true)}>{L(hasAudio?'Make new audio…':'Make audio')}</Button>}
  {status&&open&&<section className="au-form" aria-label={L('Make audio')}>
   <h3>{L(hasAudio?'Make new audio':'Make audio')}</h3>
   {versions.length>1&&<TextField select size="small" label={L('Summary version')} value={type} onChange={e=>setType(e.target.value)}>{versions.map(v=><MenuItem key={v.type} value={v.type}>{v.label}</MenuItem>)}</TextField>}
   {otherVersion&&<p className="au-hint">{L('The current audio was made from a different version, so the whole book is made again.')}</p>}
   <fieldset className="au-group"><legend>{L('What to make')}</legend>
    <label className={'au-opt'+(scope==='all'?' on':'')}><input type="radio" name={'scope'+language} checked={scope==='all'} onChange={()=>set({scope:'all'})}/><span><strong>{L('The whole book')}</strong><small>{est?N(est.chars)+' '+L('characters'):'…'}</small></span></label>
    {hasAudio&&!otherVersion&&<label className={'au-opt'+(scope==='changed'?' on':'')+(changed.length?'':' off')}><input type="radio" name={'scope'+language} disabled={!changed.length} checked={scope==='changed'} onChange={()=>set({scope:'changed'})}/><span><strong>{L('Only changed chapters')+' ('+N(changed.length)+')'}</strong><small>{changed.length?items.filter(i=>changed.includes(i.key)).slice(0,3).map(i=>i.key==='overview'?L('Overview'):i.title).join(sep)+(changed.length>3?' …':''):L('Nothing has changed since the audio was made.')}</small></span></label>}
    {!otherVersion&&<label className={'au-opt'+(scope==='pick'?' on':'')}><input type="radio" name={'scope'+language} checked={scope==='pick'} onChange={()=>set({scope:'pick'})}/><span><strong>{L('Choose chapters')}</strong><small>{L(hasAudio?'The others keep their current audio.':'Only these chapters get audio.')}</small></span></label>}
    {scope==='pick'&&<div className="au-list" role="group" aria-label={L('Chapters')}>
     <div className="au-list-tools"><button type="button" onClick={()=>set({picked:items.map(i=>i.key)})}>{L('All')}</button><button type="button" onClick={()=>set({picked:[]})}>{L('None')}</button></div>
     {items.map(i=><FormControlLabel key={i.key} className="au-check" control={<Checkbox size="small" checked={form.picked.includes(i.key)} onChange={e=>set({picked:e.target.checked?[...form.picked,i.key]:form.picked.filter(k=>k!==i.key)})}/>} label={<span className="au-check-label"><span dir="auto">{i.key==='overview'?L('Overview'):i.title}</span><small>{N(i.chars)+' '+L('characters')}{i.stale?' · '+L('changed'):!i.narrated&&hasAudio?' · '+L('no audio yet'):''}</small></span>}/>)}</div>}
   </fieldset>
   <fieldset className="au-group"><legend>{L('Voice')}</legend>
    <div className="au-engines">
     <label className={'au-opt'+(!eleven?' on':'')}><input type="radio" name={'engine'+language} checked={!eleven} onChange={()=>set({engine:'offline'})}/><span><strong>{L('Offline voice')}</strong><small>{L('Free · made on the server')}</small></span></label>
     <label className={'au-opt'+(eleven?' on':'')+(hasKey?'':' off')}><input type="radio" name={'engine'+language} disabled={!hasKey} checked={eleven} onChange={()=>set({engine:'elevenlabs'})}/><span><strong>ElevenLabs</strong><small>{hasKey?L('Natural voices · on your plan'):L('Needs your ElevenLabs key')}</small></span></label>
    </div>
    {!hasKey&&<p className="au-hint"><Button size="small" onClick={onAccount}>{L('Add your key in Account')}</Button></p>}
    {!eleven&&<><div className="au-slider" dir="ltr"><span>{L('Speed')}</span><Slider size="small" min={OFFLINE_SPEED[0]} max={OFFLINE_SPEED[1]} step={.05} value={form.offlineSpeed} onChange={(_,v)=>set({offlineSpeed:v as number})} aria-label={L('Speed')} valueLabelDisplay="auto"/><output>{N(form.offlineSpeed)}×</output></div>
     <p className="au-hint">{L('1.0 is the natural pace. Slower is clearer for study; faster suits review.')}</p></>}
    {eleven&&<div className="au-eleven">
     <h4>{L('Your voices')}</h4>
     {!voices&&<div className="au-line"><CircularProgress size={16}/><span>{L('Loading your voices…')}</span></div>}
     {voices?.error&&<p className="au-hint">{L(voices.error)}</p>}
     {!!voices?.list.length&&<div className="au-voices" role="radiogroup" aria-label={L('Your voices')}>
      <label className={'au-voice'+(!form.voice?' on':'')}><input type="radio" name={'voice'+language} checked={!form.voice} onChange={()=>pickVoice('')}/><span className="au-voice-name">{L('My default voice')}</span>{defaultVoice&&<small>{defaultVoice.slice(0,6)}…</small>}</label>
      {voices.list.map(v=><div key={v.id} className={'au-voice'+(form.voice===v.id?' on':'')}><label><input type="radio" name={'voice'+language} checked={form.voice===v.id} onChange={()=>pickVoice(v.id)}/><span className="au-voice-name" dir="auto">{v.name}</span>{['cloned','generated','professional'].includes(v.category)&&<Chip size="small" label={L('your voice')}/>}</label>
       {v.preview&&<IconButton size="small" aria-label={L('Hear')+' '+v.name} onClick={()=>play(v.preview,'v:'+v.id)}>{playing==='v:'+v.id?<PauseRounded/>:<PlayArrowRounded/>}</IconButton>}</div>)}</div>}
     <div className="au-custom"><TextField size="small" label={L('Or enter a voice ID')} value={custom} error={!!custom&&!customOk} helperText={custom&&!customOk?L('A voice ID has letters and digits only.'):L('From your ElevenLabs voice library.')} onChange={e=>{const v=e.target.value.trim();setCustom(v);if(/^[A-Za-z0-9]{1,64}$/.test(v))set({voice:v});}} slotProps={{htmlInput:{dir:'ltr',maxLength:64,autoCapitalize:'off',spellCheck:false}}}/></div>
     {form.voice&&form.voice!==defaultVoice&&<Button size="small" className="au-default" disabled={busy==='default'} onClick={makeDefault}>{L('Make this my default voice')}</Button>}
     {models.length>0&&<TextField select size="small" label={L('Model')} value={form.model||models[0].id} onChange={e=>set({model:e.target.value})} helperText={L('Only models that read this language are listed.')}>{models.map(m=><MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}</TextField>}
     <Tune label="Speed" help="How fast the voice reads. 1.0 is natural." value={form.eleven.speed} min={ELEVEN_SPEED[0]} max={ELEVEN_SPEED[1]} step={.05} onChange={v=>setEleven({speed:v})} N={N} L={L}/>
     <button type="button" className="au-more" aria-expanded={more} onClick={()=>setMore(m=>!m)}>{L('More voice settings')}</button>
     {more&&<div className="au-adv">
      <Tune label="Stability" help="Higher is steadier and more even. Lower is more expressive." value={form.eleven.stability} min={0} max={1} step={.05} onChange={v=>setEleven({stability:v})} N={N} L={L}/>
      <Tune label="Similarity" help="How closely it keeps to the original voice. Very high can repeat flaws in the recording." value={form.eleven.similarity} min={0} max={1} step={.05} onChange={v=>setEleven({similarity:v})} N={N} L={L}/>
      <Tune label="Style" help="Adds the original speaker’s drama. Keep it at 0 for calm narration." value={form.eleven.style} min={0} max={1} step={.05} onChange={v=>setEleven({style:v})} N={N} L={L}/>
      <div className="au-switch"><div><strong>{L('Speaker boost')}</strong><small>{L('Makes the voice a little closer to the original. Slightly slower.')}</small></div><Switch checked={form.eleven.speakerBoost} onChange={e=>setEleven({speakerBoost:e.target.checked})} slotProps={{input:{'aria-label':L('Speaker boost')}}}/></div>
      <Button size="small" onClick={()=>setEleven({...RECOMMENDED})}>{L('Reset to recommended')}</Button>
     </div>}
    </div>}
    <div className="au-preview"><Button size="small" variant="outlined" startIcon={busy==='preview'?<CircularProgress size={14}/>:playing==='sample'?<PauseRounded/>:<PlayArrowRounded/>} disabled={busy==='preview'||!est||(eleven&&!hasKey)} onClick={preview}>{L('Preview')}</Button><small>{L(eleven?'Reads about 250 characters of the text, and uses a few credits.':'Reads about 250 characters of the text.')}</small></div>
   </fieldset>
   {mixed&&<Alert severity="warning" icon={<WarningAmberRounded/>}>{L('Other chapters keep their current voice.')}</Alert>}
   <div className="au-estimate" role="status">{!est?<span>…</span>:nothing?<span>{L('Nothing to make: choose at least one chapter.')}</span>:<>
    <strong>{'≈ '+N(chars)+' '+L('characters')+' · ≈ '+N(minutes(seconds))+' '+L('min of audio')}</strong>
    <small>{eleven?L('About $0.10 per 1,000 characters on your ElevenLabs plan')+' ≈ $'+num(lang,costUsd(chars)):L('Free · prepared on the server in a few minutes')}</small></>}</div>
   <div className="au-submit">{hasAudio&&<Button onClick={()=>setOpen(false)}>{L('Cancel')}</Button>}
    <Button variant="contained" disableElevation disabled={!!busy||unsaved||running||nothing||!est||(eleven&&!hasKey)} onClick={go} startIcon={busy==='start'?<CircularProgress size={16} color="inherit"/>:undefined}>{L(label.text).replace('{n}',N(label.n))}</Button></div>
  </section>}
  <Dialog open={confirm==='start'} onClose={()=>setConfirm(null)} slotProps={{paper:{dir}}} aria-labelledby="au-confirm"><DialogTitle id="au-confirm">{L('Use your ElevenLabs credits?')}</DialogTitle>
   <DialogContent>{L('This will read about')+' '+N(chars)+' '+L('characters on your ElevenLabs plan')+' (≈ $'+num(lang,costUsd(chars))+'). '+L('It cannot be undone once it starts, but you can stop it.')}</DialogContent>
   <DialogActions><Button onClick={()=>setConfirm(null)}>{L('Cancel')}</Button><Button variant="contained" disableElevation onClick={()=>void start()}>{L('Make audio')}</Button></DialogActions></Dialog>
  <Dialog open={confirm==='delete'} onClose={()=>setConfirm(null)} slotProps={{paper:{dir}}} aria-labelledby="au-del"><DialogTitle id="au-del">{L('Delete this audio?')}</DialogTitle>
   <DialogContent>{L('Readers will no longer see a Listen button for this language until you make audio again.')}</DialogContent>
   <DialogActions><Button onClick={()=>setConfirm(null)}>{L('Cancel')}</Button><Button color="error" variant="contained" disableElevation onClick={()=>void remove()}>{L('Delete')}</Button></DialogActions></Dialog>
 </div>;
}
// One voice setting: a slider with its value and a short explanation under it. The scale is numeric, so the slider stays left to right.
function Tune({label,help,value,min,max,step,onChange,N,L}:{label:string;help:string;value:number;min:number;max:number;step:number;onChange:(v:number)=>void;N:(n:number)=>string;L:(t:string)=>string}){
 return <div className="au-tune"><div className="au-slider" dir="ltr"><span>{L(label)}</span><Slider size="small" min={min} max={max} step={step} value={value} onChange={(_,v)=>onChange(v as number)} aria-label={L(label)}/><output>{N(Math.round(value*100)/100)}</output></div><p className="au-hint">{L(help)}</p></div>;
}

// The panel in a dialog: full screen on a phone.
export function AudioDialog({onClose,...p}:Props&{onClose:()=>void}){
 const phone=useMediaQuery('(max-width:699px)'),L=(t:string)=>tr(p.lang,t);
 return <Dialog open onClose={onClose} fullScreen={phone} fullWidth maxWidth="sm" slotProps={{paper:{dir:isRtl(p.lang)?'rtl':'ltr'}}} aria-labelledby="au-title">
  <DialogTitle id="au-title" className="dialog-heading"><span>{L('Audio')}</span><IconButton aria-label={L('Close')} onClick={onClose}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent><AudioPanel {...p}/></DialogContent>
 </Dialog>;
}
