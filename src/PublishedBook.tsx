import{lazy,Suspense,useEffect,useMemo,useRef,useState,type ReactNode}from'react';
import{Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Snackbar,TextField}from'@mui/material';
import{bookCategories,categoryById,categoryName}from'./categories';
import type{HomeConfig,PubBook,PubDoc,RelatedBook,Review,Settings}from'./types';
import{bookBackdrop,homeBooks}from'./bookBackdrop';
import{ApiError,libraryBook,libraryReception,libraryRelated,narrationStatus,publishBook,setFrame}from'./api';
import{adaptPublished,pickVersion,readPosition,savePosition,versionKey}from'./published';
import{languages}from'./core';
import BookDetail from'./BookDetail';import ReaderPage from'./ReaderPage';
import{tr,num}from'./i18n';
import{audioFor,canListenTo,listeningPlace,trackSignature}from'./listening';
import{chapterHint,editorRoute}from'./view-switch.ts';
import{EditOutlined,GraphicEqRounded,VisibilityOutlined,WallpaperRounded}from'@mui/icons-material';
import{staleTitles,type AudioEnv}from'./audio-form.ts';
import type{PlayerApi}from'./Player';
import{persianReception}from'./persian-reception';
import{applyDraft,diffCount,dropEmpty,loadDraft,overlaps,readScope,scopeName,storeDraft,type Draft}from'./inline-draft.ts';
import{editorProblems,publishProblems}from'./replace-import.ts';
import{useDraft}from'./use-draft';
import{EditContext,type EditCtl}from'./edit-context';
// The inline editor is loaded only when an owner switches editing on; visitors never download it.
const loadEditor=()=>import('./InlineEditor');
// Audio is for owners and editors; it loads on demand too.
const FrameDialog=lazy(()=>import('./FrameDialog'));
const AudioDialog=lazy(()=>import('./AudioPanel').then(m=>({default:m.AudioDialog})));
const EditList=lazy(()=>loadEditor().then(m=>({default:m.EditList}))),EditText=lazy(()=>loadEditor().then(m=>({default:m.EditText}))),EditBar=lazy(()=>loadEditor().then(m=>({default:m.EditBar}))),RestoreBanner=lazy(()=>loadEditor().then(m=>({default:m.RestoreBanner}))),EditChrome=lazy(()=>loadEditor().then(m=>({default:m.EditChrome})));
const editingKey=(id:string)=>'inkling-editing:'+id;

interface Props{listenOnOpen?:boolean;slug:string;mode:'detail'|'read';section:string;settings:Settings;player:PlayerApi;navigate:(path:string)=>void;toast:(message:string)=>void;onPreferences:(patch:Partial<Settings>)=>void;published:PubBook[]|null;home:HomeConfig|null;
 // Editors only: the view switch, and the books they may edit.
 owner?:{asVisitor:boolean;onToggle:()=>void;editable:string[];audio?:AudioEnv};
 // After an inline save: the app refreshes its book lists.
 onSaved?:()=>void}
