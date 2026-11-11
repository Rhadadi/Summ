import{useState}from'react';
import{Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,TextField}from'@mui/material';
import{AutoAwesomeRounded,CheckRounded,CloseRounded,OpenInNewRounded,SearchRounded}from'@mui/icons-material';
import type{ArtResult}from'./types';
import{ApiError,artIdeas,artSearch}from'./api';

interface Props{title:string;author:string;about:string;themes:string[];tags:string[];language:string;initial:ArtResult|null;onClose:()=>void;onPick:(art:ArtResult)=>void;onAccount:()=>void}
// A curator's shortlist from AI, plus free search, shown large enough to judge each painting as a backdrop.
export default function ArtPicker({title,author,about,themes,tags,language,initial,onClose,onPick,onAccount}:Props){
 const[query,setQuery]=useState(tags.slice(0,2).join(' ')),[hits,setHits]=useState<ArtResult[]|null>(null),[ideas,setIdeas]=useState<{artist:string;title:string;why:string;results:ArtResult[]}[]|null>(null),[moods,setMoods]=useState<string[]>([]);
 const[pick,setPick]=useState<ArtResult|null>(initial),[busy,setBusy]=useState<''|'search'|'ai'>(''),[error,setError]=useState('');
 async function find(q=query){if(q.trim().length<2)return;setBusy('search');setError('');setQuery(q);try{setHits(await artSearch(q));}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function curate(){setBusy('ai');setError('');try{const r=await artIdeas({title,author,about,themes,language});setIdeas(r.ideas);setMoods(r.moods);if(!r.ideas.length)setError('No public-domain images were found for the suggestions. Try again or search below.');}catch(e){if(e instanceof ApiError&&(e.status===401||e.status===412))onAccount();setError((e as Error).message);}finally{setBusy('');}}
 const tile=(h:ArtResult)=><button type="button" key={h.file} className={'ap-tile'+(pick?.file===h.file?' on':'')} aria-pressed={pick?.file===h.file} onClick={()=>setPick(h)}>
  <img src={h.thumb} alt="" loading="lazy"/>{pick?.file===h.file&&<span className="ap-check"><CheckRounded/></span>}
  <span className="ap-cap"><strong>{h.title.slice(0,80)}</strong><small>{[h.artist,h.year].filter(Boolean).join(', ').slice(0,80)}</small></span></button>;
 const chips=[...new Set([...moods,...tags])].slice(0,10);
 return <Dialog open onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="art-title" scroll="paper" slotProps={{paper:{className:'ap-dialog'}}}>
  <DialogTitle id="art-title" className="dialog-heading"><span>A painting for <em dir="auto">{title.split(':')[0]}</em></span><IconButton aria-label="Close" onClick={onClose}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent>
   <div className="ap-bar">
    <Button variant="contained" startIcon={busy==='ai'?<CircularProgress size={16} color="inherit"/>:<AutoAwesomeRounded/>} disabled={!!busy} onClick={curate}>{busy==='ai'?'Asking the curator…':ideas?'Ask for more ideas':'Ask AI for paintings that fit this book'}</Button>
    <form className="ap-search" onSubmit={e=>{e.preventDefault();find();}}><TextField size="small" fullWidth label="Or search Wikimedia Commons" value={query} onChange={e=>setQuery(e.target.value)} placeholder="melancholy, garden at dusk, Vermeer…"/><Button type="submit" variant="outlined" startIcon={<SearchRounded/>} disabled={!!busy||query.trim().length<2}>{busy==='search'?'Searching…':'Search'}</Button></form>
   </div>
   {chips.length>0&&<div className="art-ideas">{chips.map(w=><button type="button" key={w} onClick={()=>find(w)}>{w}</button>)}</div>}
   {error&&<Alert severity="warning" sx={{my:1}}>{error}</Alert>}
   {ideas&&ideas.map(i=><section className="ap-idea" key={i.artist+i.title}><h4><strong>{i.title}</strong> · {i.artist}</h4>{i.why&&<p dir="auto">{i.why}</p>}<div className="ap-grid">{i.results.map(tile)}</div></section>)}
   {hits&&<section className="ap-idea"><h4>Results for “{query}”</h4>{hits.length?<div className="ap-grid">{hits.map(tile)}</div>:<p>Nothing public-domain matched. Try other words.</p>}</section>}
   {!ideas&&!hits&&<p className="settings-help">The AI reads what the book is about and proposes specific paintings; each one is looked up on Wikimedia Commons, so only real public-domain images appear.</p>}
  </DialogContent>
  <DialogActions sx={{px:3,pb:2}}>
   {pick&&<a className="ap-credit" href={pick.page} target="_blank" rel="noopener noreferrer">{pick.title.slice(0,60)} · {pick.artist.slice(0,40)} <OpenInNewRounded fontSize="inherit"/></a>}
   <span style={{flex:1}}/><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!pick} onClick={()=>pick&&onPick(pick)}>Use this painting</Button>
  </DialogActions>
 </Dialog>;
}
