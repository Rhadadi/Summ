import{useState}from'react';
import{Alert,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,Switch,TextField}from'@mui/material';
import{ArrowDownwardRounded,ArrowUpwardRounded,CloseRounded}from'@mui/icons-material';
import type{HomeConfig,PubBook}from'./types';
import{saveHomeConfig}from'./api';
import{publicTitle}from'./discovery';

interface Props{config:HomeConfig|null;books:PubBook[];lang:string;onClose:()=>void;onSaved:(config:HomeConfig)=>void}
// What the home page shows: which books slide, in what order, for how long, and what else sits under the slideshow.
export default function HomeEditor({config,books,lang,onClose,onSaved}:Props){
 const base:HomeConfig=config||{seconds:3,slides:[],shelf:true,stars:true,autoplay:true,title:'',text:''};
 // Every published book is listed: the saved order first, the rest after.
 const initial=[...books].sort((a,b)=>{const ia=base.slides.findIndex(x=>x.id===a.id),ib=base.slides.findIndex(x=>x.id===b.id);return (ia<0?1e6:ia)-(ib<0?1e6:ib);}).map(b=>({id:b.id,hidden:base.slides.find(x=>x.id===b.id)?.hidden||false,seconds:base.slides.find(x=>x.id===b.id)?.seconds??null}));
 const[rows,setRows]=useState(initial),[seconds,setSeconds]=useState(base.seconds),[shelf,setShelf]=useState(base.shelf),[stars,setStars]=useState(base.stars),[autoplay,setAutoplay]=useState(base.autoplay);
 const[busy,setBusy]=useState(false),[error,setError]=useState('');
 const book=(id:string)=>books.find(b=>b.id===id)!;
 const move=(i:number,d:number)=>setRows(r=>{const n=[...r],j=i+d;if(j<0||j>=n.length)return r;[n[i],n[j]]=[n[j],n[i]];return n;});
 const patch=(i:number,p:Partial<(typeof rows)[number]>)=>setRows(r=>r.map((x,k)=>k===i?{...x,...p}:x));
 async function save(){
  setBusy(true);setError('');
  try{onSaved(await saveHomeConfig({seconds,slides:rows,shelf,stars,autoplay,title:base.title,text:base.text}));}
  catch(e){setError((e as Error).message);setBusy(false);}
 }
 return <Dialog open onClose={()=>{if(!busy)onClose();}} fullWidth maxWidth="sm" aria-labelledby="home-title" scroll="paper">
  <DialogTitle id="home-title" className="dialog-heading"><span>Edit the home page</span><IconButton aria-label="Close" disabled={busy} onClick={onClose}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent className="wizard">
   <p className="dialog-lead">Choose which books slide on the home page, their order, and how long each stays. A book's picture is chosen in its Publish dialog.</p>
   <div className="settings-grid">
    <TextField size="small" type="number" label="Seconds per slide" value={seconds} onChange={e=>setSeconds(Math.max(2,Math.min(60,Number(e.target.value)||3)))} slotProps={{htmlInput:{min:2,max:60}}}/>
    <FormControlLabel control={<Switch checked={autoplay} onChange={e=>setAutoplay(e.target.checked)}/>} label="Slide automatically"/>
   </div>
   <div className="home-rows">{rows.map((r,i)=>{const b=book(r.id);return <div key={r.id} className={'home-row-edit'+(r.hidden?' off':'')}>
    <span className="home-n">{i+1}</span>
    <FormControlLabel className="home-title" control={<Checkbox size="small" checked={!r.hidden} onChange={e=>patch(i,{hidden:!e.target.checked})}/>} label={<span dir="auto">{publicTitle(b,lang).split(':')[0]}</span>}/>
    <TextField size="small" type="number" label="Seconds" placeholder={String(seconds)} value={r.seconds??''} onChange={e=>patch(i,{seconds:e.target.value===''?null:Math.max(2,Math.min(60,Number(e.target.value)))})} sx={{width:96}} slotProps={{htmlInput:{min:2,max:60}}}/>
    <IconButton size="small" aria-label="Move up" disabled={i===0} onClick={()=>move(i,-1)}><ArrowUpwardRounded fontSize="small"/></IconButton>
    <IconButton size="small" aria-label="Move down" disabled={i===rows.length-1} onClick={()=>move(i,1)}><ArrowDownwardRounded fontSize="small"/></IconButton>
   </div>;})}
   {!rows.length&&<Alert severity="info">Publish a book and it appears here.</Alert>}</div>
   <h4 className="pub-h">Also on the page</h4>
   <FormControlLabel control={<Switch checked={stars} onChange={e=>setStars(e.target.checked)}/>} label="Show the star rating on each slide"/>
   <FormControlLabel control={<Switch checked={shelf} onChange={e=>setShelf(e.target.checked)}/>} label="Show the shelf of book covers under the slides"/>
   {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  </DialogContent>
  <DialogActions sx={{px:3,pb:2}}><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="contained" disabled={busy} onClick={save}>{busy?'Saving…':'Save'}</Button></DialogActions>
 </Dialog>;
}