const noop=()=>{};
export default function PublishedBook({listenOnOpen=false,slug,mode,section,settings,player,navigate,toast,onPreferences,published,home,owner,onSaved}:Props){
 const L=(t:string)=>tr(settings.uiLanguage||'fa',t);
 const[pub,setPub]=useState<(PubBook&{doc:PubDoc})|null>(null),[error,setError]=useState(''),[chosen,setChosen]=useState(''),[position,setPosition]=useState({index:0,completed:[] as string[],lastRead:0});
 useEffect(()=>{let live=true;setPub(null);setError('');libraryBook(slug).then(b=>{if(!live)return;
  // an old link (book-dab5e9) or the id still opens the book; the address bar then shows the readable one
  if(b.slug!==slug){if(!location.hash){history.replaceState(null,'','/b/'+encodeURIComponent(b.slug));window.dispatchEvent(new HashChangeEvent('hashchange'));return;}
   const here=decodeURIComponent(location.hash.slice(1));location.replace('#'+here.replace('/b/'+slug,'/b/'+b.slug));return;}
  setPub(b);setPosition(readPosition(b.id));}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[slug]);
 // the book page shows its shareable address (/b/<slug>), so copying it from the address bar also gives a preview
 useEffect(()=>{if(pub&&mode==='detail'&&location.pathname==='/'&&location.hash)history.replaceState(null,'','/b/'+encodeURIComponent(pub.slug));},[pub,mode]);
 const version=pub?pickVersion(pub.doc,chosen,settings.language):undefined;
 // ---- inline editing: the owner's draft lives here (use-draft.ts); the editor itself loads lazily
 const vk=version?versionKey(version):'',mayEdit=!!owner&&!owner.asVisitor&&!!pub&&owner.editable.includes(pub.id);
 const[editing,setEditingRaw]=useState(false),[saving,setSaving]=useState(false),[saveState,setSaveState]=useState<'idle'|'saved'|'conflict'|'error'>('idle'),[stored,setStored]=useState<Draft|null>(null),[ask,setAsk]=useState<'leave'|'discard'|null>(null),[conflict,setConflict]=useState<{latest:PubBook&{doc:PubDoc};clash:string[]}|null>(null);
 const d=useDraft(pub?.doc||null,pub?.id||'',pub?.rev||'',vk);
 const active=editing&&mayEdit&&mode==='read';
 const asDraft=(changes=d.changes):Draft=>({book:pub?.id||'',base:pub?.rev||'',vk,changes,at:Date.now()});
 const unsaved=pub&&Object.keys(d.changes).length?diffCount(pub.doc,asDraft()):0;
 function setEditing(on:boolean){setEditingRaw(on);if(pub)try{if(on)sessionStorage.setItem(editingKey(pub.id),'1');else sessionStorage.removeItem(editingKey(pub.id));}catch{/* private mode */}}
 function restore(s:Draft){if(!pub)return;if(s.vk!==vk)setChosen(s.vk);d.reset(s.changes);setStored(null);setEditing(true);}
 // Opening a book: start clean, then pick up where this tab left off. A draft kept from earlier is offered, or simply resumed when this tab was editing it.
 useEffect(()=>{
  d.reset({});setSaveState('idle');setConflict(null);setStored(null);setAsk(null);
  if(!pub){setEditingRaw(false);return;}
  let on=false;try{on=sessionStorage.getItem(editingKey(pub.id))==='1';}catch{/* private mode */}
  setEditingRaw(on);
  const s=loadDraft(pub.id);
  if(s&&!pub.doc.versions.some(v=>versionKey(v)===s.vk)){storeDraft(pub.id,null);return;}
  if(s&&on)restore(s);else setStored(s);
 },[pub?.id]);  // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  if(!active||!unsaved)return;
  const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
 },[active,unsaved>0]);
 const enter=()=>{void loadEditor().then(()=>{if(stored)restore(stored);else setEditing(true);});};
 function finish(){d.flush();if(unsaved>0)setAsk('leave');else setEditing(false);}
 // Saving goes live at once, so it is never automatic. The book is checked first; a 409 means someone saved in between.
 async function save():Promise<boolean>{
  if(saving||!pub)return false;
  d.flush();
  const draft=asDraft(d.live);if(!Object.keys(draft.changes).length)return true;
  const doc=dropEmpty(applyDraft(pub.doc,draft)),problems=[...editorProblems(doc),...publishProblems(doc)];
  if(problems.length){toast(problems[0]);setSaveState('error');return false;}
  setSaving(true);
  try{
   const updated=await publishBook({id:pub.id,doc,visibility:pub.visibility,base:pub.rev});
   setPub(updated);d.reset({});storeDraft(pub.id,null);setSaveState('saved');setConflict(null);onSaved?.();
   // Listeners keep the old audio until it is updated; tell the owner which chapters it no longer matches.
   if(owner?.audio)narrationStatus(updated.id,version!.language,true).then(s=>{setAudioStatus(s);setStaleNote(staleTitles(updated.doc,version!.language,s.staleChapters||[],L('Overview')));}).catch(()=>{});
   return true;
  }catch(e){
   if(e instanceof ApiError&&e.status===409){
    try{const latest=await libraryBook(pub.id);setConflict({latest,clash:overlaps(pub.doc,latest.doc,draft).map(sc=>scopeName(latest.doc,vk,sc)||(sc.startsWith('ov')?L('The overview'):L('A study guide section')))});setSaveState('conflict');}
    catch(err){toast((err as Error).message);setSaveState('error');}
   }else{toast((e as Error).message);setSaveState('error');}
   return false;
  }finally{setSaving(false);}
 }
 function resolve(keep:boolean){
  if(!conflict||!pub)return;
  const{latest}=conflict;setConflict(null);setSaveState('idle');setPub(latest);
  if(keep&&latest.doc.versions.some(v=>versionKey(v)===vk)){d.reset(d.live);toast(L('Loaded the latest version; your edits are kept'));}
  else{d.reset({});storeDraft(pub.id,null);toast(L(keep?'Your edits no longer fit this book and were dropped':'Your edits were discarded'));}
 }
 function discard(){if(!pub)return;d.reset({});storeDraft(pub.id,null);setStored(null);setSaveState('idle');setAsk(null);}
 // Until the owner approves a researched reception, the page shows the reviews Wikipedia and the newspapers' own APIs list.
 const[found,setFound]=useState<Review|null>(null),[related,setRelated]=useState<RelatedBook[]>([]);
 useEffect(()=>{setRelated([]);if(!pub||!version)return;let live=true;libraryRelated(pub.id,version.language).then(r=>{if(live)setRelated(r);}).catch(()=>{});return()=>{live=false;};},[pub?.id,version?.language]);
 useEffect(()=>{setFound(null);if(!pub||pub.doc.review)return;let live=true;libraryReception(pub.id,version?.language||'en').then(r=>{if(live&&r.critics.length)setFound({verdict:'',pros:[],cons:[],quotes:[],sources:[],rating:null,model:'',createdAt:0,critics:r.critics});}).catch(()=>{});return()=>{live=false;};},[pub,version?.language]);
 const[audioStatus,setAudioStatus]=useState<Awaited<ReturnType<typeof narrationStatus>>|null>(null);
 useEffect(()=>{setAudioStatus(null);if(!pub||!version)return;let live=true;narrationStatus(pub.id,version.language).then(s=>{if(live)setAudioStatus(s);}).catch(()=>{});return()=>{live=false;};},[pub?.id,version?.language]);
 // The Audio panel (owners), and the notice after a save when the audio was made from the earlier text.
 const[framing,setFraming]=useState(false),[audioOpen,setAudioOpen]=useState<{scope?:'changed'}|null>(null),[staleNote,setStaleNote]=useState<string[]>([]);
 const audioChanged=()=>{if(!pub||!version)return;narrationStatus(pub.id,version.language).then(setAudioStatus).catch(()=>{});onSaved?.();};
 // While editing, the page shows the draft; every other view shows what is saved.
 const shown=useMemo(()=>pub&&active&&Object.keys(d.changes).length?applyDraft(pub.doc,{book:pub.id,base:pub.rev||'',vk,changes:d.changes,at:0}):pub?.doc,[pub,active,d.changes,vk]);
 const adapted=useMemo(()=>{if(!pub||!version||!shown)return null;return adaptPublished(pub,shown,shown.versions.find(x=>versionKey(x)===versionKey(version))||version,position);},[pub,version,position,shown]);
 // #/b/slug/read/c:<chapterId> opens that chapter (the editor's "View as visitor" uses it). Applied once, so moving on is free.
 const hint=mode==='read'?chapterHint(section):null,hinted=useRef('');
 useEffect(()=>{
  if(!hint||!pub||!adapted||hinted.current===pub.id+':'+hint)return;
  hinted.current=pub.id+':'+hint;
  const i=adapted.book.chapters.findIndex(c=>c.id===hint);
  if(i<0||i===adapted.book.chapterIndex)return;
  const merged={...position,index:i,lastRead:Date.now()};setPosition(merged);savePosition(pub.id,merged);
 },[hint,pub,adapted]);
 const autoStarted=useRef('');
 useEffect(()=>{
  if(!listenOnOpen){autoStarted.current='';return;}
  if(!pub||!version||!adapted||!audioStatus||autoStarted.current===pub.id)return;
  autoStarted.current=pub.id;
  if(audioStatus.status==='ready'&&audioStatus.tracks.length)void player.load({id:'pub:'+pub.id,title:adapted.book.title},audioStatus.tracks.map(t=>({title:t.title,text:'',chapterId:t.chapterId,url:t.url+'?v='+pub.updated})),version.language,'offline');
  // No audio: stay on the book page without a word; Listen is not offered there either.
 },[listenOnOpen,pub,version,adapted,audioStatus]);
 if(error)return <div className="empty-state"><h2>{L('This book isn’t available.')}</h2><p>{error}</p><Button onClick={()=>navigate('/library')}>{L('Back to the library')}</Button></div>;
 if(!pub||!version||!adapted)return <div className="center-state"><CircularProgress/><p>{L('Opening the book…')}</p></div>;
 const{book,data}=adapted;const base='/b/'+pub.slug;
 const shareUrl=location.origin+'/b/'+encodeURIComponent(pub.slug);
 const share=async()=>{const title=pub.titles[version.language]||pub.title;
  if(navigator.share){try{await navigator.share({title,url:shareUrl});}catch{/* closed */}return;}
  try{await navigator.clipboard.writeText(shareUrl);toast(tr(version.language,'Link copied. It shows the cover and summary when shared.'));}catch{prompt('',shareUrl);}};
 const artIndex=homeBooks(published||[],home).findIndex(b=>b.id===pub.id);
 const backdrop=bookBackdrop(pub,Math.max(0,artIndex));
 // Background: a painting or an uploaded picture can be framed here; for the automatic gallery or the cover the editor explains why not.
 const framable=mayEdit&&(pub.slide?.mode==='art'||pub.slide?.mode==='upload')&&!!pub.slide.art;
 const background=mayEdit?()=>{if(framable)setFraming(true);else{toast(L('Choose a painting or upload a picture first; the automatic gallery and the cover cannot be framed.'));navigate(editorRoute(pub.id));}}:undefined;
 const frameUi=framing&&framable?<Suspense fallback={null}><FrameDialog lang={settings.uiLanguage||'fa'} bookLang={version.language} url={pub.slide!.art!} whole={pub.slide!.fit==='whole'} title={book.title} frame={pub.slide!.frame} framePhone={pub.slide!.framePhone} onClose={()=>setFraming(false)} onSave={async(wide,phone)=>{const slide=await setFrame(pub.id,wide,phone);setPub(p=>p&&{...p,slide});onSaved?.();}}/></Suspense>:null;
 const move=(next:Partial<typeof position>)=>{const merged={...position,...next,lastRead:Date.now()};setPosition(merged);savePosition(pub.id,merged);};
 const open=(index?:number,sec?:string)=>{if(index!==undefined)move({index});else move({});navigate(base+'/read'+(sec?'/'+encodeURIComponent(sec):''));};
 async function listen(chapterId?:string|null){
  try{
   const status=audioStatus?.status==='ready'?audioStatus:await narrationStatus(pub!.id,version!.language);
   if(status.status!=='ready'||!status.tracks.length){toast(L(status.status==='running'?'The narration is still being prepared. Try again in a few minutes.':'There is no narration for this book yet.'));return;}
   player.load({id:'pub:'+pub!.id,title:book.title},status.tracks.map(t=>({title:t.title,text:'',chapterId:t.chapterId,url:t.url+'?v='+pub!.updated})),version!.language,'offline',chapterId);
  }catch(e){toast((e as Error).message);}
 }
 const switcher=pub.doc.versions.length>1&&<div className="pub-switch">
  {[...new Set(pub.doc.versions.map(v=>v.language))].length>1&&<TextField select size="small" label={L('Language')} value={version.language} onChange={e=>setChosen(versionKey(pickVersion(pub.doc,undefined,e.target.value)))}>{languages.filter(l=>pub.doc.versions.some(v=>v.language===l.code)).map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>}
  {pub.doc.versions.filter(v=>v.language===version.language).length>1&&<TextField select size="small" label={L('Version')} value={versionKey(version)} onChange={e=>setChosen(e.target.value)}>{pub.doc.versions.filter(v=>v.language===version.language).map(v=><MenuItem key={versionKey(v)} value={versionKey(v)}>{v.label}</MenuItem>)}</TextField>}
 </div>;
 const audio=audioFor(audioStatus,pub.audio,version.language,version.type);
 const quote=(t:string)=>'«'+t+'»';
 const audioUi=mayEdit&&owner?.audio?<>{audioOpen&&<Suspense fallback={null}><AudioDialog bookId={pub.id} doc={pub.doc} lang={settings.uiLanguage||'fa'} startLanguage={version.language} startScope={audioOpen.scope} unsaved={unsaved>0} onChanged={audioChanged} onClose={()=>setAudioOpen(null)} {...owner.audio}/></Suspense>}
  <Snackbar open={staleNote.length>0&&!audioOpen} autoHideDuration={14000} onClose={(_,why)=>{if(why!=='clickaway')setStaleNote([])}} anchorOrigin={{vertical:'bottom',horizontal:'center'}} sx={{bottom:{xs:96,sm:24}}}><Alert severity="info" variant="filled" onClose={()=>setStaleNote([])} action={<Button color="inherit" size="small" onClick={()=>{setAudioOpen({scope:'changed'});setStaleNote([])}}>{L('Update audio')}</Button>}>{L('Audio of')+' '+(staleNote.length<=2?staleNote.map(quote).join(' / '):quote(staleNote[0])+' '+L('and')+' '+num(settings.uiLanguage||'fa',staleNote.length-1)+' '+L('more'))+' '+L('was made from the earlier text')}</Alert></Snackbar></>:null;
 if(mode==='read'){
  const uiLang=settings.uiLanguage||'fa',langName=(code:string)=>{const n=languages.find(l=>l.code===code)?.label||code,parts=n.split(' · ');return uiLang==='fa'?parts[0]:parts[parts.length-1];};
  const ctl:EditCtl={d,lang:version.language,rtl:['fa','ar'].includes(version.language),L,save:()=>void save(),done:finish,toast,openBookEditor:()=>navigate(editorRoute(pub.id,'chapters',book.chapters[book.chapterIndex]?.id)),saved:scope=>readScope(pub.doc,vk,scope)};
  const editSlot=active?(scope:string,fixed:(i:number,caption?:ReactNode)=>ReactNode)=>{const kind=scope.split(':')[0];return <Suspense fallback={null}>{kind==='t'||kind==='gt'?<EditText scope={scope}/>:<EditList scope={scope} fixed={fixed}/>}</Suspense>;}:undefined;
  const nLangs=new Set(pub.doc.versions.map(v=>v.language)).size;
  const status=saving?L('Saving…'):saveState==='conflict'?L('Changed elsewhere'):unsaved>0?num(uiLang,unsaved)+' '+L(unsaved===1?'unsaved change':'unsaved changes'):saveState==='saved'?L('Saved · readers see it now'):L('No changes');
  const more=!saving&&saveState!=='conflict'&&unsaved>0?' · '+L('kept on this device'):'';
  const tone=saving?'busy':saveState==='conflict'||saveState==='error'?'warn':unsaved>0?'dirty':saveState==='saved'?'ok':'idle';
  const note=(nLangs>1?L('Only the {language} version changes').replace('{language}',langName(version.language))+'. ':'')+L('Page references such as (p. 12) show while editing; readers do not see them.');
  const editBar=active?<Suspense fallback={null}><EditBar L={L} label={L('Editing')+' · '+langName(version.language)+' · '+version.label} status={status} more={more} tone={tone} canUndo={d.canUndo} canRedo={d.canRedo} saving={saving} dirty={unsaved>0} note={note} onUndo={d.undo} onRedo={d.redo} onDiscard={()=>setAsk('discard')} onSave={()=>void save()} onDone={finish}/></Suspense>
   :mayEdit&&stored?<Suspense fallback={null}><RestoreBanner L={L} text={L('You have unsaved edits from')+' '+new Date(stored.at).toLocaleString(uiLang==='fa'?'fa-IR':undefined,{dateStyle:'medium',timeStyle:'short'})+' '+L('on this device.')+(stored.base&&stored.base!==pub.rev?' '+L('The book changed since; your edits will replace those parts.'):'')} onRestore={()=>restore(stored)} onDiscard={discard}/></Suspense>:null;
  const dir=ctl.rtl||uiLang==='fa'?'rtl':'ltr',dlg={paper:{dir}};
  return <EditContext.Provider value={active?ctl:null}>
   <ReaderPage canListen={id=>canListenTo(audio,id)} owner={owner&&{...owner,onAudio:mayEdit&&owner.audio?()=>setAudioOpen({}):undefined,onBackground:background,onEdit:mayEdit?ctl.openBookEditor:undefined,editing:active,onEditing:mayEdit?(active?finish:enter):undefined}} editSlot={editSlot} editBar={editBar} book={book} chapter={book.chapters[book.chapterIndex]} section={hint?'':section} settings={settings} account={null} price={null} saved={[]} data={data} summary={null} generating={false} generationError="" readOnly backdrop={backdrop}
    onPreferences={onPreferences} onGenerate={noop} onCancel={noop} onBookmark={noop} onEvidence={noop} onChoose={i=>{move({index:i});navigate(base+'/read');}} onSection={s=>navigate(base+'/read/'+encodeURIComponent(s))} onBack={()=>navigate(base)}
    onHome={()=>navigate('/')} cover={pub.cover||undefined} onListen={listen} onCreate={noop}/>
   {active&&<Suspense fallback={null}><EditChrome ctl={ctl}/></Suspense>}
   {audioUi}{frameUi}
   <Dialog open={ask==='leave'} onClose={()=>setAsk(null)} slotProps={dlg} aria-labelledby="ed-leave"><DialogTitle id="ed-leave">{L('Leave editing?')}</DialogTitle><DialogContent>{num(uiLang,unsaved)+' '+L(unsaved===1?'unsaved change':'unsaved changes')+'. '+L('Saving makes them live for readers. Otherwise they stay on this device as a draft.')}</DialogContent>
    <DialogActions><Button onClick={()=>setAsk(null)}>{L('Keep editing')}</Button><Button onClick={()=>{setAsk(null);setEditing(false);}}>{L('Leave, keep draft')}</Button><Button color="error" onClick={()=>{discard();setEditing(false);}}>{L('Discard changes')}</Button><Button variant="contained" disableElevation disabled={saving} onClick={async()=>{if(await save()){setAsk(null);setEditing(false);}else setAsk(null);}}>{L('Save')}</Button></DialogActions></Dialog>
   <Dialog open={ask==='discard'} onClose={()=>setAsk(null)} slotProps={dlg} aria-labelledby="ed-discard"><DialogTitle id="ed-discard">{L('Discard changes?')}</DialogTitle><DialogContent>{L('Your unsaved edits will be removed from this device.')}</DialogContent>
    <DialogActions><Button onClick={()=>setAsk(null)}>{L('Keep editing')}</Button><Button color="error" onClick={discard}>{L('Discard changes')}</Button></DialogActions></Dialog>
   <Dialog open={!!conflict} onClose={()=>setConflict(null)} slotProps={dlg} aria-labelledby="ed-conflict"><DialogTitle id="ed-conflict">{L('This book was changed elsewhere')}</DialogTitle>
    <DialogContent><p>{L('Someone saved it after you opened it. Nothing was overwritten.')}</p>{!!conflict?.clash.length&&<ul>{[...new Set(conflict.clash)].map(n=><li key={n}>{n} {L('was also changed elsewhere; your version will replace it.')}</li>)}</ul>}</DialogContent>
    <DialogActions><Button onClick={()=>setConflict(null)}>{L('Cancel')}</Button><Button color="error" onClick={()=>resolve(false)}>{L('Discard my edits')}</Button><Button variant="contained" disableElevation onClick={()=>resolve(true)}>{L('Load latest and keep my edits')}</Button></DialogActions></Dialog>
  </EditContext.Provider>;
 }
 const hostedTracks=(audioStatus?.tracks||[]).map(t=>({title:t.title,chapterId:t.chapterId,text:'',url:t.url+'?v='+pub.updated}));
 const resume=listeningPlace(book.id,trackSignature(hostedTracks),hostedTracks.length);
 const duration=audioStatus?.tracks.length&&audioStatus.tracks.every(t=>t.seconds!=null)?Math.ceil(audioStatus.tracks.reduce((n,t)=>n+(t.seconds||0),0)/60):null;
 return <>{switcher}{audioUi}{frameUi}<BookDetail onShare={share} categories={bookCategories(pub).map(id=>({id,label:categoryName(categoryById(id)!,version.language)}))} canListen={audio.book} ownerActions={mayEdit?[{key:'edit',label:L('Edit book'),icon:<EditOutlined/>,onClick:()=>navigate(editorRoute(pub.id))},...(owner!.audio?[{key:'audio',label:L(audio.book?'Audio':'Add audio'),icon:<GraphicEqRounded/>,onClick:()=>setAudioOpen({})}]:[]),{key:'background',label:L('Background'),icon:<WallpaperRounded/>,onClick:background!},{key:'visitor',label:L('View as visitor'),icon:<VisibilityOutlined/>,onClick:owner!.onToggle}]:undefined} related={related} receptionHref={mayEdit?editorRoute(pub.id,'reception'):undefined} searchTitle={pub.doc.title[pub.doc.originalLanguage]||pub.title} listenLabel={resume&&resume.seconds>0?tr(version.language,'Resume listening'):undefined} audioNote={audioStatus?.status==='ready'?(duration?tr(version.language,'Listening time')+': '+tr(version.language,'Approximate')+' '+num(version.language,duration)+' '+tr(version.language,'min'):tr(version.language,'Audio duration is shown during playback.')):undefined} book={book} cover={pub.cover||''} data={data} saved={[]} readOnly backdrop={backdrop} pubInfo={pub.doc.info?{title:'',authors:[],year:'',pages:null,categories:[],description:'',ratings:[],readers:null,wikipedia:null,covers:[],links:[],...pub.doc.info}:null} backLabel="Library" review={version.language==='fa'?persianReception(pub.doc.review||found,pub.id):pub.doc.review||found}
  onCover={async()=>{}} onCreate={noop} onRead={open} onListen={listen} onExport={noop} onEditContents={noop} onRebuild={async()=>{}} onAccount={noop} onBack={()=>navigate('/library')} /></>;
}
