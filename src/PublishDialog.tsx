import{useEffect,useMemo,useState}from'react';
import{Alert,Button,Checkbox,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,LinearProgress,MenuItem,Radio,RadioGroup,TextField}from'@mui/material';
import{ContentCopyRounded,OpenInNewRounded}from'@mui/icons-material';
import type{Book,BookInfo,NarrationStatus}from'./types';
import type{BookData}from'./bookData';
import{narrationStatus,publishBook,startNarration,unpublishBook,uploadCover}from'./api';
import{store}from'./storage';
import{availableVersions,buildDoc,coverBlob}from'./publish';
import{depthLabels,displayName,languages,sectionKind}from'./core';
import{strip}from'./bookData';

const VOICES=['en','fa','de','es','fr','tr','zh','ar'];
interface Props{book:Book;data:BookData;defaultLanguage:string;defaultType:string;onClose:()=>void;onPublished:(p:NonNullable<Book['published']>)=>void;onUnpublished:()=>void}
export default function PublishDialog({book,data,defaultLanguage,defaultType,onClose,onPublished,onUnpublished}:Props){
 const langs=useMemo(()=>availableVersions(data),[data]);
 const[language,setLanguage]=useState(langs.includes(defaultLanguage)?defaultLanguage:langs[0]||defaultLanguage),[type,setType]=useState(defaultType);
 const withSummary=useMemo(()=>book.chapters.filter(c=>data.summaries[c.id]?.language===language),[book,data,language]);
 const[include,setInclude]=useState<Set<string>>(new Set(withSummary.map(c=>c.id)));
 useEffect(()=>setInclude(new Set(withSummary.map(c=>c.id))),[withSummary]);
 const[title,setTitle]=useState(book.title),[author,setAuthor]=useState(book.author==='Author not supplied'?'':displayName(book.author));
 const[visibility,setVisibility]=useState<'public'|'unlisted'>(book.published?.visibility||'public'),[narrate,setNarrate]=useState(VOICES.includes(language));
 const[busy,setBusy]=useState(''),[error,setError]=useState(''),[done,setDone]=useState<{slug:string;id:string}|null>(book.published?{slug:book.published.slug,id:book.published.id}:null),[status,setStatus]=useState<NarrationStatus|null>(null);
 const kinds=book.chapters.map((c,i)=>sectionKind(c,i,book.chapters));
 const hasOverview=!!data.report?.overview&&data.report.language===language;
 const link=done?location.origin+location.pathname.replace(/index\.html$/,'')+'#/b/'+done.slug:'';
 useEffect(()=>{
  if(!done||status?.status!=='running')return;
  const t=setInterval(()=>narrationStatus(done.id,language).then(setStatus).catch(()=>{}),3000);return()=>clearInterval(t);
 },[done,status?.status,language]);
 async function publish(){
  setBusy('publish');setError('');
  try{
   const info:BookInfo|null=(await store.info(book.id).catch(()=>undefined))||null;
   const doc=buildDoc(book,data,{language,type},info,title,author,include);
   const result=await publishBook({id:book.published?.id,doc,visibility});
   const cover=(await store.cover(book.id).catch(()=>undefined))?.blob;
   if(cover)await uploadCover(result.id,await coverBlob(cover)).catch(()=>setError('Published, but the cover could not be uploaded.'));
   setDone({slug:result.slug,id:result.id});onPublished({id:result.id,slug:result.slug,visibility,at:Date.now()});
   if(narrate)setStatus(await startNarration(result.id,language,type).catch(e=>{setError('Published. Narration could not start: '+(e as Error).message);return null;}));
  }catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 async function remove(){
  if(!book.published||!confirm('Unpublish this book? Its link will stop working.'))return;
  setBusy('remove');try{await unpublishBook(book.published.id);setDone(null);setStatus(null);onUnpublished();}catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 const ready=withSummary.length>0&&[...include].some(id=>withSummary.some(c=>c.id===id));
 return <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="publish-title">
  <DialogTitle id="publish-title">{book.published?'Published summary':'Publish this summary'}</DialogTitle>
  <DialogContent>
   <p className="dialog-lead">Readers see your summaries, the study guide and narration. The original file and its text are never uploaded; references show page numbers only.</p>
   {!langs.length?<Alert severity="info">Summarize some chapters first (or import a summary), then publish.</Alert>:<>
    <div className="settings-grid">
     <TextField label="Title" value={title} onChange={e=>setTitle(e.target.value)} fullWidth/>
     <TextField label="Author" value={author} onChange={e=>setAuthor(e.target.value)} fullWidth/>
     <TextField select label="Summary language" value={language} onChange={e=>setLanguage(e.target.value)}>{languages.filter(l=>langs.includes(l.code)).map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>
     <TextField select label="Summary type" value={type} onChange={e=>setType(e.target.value)}>{Object.entries(depthLabels).map(([v,l])=><MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
    </div>
    <h4 className="pub-h">Chapters to include ({[...include].filter(id=>withSummary.some(c=>c.id===id)).length} of {withSummary.length} summarized)</h4>
    <div className="pub-chapters">{withSummary.map(c=><FormControlLabel key={c.id} control={<Checkbox size="small" checked={include.has(c.id)} onChange={e=>setInclude(s=>{const n=new Set(s);e.target.checked?n.add(c.id):n.delete(c.id);return n;})}/>} label={<span dir="auto">{strip(c.title)}{kinds[book.chapters.indexOf(c)]!=='main'?' · '+kinds[book.chapters.indexOf(c)]+' matter':''}</span>}/>)}</div>
    {!withSummary.length&&<Alert severity="warning">No chapter has a summary in this language yet.</Alert>}
    <p className="settings-help">{hasOverview?'The overview, takeaways and study guide are included.':'No whole-book overview in this language yet; only chapter summaries are published.'}</p>
    <h4 className="pub-h">Who can find it?</h4>
    <RadioGroup value={visibility} onChange={e=>setVisibility(e.target.value as 'public'|'unlisted')}>
     <FormControlLabel value="public" control={<Radio/>} label="Listed in the library, open to everyone"/>
     <FormControlLabel value="unlisted" control={<Radio/>} label="Not listed; only people with the link"/>
    </RadioGroup>
    <FormControlLabel control={<Checkbox checked={narrate} disabled={!VOICES.includes(language)} onChange={e=>setNarrate(e.target.checked)}/>} label="Prepare narration (free offline voice, generated once on the server)"/>
   </>}
   {status&&status.status!=='none'&&<div className="pub-status">{status.status==='running'&&<><LinearProgress variant="determinate" value={status.total?status.done/status.total*100:0}/><span>Preparing narration {status.done} of {status.total}…</span></>}{status.status==='ready'&&<Alert severity="success">Narration is ready: {status.total} parts.</Alert>}{status.status==='failed'&&<Alert severity="error">Narration failed: {status.error}</Alert>}</div>}
   {done&&<Alert severity="success" sx={{mt:2}} action={<><Button size="small" startIcon={<ContentCopyRounded/>} onClick={()=>navigator.clipboard?.writeText(link)}>Copy</Button><Button size="small" component="a" href={link} target="_blank" rel="noopener noreferrer" startIcon={<OpenInNewRounded/>}>Open</Button></>}>Published. <span className="pub-link">{link}</span></Alert>}
   {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  </DialogContent>
  <DialogActions sx={{px:3,pb:2}}>
   {book.published&&<Button color="error" disabled={!!busy} onClick={remove}>Unpublish</Button>}
   <span style={{flex:1}}/><Button onClick={onClose}>Close</Button>
   <Button variant="contained" disabled={!!busy||!ready||!title.trim()} onClick={publish} startIcon={busy==='publish'?<CircularProgress size={16} color="inherit"/>:undefined}>{book.published?'Update published version':'Publish'}</Button>
  </DialogActions>
 </Dialog>;
}
