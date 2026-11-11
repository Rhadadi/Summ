import{useState}from'react';
import{Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,MenuItem,TextField}from'@mui/material';
import{CloseRounded,DeleteOutlineRounded,OpenInNewRounded}from'@mui/icons-material';
import type{Book,LocalReview,Review}from'./types';
import{ApiError,researchReview}from'./api';
import{languages}from'./core';

interface Props{book:Book;year:string;initial:LocalReview|null;language:string;onClose:()=>void;onSave:(value:LocalReview)=>Promise<void>;onAccount:()=>void}
const lines=(items:string[])=>items.join('\n');
const split=(text:string)=>text.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,8);
// Research the book's reception with Google Search, then correct and approve it. Nothing is shown to readers until approved.
export default function ReviewDialog({book,year,initial,language,onClose,onSave,onAccount}:Props){
 const[review,setReview]=useState<Review|null>(initial?.review||null),[lang,setLang]=useState(language),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const author=book.author==='Author not supplied'?'':book.author;
 async function run(){
  setBusy(true);setError('');
  try{setReview(await researchReview({title:book.title,author,year,language:lang}));}
  catch(e){if(e instanceof ApiError&&(e.status===401||e.status===412))onAccount();setError((e as Error).message);}finally{setBusy(false);}
 }
 const set=(patch:Partial<Review>)=>setReview(r=>r&&{...r,...patch});
 async function save(approved:boolean){if(!review)return;setBusy(true);try{await onSave({review,approved});}catch(e){setError((e as Error).message);setBusy(false);}}
 return <Dialog open onClose={()=>{if(!busy)onClose();}} fullWidth maxWidth="md" aria-labelledby="review-title" scroll="paper">
  <DialogTitle id="review-title" className="dialog-heading"><span>Reception of <em dir="auto">{book.title.split(':')[0]}</em></span><IconButton aria-label="Close" disabled={busy} onClick={onClose}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent className="wizard">
   <p className="dialog-lead">Gemini searches the web for the reader rating, what critics wrote and what readers praise or fault. Check every number and quote against its link, edit what is off, then approve. This uses your own Gemini key.</p>
   <div className="wizard-bar"><TextField select size="small" label="Write it in" value={lang} onChange={e=>setLang(e.target.value)}>{languages.map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>
    <Button variant={review?'outlined':'contained'} disabled={busy} onClick={run} startIcon={busy?<CircularProgress size={16} color="inherit"/>:undefined}>{busy?'Searching the web…':review?'Research again':'Research reviews'}</Button></div>
   {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
   {review&&<div className="rv-edit">
    <Alert severity="warning" sx={{mb:2}}>Generated from web search. Quotes must be short and attributed; remove anything you cannot confirm at its link.</Alert>
    <TextField fullWidth multiline minRows={2} label="Verdict" value={review.verdict} onChange={e=>set({verdict:e.target.value})} slotProps={{htmlInput:{maxLength:800,dir:'auto'}}}/>
    <div className="settings-grid" style={{margin:'16px 0'}}>
     <TextField size="small" type="number" label="Rating (0–5)" value={review.rating?.value??''} onChange={e=>{const v=e.target.value;set({rating:v===''?null:{value:Math.max(0,Math.min(5,Number(v))),source:review.rating?.source||'Goodreads',count:review.rating?.count??null,url:review.rating?.url??null}});}} slotProps={{htmlInput:{min:0,max:5,step:.01}}}/>
     <TextField size="small" label="Rating source" value={review.rating?.source??''} disabled={!review.rating} onChange={e=>review.rating&&set({rating:{...review.rating,source:e.target.value}})}/>
    </div>
    <div className="settings-grid">
     <TextField multiline minRows={4} label="Praise (one per line)" value={lines(review.pros)} onChange={e=>set({pros:split(e.target.value)})} slotProps={{htmlInput:{dir:'auto'}}}/>
     <TextField multiline minRows={4} label="Criticism (one per line)" value={lines(review.cons)} onChange={e=>set({cons:split(e.target.value)})} slotProps={{htmlInput:{dir:'auto'}}}/>
    </div>
    <h4 className="pub-h">Quotes ({review.quotes.length})</h4>
    {review.quotes.map((q,i)=><div className="rv-edit-quote" key={i}>
     <TextField fullWidth multiline size="small" value={q.text} onChange={e=>set({quotes:review.quotes.map((x,j)=>j===i?{...x,text:e.target.value}:x)})} slotProps={{htmlInput:{dir:'auto'}}}/>
     <small>{q.who}{q.who&&q.source?' · ':''}{q.source}{q.url?<> · <a href={q.url} target="_blank" rel="noopener noreferrer">check the page <OpenInNewRounded fontSize="inherit"/></a></>:' · no link'}</small>
     <IconButton aria-label="Remove quote" onClick={()=>set({quotes:review.quotes.filter((_,j)=>j!==i)})}><DeleteOutlineRounded/></IconButton></div>)}
    <h4 className="pub-h">Sources ({review.sources.length})</h4>
    {review.sources.map((s,i)=><div className="rv-edit-source" key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a><IconButton size="small" aria-label="Remove source" onClick={()=>set({sources:review.sources.filter((_,j)=>j!==i)})}><DeleteOutlineRounded fontSize="small"/></IconButton></div>)}
   </div>}
  </DialogContent>
  <DialogActions sx={{px:3,pb:2}}>
   <Button onClick={onClose} disabled={busy}>Cancel</Button><span style={{flex:1}}/>
   <Button disabled={busy||!review} onClick={()=>save(false)}>Save as draft</Button>
   <Button variant="contained" disabled={busy||!review||(!review.verdict&&!review.quotes.length&&!review.pros.length)} onClick={()=>save(true)}>Approve for readers</Button>
  </DialogActions>
 </Dialog>;
}
