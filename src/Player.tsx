import{useEffect,useRef,useState}from'react';
import{IconButton,LinearProgress,Tooltip}from'@mui/material';
import{BookmarkBorderRounded,CloseRounded,Forward10Rounded,PauseRounded,PlayArrowRounded,Replay10Rounded,SkipNextRounded,SkipPreviousRounded}from'@mui/icons-material';
import type{Book}from'./types';
import{ApiError,narrate}from'./api';
import{store}from'./storage';

export interface Track{title:string;text:string;chapterId?:string}
type Engine='offline'|'elevenlabs';
interface State{book:Book;tracks:Track[];index:number;urls:(string|undefined)[];playing:boolean;engine:Engine;language:string;error:string}
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
 if(!audio.current&&typeof Audio!=='undefined')audio.current=new Audio();
 useEffect(()=>{
  const a=audio.current;if(!a)return;
  const tick=()=>setTime({at:a.currentTime,length:a.duration||0});
  const ended=()=>{const s=current.current;if(s&&s.index+1<s.tracks.length)go(s.index+1,true);else setState(x=>x&&{...x,playing:false});};
  a.addEventListener('timeupdate',tick);a.addEventListener('loadedmetadata',tick);a.addEventListener('ended',ended);
  return()=>{a.removeEventListener('timeupdate',tick);a.removeEventListener('loadedmetadata',tick);a.removeEventListener('ended',ended);};
 },[]);
 useEffect(()=>{if(audio.current)audio.current.playbackRate=rate;},[rate,state?.index]);
 function go(index:number,play:boolean){
  const s=current.current;const a=audio.current;if(!s||!a||index<0||index>=s.tracks.length)return;
  setState({...s,index,playing:play&&!!s.urls[index]});
  if(s.urls[index]){a.src=s.urls[index]!;a.playbackRate=rate;if(play)a.play().catch(()=>{});}else{a.pause();a.removeAttribute('src');}
 }
 async function load(book:Book,items:Track[],language:string,engine:Engine,startChapter?:string){
  run.current?.abort();const controller=new AbortController();run.current=controller;
  const tracks=chunk(items);if(!tracks.length)return;
  const start=Math.max(0,startChapter?tracks.findIndex(t=>t.chapterId===startChapter):0);
  const urls:(string|undefined)[]=tracks.map(()=>undefined);
  setState({book,tracks,index:start,urls,playing:false,engine,language,error:''});setTime({at:0,length:0});
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
    const s=current.current;if(!s)return;
    const next={...s,urls:[...urls]};setState(next);current.current=next;
    if(i===s.index&&!s.playing&&audio.current&&!audio.current.src){go(i,true);}
   }
  }catch(e){if(!controller.signal.aborted){if(e instanceof ApiError&&(e.status===401||e.status===412))onAccount();setState(x=>x&&{...x,error:(e as Error).message});}}
 }
 function toggle(){const s=current.current,a=audio.current;if(!s||!a)return;if(s.playing){a.pause();setState({...s,playing:false});}else if(s.urls[s.index]){if(!a.src)a.src=s.urls[s.index]!;a.play().catch(()=>{});setState({...s,playing:true});}}
 function skip(seconds:number){const a=audio.current;if(a&&a.src)a.currentTime=Math.max(0,Math.min((a.duration||0)-.1,a.currentTime+seconds));}
 function close(){run.current?.abort();audio.current?.pause();audio.current?.removeAttribute('src');setState(null);}
 const cycleRate=()=>setRate(r=>RATES[(RATES.indexOf(r)+1)%RATES.length]);
 return{state,time,rate,load,toggle,skip,go,close,cycleRate};
}
export type PlayerApi=ReturnType<typeof usePlayer>;

const clock=(s:number)=>{if(!isFinite(s))return'0:00';const m=Math.floor(s/60),x=Math.floor(s%60);return m+':'+String(x).padStart(2,'0');};
export function PlayerBar({player,cover,onOpen,onSave}:{player:PlayerApi;cover?:string;onOpen:(chapterId?:string)=>void;onSave?:()=>void}){
 const{state,time,rate}=player;if(!state)return null;
 const track=state.tracks[state.index];const total=state.tracks.reduce((n,t)=>n+t.text.length,0);
 const ready=state.urls.filter(Boolean).length;
 return <footer className="player" aria-label="Narration player">
  <div className="player-line">
   <span className="player-time">{clock(time.at)}</span>
   <div className="player-segments">{state.tracks.map((t,i)=><button key={i} aria-label={'Play part '+(i+1)+': '+t.title} style={{flex:t.text.length/total}} className={'seg'+(state.urls[i]?'':' pending')} onClick={()=>player.go(i,true)}><span style={{width:(i<state.index?100:i===state.index&&time.length?time.at/time.length*100:0)+'%'}}/></button>)}</div>
   <span className="player-time end">-{clock(Math.max(0,time.length-time.at))}</span>
  </div>
  <div className="player-main">
   <button className="player-book" onClick={()=>onOpen(track?.chapterId)}>
    {cover?<img src={cover} alt=""/>:<span className="player-cover"/>}
    <span><strong dir="auto">{state.book.title}</strong><small dir="auto">{track?.title}{ready<state.tracks.length?' · preparing audio '+ready+'/'+state.tracks.length:''}</small></span>
   </button>
   {onSave&&<Tooltip title="Save"><IconButton aria-label="Save" onClick={onSave}><BookmarkBorderRounded/></IconButton></Tooltip>}
   <div className="player-controls">
    <IconButton aria-label="Previous part" disabled={state.index===0} onClick={()=>player.go(state.index-1,true)}><SkipPreviousRounded/></IconButton>
    <IconButton aria-label="Back 10 seconds" onClick={()=>player.skip(-10)}><Replay10Rounded/></IconButton>
    <button className="player-play" aria-label={state.playing?'Pause':'Play'} disabled={!state.urls[state.index]} onClick={player.toggle}>{!state.urls[state.index]?<LinearProgress className="player-wait"/>:state.playing?<PauseRounded/>:<PlayArrowRounded/>}</button>
    <IconButton aria-label="Forward 10 seconds" onClick={()=>player.skip(10)}><Forward10Rounded/></IconButton>
    <IconButton aria-label="Next part" disabled={state.index>=state.tracks.length-1} onClick={()=>player.go(state.index+1,true)}><SkipNextRounded/></IconButton>
   </div>
   <div className="player-end">
    <button className="player-rate" aria-label={'Playback speed '+rate+'×'} onClick={player.cycleRate}>{rate}×</button>
    <small>{state.engine==='offline'?'Offline voice':'ElevenLabs'}</small>
    <IconButton aria-label="Close player" onClick={player.close}><CloseRounded/></IconButton>
   </div>
  </div>
  {state.error&&<p className="player-error" role="alert">{state.error}</p>}
 </footer>;
}
