import{useEffect,useRef,useState}from'react';
import{IconButton,LinearProgress,Tooltip}from'@mui/material';
import{BookmarkBorderRounded,CloseRounded,Forward10Rounded,PauseRounded,PlayArrowRounded,Replay10Rounded,SkipNextRounded,SkipPreviousRounded}from'@mui/icons-material';
import type{Book}from'./types';
type Source={id:string;title:string};
import{ApiError,narrate}from'./api';
import{store}from'./storage';
import{listeningPlace,saveListening,partTitle,trackSignature}from'./listening';
import{tr,num}from'./i18n';

// A track is either text to narrate (editors) or an audio file the owner already generated (everyone else).
export interface Track{title:string;text:string;chapterId?:string|null;url?:string}
type Engine='offline'|'elevenlabs';
interface State{book:Source;tracks:Track[];index:number;urls:(string|undefined)[];playing:boolean;engine:Engine;language:string;error:string;signature:string}
const RATES=[1,1.25,1.5,1.75,2,.75];
function hash(text:string){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
// Narration requests stay under the server's 4,500-character limit and break at paragraph boundaries.
export function chunk(items:Track[]):Track[]{
 const out:Track[]=[];
 for(const item of items){let current='';for(const p of item.text.split('\n\n')){if(current&&current.length+p.length>4000){out.push({...item,text:current});current='';}current+=(current?'\n\n':'')+p.slice(0,4400);}if(current)out.push({...item,text:current});}
 return out;
}

// One player for the whole app, so narration keeps going while you move between pages.
export function usePlayer(onAccount:()=>void){
 const[state,setState]=useState<State|null>(null),[time,setTime]=useState({at:0,length:0}),[rate,setRate]=useState(1);
 const audio=useRef<HTMLAudioElement|null>(null),run=useRef<AbortController|null>(null),current=useRef<State|null>(null);
 current.current=state;
 const rateRef=useRef(rate),pendingSeek=useRef(0);rateRef.current=rate;
 function remember(){const s=current.current,a=audio.current;if(s&&a?.src&&!pendingSeek.current)saveListening(s.book.id,{signature:s.signature,index:s.index,seconds:Math.max(0,a.currentTime||0),rate:rateRef.current});}
 if(!audio.current&&typeof Audio!=='undefined')audio.current=new Audio();
 useEffect(()=>{
  const a=audio.current;if(!a)return;
  const tick=()=>{setTime({at:a.currentTime,length:a.duration||0});remember();};
  const metadata=()=>{if(pendingSeek.current){a.currentTime=Math.min(pendingSeek.current,Math.max(0,(a.duration||0)-.1));pendingSeek.current=0;}a.playbackRate=rateRef.current;tick();};
  const ended=()=>{const s=current.current;if(s&&s.index+1<s.tracks.length)go(s.index+1,true);else setState(x=>x&&{...x,playing:false});};
  a.addEventListener('timeupdate',tick);a.addEventListener('loadedmetadata',metadata);window.addEventListener('pagehide',remember);a.addEventListener('ended',ended);
  return()=>{a.removeEventListener('timeupdate',tick);a.removeEventListener('loadedmetadata',metadata);window.removeEventListener('pagehide',remember);a.removeEventListener('ended',ended);};
 },[]);
 useEffect(()=>{if(audio.current)audio.current.playbackRate=rate;},[rate,state?.index]);
 function go(index:number,play:boolean,seek=0){
  const s=current.current;const a=audio.current;if(!s||!a||index<0||index>=s.tracks.length)return;
  remember();a.pause();pendingSeek.current=seek;const next={...s,index,playing:play&&!!s.urls[index]};current.current=next;setState(next);setTime({at:seek,length:0});
  if(s.urls[index]){a.src=s.urls[index]!;a.playbackRate=rateRef.current;if(play)a.play().catch(()=>setState(x=>x&&{...x,playing:false}));}else{a.pause();a.removeAttribute('src');}
 }
 async function load(book:Source,items:Track[],language:string,engine:Engine,startChapter?:string|null,restart=false){
  remember();audio.current?.pause();audio.current?.removeAttribute('src');run.current?.abort();const controller=new AbortController();run.current=controller;
  const hosted=items.length>0&&items.every(t=>t.url);
  const tracks=hosted?items:chunk(items);if(!tracks.length)return;
  const signature=trackSignature(tracks);
  const saved=restart?null:listeningPlace(book.id,signature,tracks.length);
  const resume=saved&&(!startChapter||tracks[saved.index].chapterId===startChapter)?saved:null;
  const start=resume?.index??Math.max(0,startChapter?tracks.findIndex(t=>t.chapterId===startChapter):0);
  const speed=resume?.rate??rateRef.current;rateRef.current=speed;setRate(speed);pendingSeek.current=resume?.seconds||0;
  const urls:(string|undefined)[]=tracks.map(t=>hosted?t.url:undefined);
  const initial={book,tracks,index:start,urls,playing:false,engine,language,error:'',signature};current.current=initial;setState(initial);setTime({at:pendingSeek.current,length:0});
  if(hosted){go(start,true,pendingSeek.current);return;}
  // Generate from the chosen start onward, then the earlier parts, so playback begins as soon as possible.
  const order=[...tracks.keys()].filter(i=>i>=start).concat([...tracks.keys()].filter(i=>i<start));
  try{
   for(const i of order){
    if(controller.signal.aborted)return;
    const key=book.id+':audio:'+engine+':'+language+':'+hash(tracks[i].text);
    let blob=await store.audio(key);
    if(!blob){blob=await narrate(tracks[i].text,language,engine,controller.signal);await store.saveAudio(key,blob);}
    if(controller.signal.aborted)return;
    urls[i]=URL.createObjectURL(blob);
    const s:State|null=current.current;if(!s)return;
    const next:State={...s,urls:[...urls]};setState(next);current.current=next;
    if(i===s.index&&!s.playing&&audio.current&&!audio.current.src){go(i,true,pendingSeek.current);}
   }
  }catch(e){if(!controller.signal.aborted){if(e instanceof ApiError&&(e.status===401||e.status===412))onAccount();setState(x=>x&&{...x,error:(e as Error).message});}}
 }
 function toggle(){const s=current.current,a=audio.current;if(!s||!a)return;if(s.playing){a.pause();remember();setState({...s,playing:false});}else if(s.urls[s.index]){if(!a.src)a.src=s.urls[s.index]!;a.play().catch(()=>{});setState({...s,playing:true});}}
 function skip(seconds:number){const a=audio.current;if(a&&a.src)a.currentTime=Math.max(0,Math.min((a.duration||0)-.1,a.currentTime+seconds));}
 function close(){remember();run.current?.abort();audio.current?.pause();audio.current?.removeAttribute('src');setState(null);}
 const cycleRate=()=>{const next=RATES[(RATES.indexOf(rateRef.current)+1)%RATES.length];rateRef.current=next;setRate(next);remember();};
 return{state,time,rate,load,toggle,skip,go,close,cycleRate,restart:()=>go(0,true)};
}
export type PlayerApi=ReturnType<typeof usePlayer>;

const clock=(s:number)=>{if(!isFinite(s))return'0:00';const m=Math.floor(s/60),x=Math.floor(s%60);return m+':'+String(x).padStart(2,'0');};
export function PlayerBar({player,cover,onOpen,onSave}:{player:PlayerApi;cover?:string;onOpen:(chapterId?:string|null)=>void;onSave?:()=>void}){
 const{state,time,rate}=player;if(!state)return null;
 const L=(t:string)=>tr(state.language,t);
 const track=state.tracks[state.index];const total=state.tracks.reduce((n,t)=>n+t.text.length,0);
 const ready=state.urls.filter(Boolean).length;
 return <footer className="player" lang={state.language} aria-label={L('Narration player')}>
  <div className="player-line">
   <span className="player-time">{clock(time.at)}</span>
   <div className="player-segments">{state.tracks.map((t,i)=><button key={i} aria-label={L('Play')+': '+partTitle(state.tracks,i,state.language)} style={{flex:total?t.text.length/total:1}} className={'seg'+(state.urls[i]?'':' pending')} onClick={()=>player.go(i,true)}><span style={{width:(i<state.index?100:i===state.index&&time.length?time.at/time.length*100:0)+'%'}}/></button>)}</div>
   <span className="player-time end">-{clock(Math.max(0,time.length-time.at))}</span>
  </div>
  <div className="player-main">
   <button className="player-book" onClick={()=>onOpen(track?.chapterId)}>
    {cover?<img src={cover} alt=""/>:<span className="player-cover"/>}
    <span><strong dir="auto">{state.book.title}</strong><small dir="auto">{partTitle(state.tracks,state.index,state.language)}{ready<state.tracks.length?' · preparing audio '+ready+'/'+state.tracks.length:''}</small></span>
   </button>
   {onSave&&<Tooltip title={L('Save')}><IconButton aria-label={L('Save')} onClick={onSave}><BookmarkBorderRounded/></IconButton></Tooltip>}
   <div className="player-controls">
    <IconButton aria-label={L('Previous part')} disabled={state.index===0} onClick={()=>player.go(state.index-1,true)}><SkipPreviousRounded/></IconButton>
    <IconButton aria-label={L('Back 10 seconds')} onClick={()=>player.skip(-10)}><Replay10Rounded/></IconButton>
    <button className="player-play" aria-label={L(state.playing?'Pause':'Play')} disabled={!state.urls[state.index]} onClick={player.toggle}>{!state.urls[state.index]?<LinearProgress className="player-wait"/>:state.playing?<PauseRounded/>:<PlayArrowRounded/>}</button>
    <IconButton aria-label={L('Forward 10 seconds')} onClick={()=>player.skip(10)}><Forward10Rounded/></IconButton>
    <IconButton aria-label={L('Next part')} disabled={state.index>=state.tracks.length-1} onClick={()=>player.go(state.index+1,true)}><SkipNextRounded/></IconButton>
   </div>
   <div className="player-end">
    <button className="player-rate" aria-label={L('Playback speed')+' '+rate+'×'} onClick={player.cycleRate}>{rate}×</button>
    <small>{state.engine==='offline'?L('Offline voice'):'ElevenLabs'}</small>
    <IconButton aria-label={L('Close player')} onClick={player.close}><CloseRounded/></IconButton>
   </div>
  </div>
  <details className="player-playlist"><summary>{L('Playlist')} · {num(state.language,state.index+1)} / {num(state.language,state.tracks.length)}</summary><div><button onClick={player.restart}>{L('Restart listening')}</button>{state.tracks.map((t,i)=><button key={i} aria-current={i===state.index?'true':undefined} onClick={()=>player.go(i,true)}>{partTitle(state.tracks,i,state.language)}</button>)}</div></details>
  {state.error&&<p className="player-error" role="alert">{state.error}</p>}
 </footer>;
}
