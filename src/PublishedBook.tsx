import{useEffect,useMemo,useState}from'react';
import{Alert,Button,CircularProgress,MenuItem,TextField}from'@mui/material';
import type{PubBook,PubDoc,Settings}from'./types';
import{libraryBook,narrationStatus}from'./api';
import{adaptPublished,pickVersion,readPosition,savePosition,versionKey}from'./published';
import{languages}from'./core';
import BookDetail from'./BookDetail';import ReaderPage from'./ReaderPage';
import type{PlayerApi}from'./Player';

interface Props{slug:string;mode:'detail'|'read';section:string;settings:Settings;player:PlayerApi;navigate:(path:string)=>void;toast:(message:string)=>void;onPreferences:(patch:Partial<Settings>)=>void}
const noop=()=>{};
export default function PublishedBook({slug,mode,section,settings,player,navigate,toast,onPreferences}:Props){
 const[pub,setPub]=useState<(PubBook&{doc:PubDoc})|null>(null),[error,setError]=useState(''),[chosen,setChosen]=useState(''),[position,setPosition]=useState({index:0,completed:[] as string[],lastRead:0});
 useEffect(()=>{let live=true;setPub(null);setError('');libraryBook(slug).then(b=>{if(live){setPub(b);setPosition(readPosition(b.id));}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[slug]);
 const version=pub?pickVersion(pub.doc,chosen,settings.language):undefined;
 const adapted=useMemo(()=>pub&&version?adaptPublished(pub,pub.doc,version,position):null,[pub,version,position]);
 if(error)return <div className="empty-state"><h2>This book isn’t available.</h2><p>{error}</p><Button onClick={()=>navigate('/library')}>Back to the library</Button></div>;
 if(!pub||!version||!adapted)return <div className="center-state"><CircularProgress/><p>Opening the book…</p></div>;
 const{book,data}=adapted;const base='/b/'+pub.slug;
 const move=(next:Partial<typeof position>)=>{const merged={...position,...next,lastRead:Date.now()};setPosition(merged);savePosition(pub.id,merged);};
 const open=(index?:number,sec?:string)=>{if(index!==undefined)move({index});else move({});navigate(base+'/read'+(sec?'/'+encodeURIComponent(sec):''));};
 async function listen(chapterId?:string|null){
  try{
   const status=await narrationStatus(pub!.id,version!.language);
   if(status.status!=='ready'||!status.tracks.length){toast(status.status==='running'?'The narration is still being prepared. Try again in a few minutes.':'There is no narration for this book yet.');return;}
   player.load({id:'pub:'+pub!.id,title:book.title},status.tracks.map(t=>({title:t.title,text:'',chapterId:t.chapterId,url:t.url})),version!.language,'offline',chapterId);
  }catch(e){toast((e as Error).message);}
 }
 const switcher=pub.doc.versions.length>1&&<div className="pub-switch">
  {[...new Set(pub.doc.versions.map(v=>v.language))].length>1&&<TextField select size="small" label="Language" value={version.language} onChange={e=>setChosen(versionKey(pickVersion(pub.doc,undefined,e.target.value)))}>{languages.filter(l=>pub.doc.versions.some(v=>v.language===l.code)).map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>}
  {pub.doc.versions.filter(v=>v.language===version.language).length>1&&<TextField select size="small" label="Version" value={versionKey(version)} onChange={e=>setChosen(e.target.value)}>{pub.doc.versions.filter(v=>v.language===version.language).map(v=><MenuItem key={versionKey(v)} value={versionKey(v)}>{v.label}</MenuItem>)}</TextField>}
 </div>;
 if(mode==='read')return <ReaderPage book={book} chapter={book.chapters[book.chapterIndex]} section={section} settings={settings} account={null} price={null} saved={[]} data={data} summary={null} generating={false} generationError="" readOnly
  onPreferences={onPreferences} onGenerate={noop} onCancel={noop} onBookmark={noop} onEvidence={noop} onChoose={i=>{move({index:i});navigate(base+'/read');}} onSection={s=>navigate(base+'/read/'+encodeURIComponent(s))} onBack={()=>navigate(base)}
  onFinished={()=>{const id=book.chapters[book.chapterIndex].id;move({completed:position.completed.includes(id)?position.completed.filter(x=>x!==id):[...position.completed,id]});}} onListen={listen} onCreate={noop}/>;
 return <>{switcher}<BookDetail book={book} cover={pub.cover||''} data={data} saved={[]} readOnly pubInfo={pub.doc.info?{title:'',authors:[],year:'',pages:null,categories:[],description:'',ratings:[],readers:null,wikipedia:null,covers:[],links:[],...pub.doc.info}:null} backLabel="Library"
  onCover={async()=>{}} onCreate={noop} onRead={open} onListen={listen} onExport={noop} onEditContents={noop} onRebuild={async()=>{}} onAccount={noop} onBack={()=>navigate('/library')} /></>;
}
