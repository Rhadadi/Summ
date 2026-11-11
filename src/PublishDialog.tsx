import{useEffect,useMemo,useState}from'react';
import{Alert,Button,Checkbox,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,LinearProgress,MenuItem,Radio,RadioGroup,TextField}from'@mui/material';
import{AutoAwesomeRounded,ContentCopyRounded,OpenInNewRounded}from'@mui/icons-material';
import ArtPicker from'./ArtPicker';
import{tagsOf}from'./BookDetail';
import type{ArtResult,Book,BookInfo,LocalReview,NarrationStatus}from'./types';
import type{BookData}from'./bookData';
import{artSearch,narrationStatus,publishBook,setSlide,startNarration,unpublishBook,uploadCover,uploadFigure}from'./api';
import{store}from'./storage';
import{availableVersions,buildDoc,collectFigures,coverBlob,figureBlob,versionData,type Entry}from'./publish';
import{depthLabels,displayName,languages,sectionKind}from'./core';
import{chapterTitle}from'./bookData';

const VOICES=['en','fa','de','es','fr','tr','zh','ar'];
interface Props{onAccount?:()=>void;book:Book;data:BookData;defaultLanguage:string;defaultType:string;onClose:()=>void;onPublished:(p:NonNullable<Book['published']>)=>void;onUnpublished:()=>void}
export default function PublishDialog({onAccount=()=>{},book,data,defaultLanguage,defaultType,onClose,onPublished,onUnpublished}:Props){
 const langs=useMemo(()=>availableVersions(data),[data]);
 const[language,setLanguage]=useState(langs.includes(defaultLanguage)?defaultLanguage:langs[0]||defaultLanguage),[type,setType]=useState(defaultType);
 const imports=data.versions;
 const[picked,setPicked]=useState<Set<string>>(()=>new Set(imports.map(v=>v.id)));
 // Imported summaries are published as they are (each in its own language and style); otherwise the chosen language and type.
 const entries=useMemo<Entry[]>(()=>imports.length?imports.filter(v=>picked.has(v.id)).map(v=>({data:versionData(data,v),choice:{language:v.language,type:v.type,label:v.label}})):[{data,choice:{language,type}}],[imports,picked,data,language,type]);
 const withSummary=useMemo(()=>book.chapters.filter(c=>entries.some(e=>e.data.summaries[c.id]?.language===e.choice.language)),[book,entries]);
 const[include,setInclude]=useState<Set<string>>(new Set(withSummary.map(c=>c.id)));
 useEffect(()=>setInclude(new Set(withSummary.map(c=>c.id))),[withSummary]);
 const[title,setTitle]=useState(book.title),[author,setAuthor]=useState(book.author==='Author not supplied'?'':displayName(book.author));
 const[visibility,setVisibility]=useState<'public'|'unlisted'>(book.published?.visibility||'public'),[narrate,setNarrate]=useState(VOICES.includes(language)||imports.some(v=>VOICES.includes(v.language)));
 const[busy,setBusy]=useState(''),[error,setError]=useState(''),[done,setDone]=useState<{slug:string;id:string}|null>(book.published?{slug:book.published.slug,id:book.published.id}:null),[status,setStatus]=useState<NarrationStatus|null>(null);
 // How this book looks on the home page: a gallery painting chosen for the book, or just its cover.
 const[slide,setSlideMode]=useState<'keep'|'none'|'cover'|'art'>(book.published?'keep':'none'),[artPick,setArtPick]=useState<ArtResult|null>(null),[picker,setPicker]=useState(false),[tags,setTags]=useState<string[]>([]);
 useEffect(()=>{store.info(book.id).then(info=>setTags(tagsOf(info?.categories||[]))).catch(()=>{});},[book.id]);
 const[withPages,setWithPages]=useState(false),[withFigures,setWithFigures]=useState(true);
 const[localReview,setLocalReview]=useState<LocalReview|null>(null),[withReview,setWithReview]=useState(true);
 useEffect(()=>{store.review(book.id).then(r=>setLocalReview(r||null)).catch(()=>{});},[book.id]);
 const kinds=book.chapters.map((c,i)=>sectionKind(c,i,book.chapters));
 const hasOverview=entries.some(e=>!!e.data.report?.overview&&e.data.report.language===e.choice.language);
 const link=done?location.origin+location.pathname.replace(/index\.html$/,'')+'#/b/'+done.slug:'';
 useEffect(()=>{
  if(!done||status?.status!=='running')return;
  const t=setInterval(()=>narrationStatus(done.id,language).then(setStatus).catch(()=>{}),3000);return()=>clearInterval(t);
 },[done,status?.status,language]);
 async function publish(){
  setBusy('publish');setError('');
  try{
   const info:BookInfo|null=(await store.info(book.id).catch(()=>undefined))||null;
   const figures=withFigures?collectFigures(entries,include):{names:new Map<string,string>(),files:[]};
   const doc=buildDoc(book,entries,info,title,author,include,localReview?.approved&&withReview?localReview.review:null,{pages:withPages,figures:figures.names});
   const result=await publishBook({id:book.published?.id,doc,visibility});
   const cover=(await store.cover(book.id).catch(()=>undefined))?.blob;
   if(cover)await uploadCover(result.id,await coverBlob(cover)).catch(()=>setError('Published, but the cover could not be uploaded.'));
   for(const f of figures.files)await uploadFigure(result.id,f.name,await figureBlob(f.image)).catch(()=>setError('Published, but a figure could not be uploaded.'));
   if(slide!=='keep')await setSlide(result.id,slide,artPick?.file).catch(e=>setError('Published, but the home slide could not be set: '+(e as Error).message));
   setDone({slug:result.slug,id:result.id});onPublished({id:result.id,slug:result.slug,visibility,at:Date.now()});
   if(narrate)for(const e of entries.filter(x=>VOICES.includes(x.choice.language)))setStatus(await startNarration(result.id,e.choice.language,e.choice.type).catch(err=>{setError('Published. Narration could not start: '+(err as Error).message);return null;}));
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
     {!imports.length&&<TextField select label="Summary language" value={language} onChange={e=>setLanguage(e.target.value)}>{languages.filter(l=>langs.includes(l.code)).map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>}
     {!imports.length&&<TextField select label="Summary type" value={type} onChange={e=>setType(e.target.value)}>{Object.entries(depthLabels).map(([v,l])=><MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>}
    </div>
    {imports.length>0&&<><h4 className="pub-h">Summaries to publish</h4><div className="pub-chapters">{imports.map(v=><FormControlLabel key={v.id} control={<Checkbox size="small" checked={picked.has(v.id)} onChange={e=>setPicked(s=>{const n=new Set(s);e.target.checked?n.add(v.id):n.delete(v.id);return n;})}/>} label={v.label+' · '+(languages.find(l=>l.code===v.language)?.label||v.language)}/>)}</div></>}
    <h4 className="pub-h">Chapters to include ({[...include].filter(id=>withSummary.some(c=>c.id===id)).length} of {withSummary.length} summarized)</h4>
    <div className="pub-chapters">{withSummary.map(c=><FormControlLabel key={c.id} control={<Checkbox size="small" checked={include.has(c.id)} onChange={e=>setInclude(s=>{const n=new Set(s);e.target.checked?n.add(c.id):n.delete(c.id);return n;})}/>} label={<span dir="auto">{chapterTitle(data,c)}{kinds[book.chapters.indexOf(c)]!=='main'?' · '+kinds[book.chapters.indexOf(c)]+' matter':''}</span>}/>)}</div>
    {!withSummary.length&&<Alert severity="warning">No chapter has a summary in this language yet.</Alert>}
    <FormControlLabel control={<Checkbox checked={withPages} onChange={e=>setWithPages(e.target.checked)}/>} label="Show page numbers beside paragraphs"/>
    {entries.some(e=>(e.data.version?.images||[]).length>0)&&<FormControlLabel control={<Checkbox checked={withFigures} onChange={e=>setWithFigures(e.target.checked)}/>} label="Include figures and maps from the summary (make sure you may publish them)"/>}
    <p className="settings-help">{hasOverview?'The overview, takeaways and study guide are included.':'No whole-book overview in this language yet; only chapter summaries are published.'}</p>
    {localReview?.approved&&<FormControlLabel control={<Checkbox checked={withReview} onChange={e=>setWithReview(e.target.checked)}/>} label="Include the approved reception: rating, praise and criticism, quotes"/>}
    <h4 className="pub-h">Home page slide</h4>
    <RadioGroup value={slide} onChange={e=>setSlideMode(e.target.value as typeof slide)}>
     {book.published&&<FormControlLabel value="keep" control={<Radio/>} label="Keep the current slide"/>}
     <FormControlLabel value="none" control={<Radio/>} label="Automatic: a painting from the gallery rotation"/>
     <FormControlLabel value="cover" control={<Radio/>} label="The book cover only"/>
     <FormControlLabel value="art" control={<Radio/>} label="A public-domain painting that fits this book"/>
    </RadioGroup>
    {slide==='art'&&<div className="art-pick">
     {artPick?<div className="art-chosen"><img src={artPick.thumb} alt=""/><div><strong>{artPick.title}</strong><small>{[artPick.artist,artPick.year].filter(Boolean).join(', ')}</small><Button size="small" onClick={()=>setPicker(true)}>Choose another</Button></div></div>
      :<Button variant="outlined" startIcon={<AutoAwesomeRounded/>} onClick={()=>setPicker(true)}>Choose a painting…</Button>}
     <p className="settings-help">Paintings come from Wikimedia Commons and are shown with their credit on the home page.</p>
    </div>}
    <h4 className="pub-h">Who can find it?</h4>
    <RadioGroup value={visibility} onChange={e=>setVisibility(e.target.value as 'public'|'unlisted')}>
     <FormControlLabel value="public" control={<Radio/>} label="Listed in the library, open to everyone"/>
     <FormControlLabel value="unlisted" control={<Radio/>} label="Not listed; only people with the link"/>
    </RadioGroup>
    <FormControlLabel control={<Checkbox checked={narrate} disabled={!entries.some(e=>VOICES.includes(e.choice.language))} onChange={e=>setNarrate(e.target.checked)}/>} label="Prepare narration (free offline voice, generated once on the server)"/>
   </>}
   {status&&status.status!=='none'&&<div className="pub-status">{status.status==='running'&&<><LinearProgress variant="determinate" value={status.total?status.done/status.total*100:0}/><span>Preparing narration {status.done} of {status.total}…</span></>}{status.status==='ready'&&<Alert severity="success">Narration is ready: {status.total} parts.</Alert>}{status.status==='failed'&&<Alert severity="error">Narration failed: {status.error}</Alert>}</div>}
   {done&&<Alert severity="success" sx={{mt:2}} action={<><Button size="small" startIcon={<ContentCopyRounded/>} onClick={()=>navigator.clipboard?.writeText(link)}>Copy</Button><Button size="small" component="a" href={link} target="_blank" rel="noopener noreferrer" startIcon={<OpenInNewRounded/>}>Open</Button></>}>Published. <span className="pub-link">{link}</span></Alert>}
   {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  </DialogContent>
  <DialogActions sx={{px:3,pb:2}}>
   {book.published&&<Button color="error" disabled={!!busy} onClick={remove}>Unpublish</Button>}
   <span style={{flex:1}}/><Button onClick={onClose}>Close</Button>
   <Button variant="contained" disabled={!!busy||!ready||!title.trim()||(slide==='art'&&!artPick)} onClick={publish} startIcon={busy==='publish'?<CircularProgress size={16} color="inherit"/>:undefined}>{book.published?'Update published version':'Publish'}</Button>
  </DialogActions>
 {picker&&<ArtPicker title={title||book.title} author={author} about={data.report?.overview?.paragraphs[0]?.text||''} themes={localReview?.review.themes||[]} tags={tags} language={languages.find(l=>l.code===(entries[0]?.choice.language||'en'))?.label.replace(/ ·.*/,'')||'English'} initial={artPick} onAccount={onAccount} onClose={()=>setPicker(false)} onPick={a=>{setArtPick(a);setPicker(false);}}/>}
 </Dialog>;
}
