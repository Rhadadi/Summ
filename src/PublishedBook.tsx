import{useEffect,useMemo,useRef,useState}from'react';
import{Alert,Button,CircularProgress,MenuItem,TextField}from'@mui/material';
import type{HomeConfig,PubBook,PubDoc,RelatedBook,Review,Settings}from'./types';
import{bookBackdrop,homeBooks}from'./bookBackdrop';
import{libraryBook,libraryReception,libraryRelated,narrationStatus}from'./api';
import{adaptPublished,pickVersion,readPosition,savePosition,versionKey}from'./published';
import{languages}from'./core';
import BookDetail from'./BookDetail';import ReaderPage from'./ReaderPage';
import{tr,num}from'./i18n';
import{listeningPlace,trackSignature}from'./listening';
import type{PlayerApi}from'./Player';

interface Props{listenOnOpen?:boolean;slug:string;mode:'detail'|'read';section:string;settings:Settings;player:PlayerApi;navigate:(path:string)=>void;toast:(message:string)=>void;onPreferences:(patch:Partial<Settings>)=>void;published:PubBook[]|null;home:HomeConfig|null}
const noop=()=>{};
export default function PublishedBook({listenOnOpen=false,slug,mode,section,settings,player,navigate,toast,onPreferences,published,home}:Props){
 const L=(t:string)=>tr(settings.uiLanguage||'fa',t);
 const[pub,setPub]=useState<(PubBook&{doc:PubDoc})|null>(null),[error,setError]=useState(''),[chosen,setChosen]=useState(''),[position,setPosition]=useState({index:0,completed:[] as string[],lastRead:0});
 useEffect(()=>{let live=true;setPub(null);setError('');libraryBook(slug).then(b=>{if(live){setPub(b);setPosition(readPosition(b.id));}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[slug]);
 const version=pub?pickVersion(pub.doc,chosen,settings.language):undefined;
 // Until the owner approves a researched reception, the page shows the reviews Wikipedia and the newspapers' own APIs list.
 const[found,setFound]=useState<Review|null>(null),[related,setRelated]=useState<RelatedBook[]>([]);
 useEffect(()=>{setRelated([]);if(!pub)return;let live=true;libraryRelated(pub.id).then(r=>{if(live)setRelated(r);}).catch(()=>{});return()=>{live=false;};},[pub?.id]);
 useEffect(()=>{setFound(null);if(!pub||pub.doc.review)return;let live=true;libraryReception(pub.id,version?.language||'en').then(r=>{if(live&&r.critics.length)setFound({verdict:'',pros:[],cons:[],quotes:[],sources:[],rating:null,model:'',createdAt:0,critics:r.critics});}).catch(()=>{});return()=>{live=false;};},[pub,version?.language]);
 const[audioStatus,setAudioStatus]=useState<Awaited<ReturnType<typeof narrationStatus>>|null>(null);
 useEffect(()=>{setAudioStatus(null);if(!pub||!version)return;let live=true;narrationStatus(pub.id,version.language).then(s=>{if(live)setAudioStatus(s);}).catch(()=>{});return()=>{live=false;};},[pub?.id,version?.language]);
 const adapted=useMemo(()=>pub&&version?adaptPublished(pub,pub.doc,version,position):null,[pub,version,position]);
 const autoStarted=useRef('');
 useEffect(()=>{
  if(!listenOnOpen){autoStarted.current='';return;}
  if(!pub||!version||!adapted||!audioStatus||autoStarted.current===pub.id)return;
  autoStarted.current=pub.id;
  if(audioStatus.status==='ready'&&audioStatus.tracks.length)void player.load({id:'pub:'+pub.id,title:adapted.book.title},audioStatus.tracks.map(t=>({title:t.title,text:'',chapterId:t.chapterId,url:t.url+'?v='+pub.updated})),version.language,'offline');
  else toast(tr(version.language,'There is no narration for this book yet.'));
 },[listenOnOpen,pub,version,adapted,audioStatus]);
 if(error)return <div className="empty-state"><h2>{L('This book isn’t available.')}</h2><p>{error}</p><Button onClick={()=>navigate('/library')}>{L('Back to the library')}</Button></div>;
 if(!pub||!version||!adapted)return <div className="center-state"><CircularProgress/><p>{L('Opening the book…')}</p></div>;
 const{book,data}=adapted;const base='/b/'+pub.slug;
 const artIndex=homeBooks(published||[],home).findIndex(b=>b.id===pub.id);
 const backdrop=bookBackdrop(pub,Math.max(0,artIndex));
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
 if(mode==='read')return <ReaderPage book={book} chapter={book.chapters[book.chapterIndex]} section={section} settings={settings} account={null} price={null} saved={[]} data={data} summary={null} generating={false} generationError="" readOnly backdrop={backdrop}
  onPreferences={onPreferences} onGenerate={noop} onCancel={noop} onBookmark={noop} onEvidence={noop} onChoose={i=>{move({index:i});navigate(base+'/read');}} onSection={s=>navigate(base+'/read/'+encodeURIComponent(s))} onBack={()=>navigate(base)}
  onHome={()=>navigate('/')} cover={pub.cover||undefined} onListen={listen} onCreate={noop}/>;
 const hostedTracks=(audioStatus?.tracks||[]).map(t=>({title:t.title,chapterId:t.chapterId,text:'',url:t.url+'?v='+pub.updated}));
 const resume=listeningPlace(book.id,trackSignature(hostedTracks),hostedTracks.length);
 const duration=audioStatus?.tracks.length&&audioStatus.tracks.every(t=>t.seconds!=null)?Math.ceil(audioStatus.tracks.reduce((n,t)=>n+(t.seconds||0),0)/60):null;
 return <>{switcher}<BookDetail related={related} searchTitle={pub.doc.title[pub.doc.originalLanguage]||pub.title} listenLabel={resume&&resume.seconds>0?tr(version.language,'Resume listening'):undefined} audioNote={audioStatus?.status==='ready'?(duration?tr(version.language,'Listening time')+': '+tr(version.language,'Approximate')+' '+num(version.language,duration)+' '+tr(version.language,'min'):tr(version.language,'Audio duration is shown during playback.')):undefined} book={book} cover={pub.cover||''} data={data} saved={[]} readOnly backdrop={backdrop} pubInfo={pub.doc.info?{title:'',authors:[],year:'',pages:null,categories:[],description:'',ratings:[],readers:null,wikipedia:null,covers:[],links:[],...pub.doc.info}:null} backLabel="Library" review={pub.doc.review||found}
  onCover={async()=>{}} onCreate={noop} onRead={open} onListen={listen} onExport={noop} onEditContents={noop} onRebuild={async()=>{}} onAccount={noop} onBack={()=>navigate('/library')} /></>;
}
