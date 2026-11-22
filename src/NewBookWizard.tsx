import{useEffect,useMemo,useRef,useState,type ReactNode}from'react';
import{Alert,Button,ButtonBase,Checkbox,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,MenuItem,Radio,RadioGroup,Step,StepButton,Stepper,TextField,useMediaQuery}from'@mui/material';
import{AutoAwesomeRounded,CheckCircleRounded,CloseRounded,ContentCopyRounded,ErrorOutlineRounded,FolderZipOutlined,MenuBookRounded,OpenInNewRounded,RemoveCircleOutlineRounded}from'@mui/icons-material';
import ArtPicker from'./ArtPicker';
import ReviewDialog from'./ReviewDialog';
import type{ArtResult,PubBook,PubPara}from'./types';
import{ApiError,artIdeas,bookInfo,coverImage,editorialAssist,identifyBook,publishBook,researchReview,setSlide,startNarration,uploadCover,uploadFigure}from'./api';
import{coverBlob,figureBlob}from'./publish';
import{languages}from'./core';
import{readSummaryFiles}from'./summary-import';
import{parseSummaries,type ZipSummary}from'./replace-import';
import{persianImportIssue}from'./persian-import';
import{compose,defaultChapters,hasOverview,identifyText,leadLanguage,overviewSource,sourceFromZip,type ChapterChoice,type Proposal,type Source}from'./new-book';

// Adding a book, start to finish: the summary ZIP (or the summaries brought back into a whole book), its chapters, a proposal
// AI prepares while the editor checks the chapters, then publishing. Every AI part can fail on its own without stopping the rest.
type TaskId='identify'|'details'|'reception'|'background'|'overview';
type Task={state:'idle'|'running'|'done'|'failed'|'off';message?:string};
type Voice='none'|'offline'|'elevenlabs';
const VOICES=['en','fa','de','es','fr','tr','zh','ar'];
const STEPS=['Start','Chapters','Proposal','Publish'];
const languageName=(code:string)=>languages.find(l=>l.code===code)?.label.replace(/.*· /,'').replace(/ \(.*/,'')||code;
const nameFor=(code:string)=>({fa:'Persian',en:'English',de:'German',ar:'Arabic',es:'Spanish',fr:'French',tr:'Turkish',zh:'Chinese'} as Record<string,string>)[code]||'English';
const blankProposal=():Proposal=>({title:'',originalTitle:'',author:'',info:{year:'',publisher:'',pages:null,description:'',categories:[]},overviews:{},review:null,reviewApproved:true});
// The reason, said so the editor can act on it; a missing key is not a failure of the book.
const reason=(e:unknown)=>e instanceof ApiError&&e.status===412?'Needs your Gemini key (Account).':e instanceof ApiError&&e.status===401?'Sign in again to use AI.':e instanceof Error?e.message:'Something went wrong.';

interface Props{hasKey:boolean;hasVoiceKey:boolean;initial?:Source|null;initialCover?:Blob|null;onWholeBook:(file:File)=>void;onOtherSource:()=>void;onClose:()=>void;onPublished:(b:PubBook)=>void;onAccount:()=>void;onOpen:(slug:string)=>void;onEdit:(id:string)=>void}
export default function NewBookWizard({hasKey,hasVoiceKey,initial=null,initialCover=null,onWholeBook,onOtherSource,onClose,onPublished,onAccount,onOpen,onEdit}:Props){
 const phone=useMediaQuery('(max-width:699px)');
 const zipInput=useRef<HTMLInputElement>(null),bookInput=useRef<HTMLInputElement>(null),coverInput=useRef<HTMLInputElement>(null);
 const[step,setStep]=useState(initial?1:0),[source,setSource]=useState<Source|null>(initial),[fileName,setFileName]=useState(''),[reading,setReading]=useState(false),[error,setError]=useState('');
 // a whole book: the summary names it in its own language; the file's title is then the original one
 const[p,setP]=useState<Proposal>(()=>{if(!initial)return blankProposal();const named=initial.versions[0]?.bookTitle?.trim()||initial.book.title;
  return{...blankProposal(),title:named,originalTitle:named!==initial.book.title?initial.book.title:'',author:initial.book.author==='Author not supplied'?'':initial.book.author};});
 const[chapters,setChapters]=useState<ChapterChoice[]>(()=>initial?defaultChapters(initial):[]);
 const[wants,setWants]=useState({details:true,reception:hasKey,background:hasKey,overview:hasKey});
 const[voices,setVoices]=useState<Record<string,Voice>>({}),[visibility,setVisibility]=useState<'public'|'unlisted'>('public');
 const[tasks,setTasks]=useState<Record<TaskId,Task>>({identify:{state:'idle'},details:{state:'idle'},reception:{state:'idle'},background:{state:'idle'},overview:{state:'idle'}});
 const[covers,setCovers]=useState<string[]>([]),[cover,setCover]=useState<{blob:Blob;url:string;from:string}|null>(null);
 const[art,setArt]=useState<ArtResult[]>([]),[slide,setSlideMode]=useState<'art'|'cover'|'none'>('art'),[artPick,setArtPick]=useState<ArtResult|null>(null),[fit,setFit]=useState<'fill'|'whole'>('fill'),[picker,setPicker]=useState(false),[reviewOpen,setReviewOpen]=useState(false);
 const[blocks,setBlocks]=useState<ZipSummary[]>([]);
 const coverRef=useRef(cover);coverRef.current=cover;
 const[progress,setProgress]=useState<{text:string;ok:boolean|null}[]>([]),[publishing,setPublishing]=useState(false),[done,setDone]=useState<PubBook|null>(null);
 const lang=source?leadLanguage(source):'fa';
 const set=(patch:Partial<Proposal>)=>setP(x=>({...x,...patch}));
 const setInfo=(patch:Partial<Proposal['info']>)=>setP(x=>({...x,info:{...x.info,...patch}}));
 const mark=(id:TaskId,state:Task['state'],message?:string)=>setTasks(t=>({...t,[id]:{state,message}}));
 const live=useRef(true);useEffect(()=>()=>{live.current=false;},[]);
 const useCover=async(blob:Blob,from:string)=>{const b=await coverBlob(blob);setCover(old=>{if(old)URL.revokeObjectURL(old.url);return{blob:b,url:URL.createObjectURL(b),from};});};
 useEffect(()=>{
  if(initialCover)void useCover(initialCover,'the book file').catch(()=>{});else if(initial?.cover)void useCover(new Blob([initial.cover.data],{type:initial.cover.type}),'the ZIP').catch(()=>{});
  // a whole book arrives here at the chapter step, its summaries already brought back: start everything at once
  if(initial){void identify(initial,initial.book.title);startProposal();}
 },[]);// eslint-disable-line react-hooks/exhaustive-deps

 // ---- the AI tasks. Each one fills only what the editor has not typed, and says why when it cannot.
 async function details(title:string,author:string){
  if(!title.trim())return;mark('details','running');
  try{const info=await bookInfo(title,author);if(!live.current)return;
   setP(x=>({...x,author:x.author||info.authors.join(' and '),info:{year:x.info.year||info.year||'',publisher:x.info.publisher||info.publisher||'',pages:x.info.pages??info.pages,description:x.info.description||info.description||'',categories:x.info.categories.length?x.info.categories:info.categories.slice(0,8)}}));
   setCovers(info.covers.slice(0,8));
   if(info.covers[0]&&!coverRef.current)void coverImage(info.covers[0]).then(b=>{if(!coverRef.current)return useCover(b,'an online catalogue');}).catch(()=>{});
   mark('details','done',info.covers.length?info.covers.length+' covers found':'No cover found online; upload one if you have it.');
  }catch(e){mark('details','failed',reason(e));}
 }
 async function identify(s:Source,title:string){
  if(!hasKey){mark('identify','off','Add your Gemini key in Account to fill these in automatically.');await details(title,'');return;}
  mark('identify','running');
  try{const r=await identifyBook({title,text:identifyText(s)});if(!live.current)return;
   setP(x=>({...x,originalTitle:x.originalTitle||r.original_title,author:x.author||r.author,info:{...x.info,year:x.info.year||r.year}}));
   mark('identify','done',r.original_title?'Identified as “'+r.original_title+'”'+(r.author?' by '+r.author:''):'The AI could not tell which book this is. Type the original title.');
   await details(r.original_title||title,r.author);
  }catch(e){mark('identify','failed',reason(e));await details(title,'');}
 }
 async function reception(){
  mark('reception','running');
  try{const r=await researchReview({title:p.originalTitle||p.title,author:p.author,year:p.info.year,language:lang});if(!live.current)return;set({review:r});mark('reception','done',(r.critics?.length||0)+' critics, '+r.quotes.length+' quotes, '+r.sources.length+' sources');}
  catch(e){mark('reception','failed',reason(e));}
 }
 async function background(){
  mark('background','running');
  try{const about=(p.overviews[0]||source?.versions[0]?.report.overview?.paragraphs||[]).map(x=>x.text).join(' ').slice(0,3800);
   const r=await artIdeas({title:p.originalTitle||p.title,author:p.author,about,themes:[...(p.review?.themes||[]),...p.info.categories].slice(0,12),language:nameFor(lang)});if(!live.current)return;
   const all=r.ideas.flatMap(i=>i.results.slice(0,2));setArt(all);setArtPick(old=>old||all[0]||null);
   mark('background','done',all.length?all.length+' paintings to choose from':'No public-domain painting matched. Search for one or use the cover.');
  }catch(e){mark('background','failed',reason(e));}
 }
 async function overview(){
  if(!source)return;mark('overview','running');
  try{const r=await editorialAssist({action:'overview',source:overviewSource(source,chapters),language:lang});if(!live.current)return;set({overviews:{...p.overviews,0:[{text:r.text}]}});mark('overview','done','Drafted from the chapter summaries');}
  catch(e){mark('overview','failed',reason(e));}
 }
 // Leaving the first step starts everything that takes a while, so it is ready by the time the chapters are checked.
 function startProposal(){
  if(!source)return;
  if(wants.reception&&tasks.reception.state==='idle')void reception();else if(!wants.reception)mark('reception','off');
  if(wants.background&&tasks.background.state==='idle')void background();else if(!wants.background)mark('background','off');
  if(!hasOverview(source)){if(wants.overview&&tasks.overview.state==='idle')void overview();else if(!wants.overview)mark('overview','off');}
  else mark('overview','off','The ZIP has its own overview.');
 }
 async function read(file:File){
  setError('');setReading(true);
  try{const r=await readSummaryFiles(file);const found=parseSummaries(r.documents),s=sourceFromZip(found,r.images,r.documents[0].name);setBlocks(found);
   setSource(s);setFileName(file.name);setChapters(defaultChapters(s));
   const title=s.book.title;setP({...blankProposal(),title});
   if(s.cover)void useCover(new Blob([s.cover.data],{type:s.cover.type}),'the ZIP').catch(()=>{});
   void identify(s,title);
  }catch(e){setError(e instanceof Error?e.message:'That file could not be read.');}finally{setReading(false);}
 }
 const composed=useMemo(()=>source?compose(source,chapters,p):null,[source,chapters,p]);
 const issues=useMemo(()=>blocks.filter(b=>b.lang==='fa').map(b=>persianImportIssue(b.block)).filter((x):x is string=>!!x),[blocks]);
 const voiceFor=(l:string):Voice=>voices[l]??'none';
 const langs=source?[...new Set(source.versions.map(v=>v.language))]:[];

 async function publish(){
  if(!composed||!source)return;
  if(composed.problems.length){setError(composed.problems.join(' '));return;}
  setPublishing(true);setError('');const lines:{text:string;ok:boolean|null}[]=[];
  const say=(text:string,ok:boolean|null)=>{lines.push({text,ok});setProgress([...lines]);};
  const fix=(i:number,text:string,ok:boolean)=>{lines[i]={text,ok};setProgress([...lines]);};
  try{
   say('Publishing the text…',null);
   const result=await publishBook({doc:composed.doc,visibility});fix(0,'Text published: '+composed.doc.chapters.length+' chapters',true);
   if(cover){const i=lines.length;say('Uploading the cover…',null);await uploadCover(result.id,cover.blob).then(()=>fix(i,'Cover uploaded',true)).catch(e=>fix(i,'The cover could not be uploaded: '+reason(e)+' Add it later in the book editor.',false));}
   if(composed.figures.length){const i=lines.length;let failed=0;say('Uploading '+composed.figures.length+' figures…',null);for(const f of composed.figures)await uploadFigure(result.id,f.name,await figureBlob(f.image)).catch(()=>{failed++;});fix(i,failed?failed+' of '+composed.figures.length+' figures could not be uploaded; replace them in the book editor.':'Figures uploaded',!failed);}
   if(slide==='cover'||(slide==='art'&&artPick)){const i=lines.length;say('Setting the home page background…',null);
    const caption=slide==='art'&&artPick?{text:[artPick.title,artPick.artist,artPick.year].filter(Boolean).join(', ').slice(0,200),url:artPick.page}:undefined;
    await setSlide(result.id,slide,slide==='art'?artPick!.file:undefined,fit,caption).then(()=>fix(i,'Home page background set',true)).catch(e=>fix(i,'The background could not be set: '+reason(e),false));}
   for(const l of langs.filter(x=>VOICES.includes(x)&&voiceFor(x)!=='none')){const v=composed.doc.versions.find(x=>x.language===l)!;const i=lines.length;say('Starting the '+languageName(l)+' narration…',null);
    await startNarration(result.id,l,v.type,voiceFor(l) as 'offline'|'elevenlabs').then(()=>fix(i,languageName(l)+' narration started; it is ready in a few minutes',true)).catch(e=>fix(i,'The '+languageName(l)+' narration could not start: '+reason(e)+' Start it later from the book’s Audio tab.',false));}
   setDone(result);onPublished(result);
  }catch(e){if(!lines.length||lines[0].ok===null){setProgress([]);setError('Nothing was published. '+reason(e));}else setError(reason(e));}
  finally{setPublishing(false);}
 }
 const busyClose=publishing||reading;
 function close(){if(busyClose)return;if(source&&!done&&!confirm('Close without publishing? What AI prepared here will be lost.'))return;onClose();}
 const canNext=step===0?!!source&&!!p.title.trim():step===1?chapters.some(c=>c.include):true;
 function next(){if(step===0)startProposal();setStep(step+1);setError('');}

 const status=(id:TaskId,label:string,run?:()=>void)=>{const t=tasks[id];if(t.state==='idle')return null;return <div className={'nb-task nb-'+t.state} role="status">
  {t.state==='running'?<CircularProgress size={16}/>:t.state==='done'?<CheckCircleRounded fontSize="small"/>:t.state==='failed'?<ErrorOutlineRounded fontSize="small"/>:<RemoveCircleOutlineRounded fontSize="small"/>}
  <span><strong>{label}</strong>{t.state==='running'?' · working…':t.message?' · '+t.message:t.state==='off'?' · not asked for':''}</span>
  {t.state==='failed'&&/Gemini key|Sign in/.test(t.message||'')&&<Button size="small" onClick={onAccount}>Account</Button>}
  {run&&(t.state==='failed'||t.state==='done'||t.state==='off')&&<Button size="small" onClick={run} disabled={!hasKey&&id!=='details'}>{t.state==='done'?'Again':'Try'}</Button>}</div>;};
 const ov=p.overviews[0]||source?.versions[0]?.report.overview?.paragraphs.map(x=>({text:x.text}))||[];
 const setOv=(next:PubPara[])=>set({overviews:{...p.overviews,0:next}});
 const dir=lang==='fa'||lang==='ar'?'rtl':'ltr';

 return <Dialog open onClose={close} fullScreen={phone} fullWidth maxWidth="md" scroll="paper" aria-labelledby="nb-title">
  <DialogTitle id="nb-title" className="dialog-heading"><span>{done?'Published':'Add a book'}{p.title&&<> · <em dir="auto">{p.title.split(':')[0]}</em></>}</span><IconButton aria-label="Close" disabled={busyClose} onClick={close}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent className="wizard nb">
   <Stepper nonLinear activeStep={step} className="wizard-steps">{STEPS.map((label,i)=><Step key={label} completed={i<step}><StepButton disabled={!source||publishing||!!done||(i>0&&!p.title.trim())} onClick={()=>{if(step===0&&i>0)startProposal();setStep(i);}}>{label}</StepButton></Step>)}</Stepper>
   <input ref={zipInput} type="file" hidden accept=".zip,.md,.markdown" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void read(f);}}/>
   <input ref={bookInput} type="file" hidden accept=".pdf,.epub,.txt,.md,.html,.htm" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)onWholeBook(f);}}/>
   <input ref={coverInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void useCover(f,'your upload').catch(()=>setError('That image could not be read.'));}}/>

   {step===0&&!source&&<section>
    <p className="dialog-lead">What do you have?</p>
    <div className="nb-choices">
     <ButtonBase className="upload-zone" disabled={reading} onClick={()=>zipInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)void read(f);}}>
      <span className="upload-icon">{reading?<CircularProgress size={22}/>:<FolderZipOutlined/>}</span><strong>{reading?'Reading the summary…':'A summary ZIP'}</strong><span>Markdown with its images, from ChatGPT, Claude or Gemini. Drop it here.</span><small>Fastest: AI prepares the rest and you publish.</small></ButtonBase>
     <ButtonBase className="upload-zone" disabled={reading} onClick={()=>bookInput.current?.click()}>
      <span className="upload-icon"><MenuBookRounded/></span><strong>The whole book</strong><span>PDF, EPUB, text or HTML.</span><small>You get a prompt for the AI of your choice, bring its ZIP back, and continue here.</small></ButtonBase>
    </div>
    <Button size="small" sx={{mt:1}} onClick={onOtherSource}>A link or pasted text instead</Button>
   </section>}

   {step===0&&source&&<section>
    <Alert severity="success" sx={{mb:2}}>{fileName||'The book'}: {source.versions.length===1?'1 summary':source.versions.length+' summaries'} ({source.versions.map(v=>v.label+' · '+languageName(v.language)).join(', ')}), {source.book.chapters.length} chapters{source.images.length?', '+source.images.length+' images':''}.</Alert>
    {status('identify','Finding the book')}{status('details','Book details and covers')}
    <div className="settings-grid">
     <TextField label={'Title · '+languageName(lang)} value={p.title} onChange={e=>set({title:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}} required/>
     <TextField label="Original title (for covers and reviews)" value={p.originalTitle} onChange={e=>set({originalTitle:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
     <TextField label="Author" value={p.author} onChange={e=>set({author:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
     <TextField label="Year" value={p.info.year} onChange={e=>setInfo({year:e.target.value.replace(/\D/g,'').slice(0,4)})}/>
    </div>
    <div className="wizard-bar" style={{marginTop:8}}><span style={{flex:1}}/><Button size="small" disabled={!p.title.trim()&&!p.originalTitle.trim()} onClick={()=>details(p.originalTitle||p.title,p.author)}>Look up details and covers again</Button></div>
    <h4 className="pub-h">What should AI prepare?</h4>
    {!hasKey&&<Alert severity="info" sx={{mb:1}} action={<Button size="small" onClick={onAccount}>Account</Button>}>AI drafting uses your own Gemini key. Without it you still get the catalogue details and covers, and you can write the rest yourself.</Alert>}
    <div className="wizard-langs">
     <FormControlLabel control={<Checkbox size="small" checked={wants.reception} disabled={!hasKey} onChange={e=>setWants(w=>({...w,reception:e.target.checked}))}/>} label="Reception: verdict, praise, criticism, about the author"/>
     <FormControlLabel control={<Checkbox size="small" checked={wants.background} disabled={!hasKey} onChange={e=>setWants(w=>({...w,background:e.target.checked}))}/>} label="A painting for the home page background"/>
     {!hasOverview(source)&&<FormControlLabel control={<Checkbox size="small" checked={wants.overview} disabled={!hasKey} onChange={e=>setWants(w=>({...w,overview:e.target.checked}))}/>} label="An overview (the ZIP has none)"/>}
    </div>
    <h4 className="pub-h">Audio</h4>
    <div className="pub-audio">{langs.filter(l=>VOICES.includes(l)).map(l=><label key={l}><span>{languageName(l)}</span>
     <TextField select size="small" value={voiceFor(l)} onChange={e=>setVoices(v=>({...v,[l]:e.target.value as Voice}))}>
      <MenuItem value="none">No audio</MenuItem><MenuItem value="offline">Free offline voice</MenuItem>
      <MenuItem value="elevenlabs" disabled={!hasVoiceKey}>{hasVoiceKey?'ElevenLabs · about '+Math.round((composed?.chars[l]||0)/1000)+'k characters':'ElevenLabs · add your key in Account'}</MenuItem></TextField></label>)}</div>
    <p className="settings-help">ElevenLabs is billed to your own plan, about $0.10 per 1,000 characters. Narration starts after publishing and takes a few minutes.</p>
    <div className="wizard-bar" style={{marginTop:8}}><span style={{flex:1}}/><Button size="small" onClick={()=>{setSource(null);setFileName('');setCover(null);setCovers([]);}}>Choose another file</Button></div>
   </section>}

   {step===1&&source&&<section>
    <p className="dialog-lead">The chapters as readers will see them. Untick what should not be published, rename, or mark front and back matter. AI is preparing the proposal meanwhile.</p>
    {issues.map((x,i)=><Alert key={i} severity="info" sx={{mb:1}}>{x} It will be published as it is; you can fix it in the proposal or later.</Alert>)}
    <div className="wizard-bar"><strong>{chapters.filter(c=>c.include).length} of {chapters.length} chapters</strong><Button size="small" onClick={()=>setChapters(cs=>cs.map(c=>({...c,include:true})))}>All</Button><Button size="small" onClick={()=>setChapters(cs=>cs.map(c=>({...c,include:c.group==='main'})))}>Main only</Button></div>
    <ol className="nb-chapters">{chapters.map((c,i)=>{const v=source.versions.find(x=>x.report.chapters[c.id]);const n=v?.report.chapters[c.id].paragraphs.length||0;const words=v?v.report.chapters[c.id].paragraphs.reduce((m,x)=>m+x.text.split(/\s+/).length,0):0;
     const upd=(patch:Partial<ChapterChoice>)=>setChapters(cs=>cs.map((x,j)=>j===i?{...x,...patch}:x));
     return <li key={c.id} className={c.include?'':'off'}>
      <Checkbox size="small" checked={c.include} disabled={!v} onChange={e=>upd({include:e.target.checked})} slotProps={{input:{'aria-label':'Publish chapter '+(i+1)}}}/>
      <TextField size="small" fullWidth value={c.title} onChange={e=>upd({title:e.target.value})} slotProps={{htmlInput:{dir:'auto','aria-label':'Title of chapter '+(i+1)}}} helperText={v?n+' paragraphs · '+Math.max(1,Math.round(words/220))+' min'+(n>400?' · too long to publish: merge paragraphs':''):'No summary in the ZIP'} error={n>400}/>
      <TextField select size="small" value={c.group} onChange={e=>upd({group:e.target.value as ChapterChoice['group']})} slotProps={{htmlInput:{'aria-label':'Kind of chapter '+(i+1)}}} sx={{minWidth:120}}><MenuItem value="front">Front</MenuItem><MenuItem value="main">Chapter</MenuItem><MenuItem value="back">Back</MenuItem></TextField>
      <span className="nb-move"><IconButton size="small" aria-label={'Move chapter '+(i+1)+' up'} disabled={i===0} onClick={()=>setChapters(cs=>{const n_=[...cs];[n_[i-1],n_[i]]=[n_[i],n_[i-1]];return n_;})}>↑</IconButton><IconButton size="small" aria-label={'Move chapter '+(i+1)+' down'} disabled={i===chapters.length-1} onClick={()=>setChapters(cs=>{const n_=[...cs];[n_[i+1],n_[i]]=[n_[i],n_[i+1]];return n_;})}>↓</IconButton></span>
     </li>;})}</ol>
    <div className="nb-tasks">{status('reception','Reception')}{status('background','Background painting')}{status('overview','Overview')}</div>
   </section>}

   {step===2&&source&&<section>
    <p className="dialog-lead">The proposal. Change anything; “Ask AI” rewrites a part the way you say. Parts AI could not prepare say why and can be tried again.</p>
    <div className="nb-card"><h4>Book</h4>
     <div className="settings-grid">
      <TextField label={'Title · '+languageName(lang)} value={p.title} onChange={e=>set({title:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
      <TextField label="Original title" value={p.originalTitle} onChange={e=>set({originalTitle:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
      <TextField label="Author" value={p.author} onChange={e=>set({author:e.target.value})}/>
      <TextField label="Year" value={p.info.year} onChange={e=>setInfo({year:e.target.value.replace(/\D/g,'').slice(0,4)})}/>
      <TextField label="Publisher" value={p.info.publisher} onChange={e=>setInfo({publisher:e.target.value})}/>
      <TextField label="Pages" type="number" value={p.info.pages??''} onChange={e=>setInfo({pages:e.target.value?Number(e.target.value):null})}/>
     </div>
     <TextField label="Subjects (comma separated)" fullWidth size="small" sx={{mt:2}} value={p.info.categories.join(', ')} onChange={e=>setInfo({categories:e.target.value.split(/[,،]/).map(x=>x.trim()).filter(Boolean).slice(0,12)})}/>
     <TextField label="Publisher description" fullWidth multiline minRows={2} sx={{mt:2}} value={p.info.description} onChange={e=>setInfo({description:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
     <AskAi text={p.info.description} language={lang} onText={t=>setInfo({description:t})} onAccount={onAccount} hasKey={hasKey}/>
    </div>
    <div className="nb-card"><h4>Cover</h4>{status('details','Covers',()=>details(p.originalTitle||p.title,p.author))}
     <div className="zip-cover">{cover?<img src={cover.url} alt="The chosen cover"/>:<span className="zip-nocover">No cover yet</span>}<div><small>{cover?'From '+cover.from+'.':'Pick one below or upload one.'}</small>
      <div className="zip-cover-actions"><Button size="small" variant="outlined" onClick={()=>coverInput.current?.click()}>Upload an image</Button>{cover&&<Button size="small" onClick={()=>setCover(null)}>No cover</Button>}</div></div></div>
     {covers.length>0&&<div className="zip-choices">{covers.map(u=><button key={u} type="button" aria-label="Use this cover" onClick={async()=>{try{await useCover(await coverImage(u),'an online catalogue');}catch{setError('That cover could not be downloaded. Pick another.');}}}><img src={u} alt="" loading="lazy"/></button>)}</div>}
    </div>
    <div className="nb-card"><h4>Overview</h4>{status('overview','Overview',overview)}
     {ov.map((x,i)=><div key={i} className="nb-para"><TextField fullWidth multiline minRows={3} value={x.text} onChange={e=>setOv(ov.map((y,j)=>j===i?{...y,text:e.target.value}:y))} slotProps={{htmlInput:{dir,'aria-label':'Overview paragraph '+(i+1)}}}/>
      <AskAi text={x.text} language={lang} onText={t=>setOv(ov.map((y,j)=>j===i?{...y,text:t}:y))} onAccount={onAccount} hasKey={hasKey} extra={<Button size="small" color="inherit" onClick={()=>setOv(ov.filter((_,j)=>j!==i))}>Remove</Button>}/></div>)}
     <Button size="small" onClick={()=>setOv([...ov,{text:''}])}>Add a paragraph</Button>
    </div>
    <div className="nb-card"><h4>Reception and the author</h4>{status('reception','Reception',reception)}
     {p.review?<>
      <Alert severity="warning" sx={{mb:2}}>From a web search. Check every quote at its link before publishing; remove what you cannot confirm.</Alert>
      <TextField label="Verdict" fullWidth multiline minRows={2} value={p.review.verdict} onChange={e=>set({review:{...p.review!,verdict:e.target.value}})} slotProps={{htmlInput:{dir:'auto'}}}/>
      <AskAi text={p.review.verdict} language={lang} onText={t=>set({review:{...p.review!,verdict:t}})} onAccount={onAccount} hasKey={hasKey}/>
      <TextField label="About the author" fullWidth multiline minRows={2} sx={{mt:1}} value={p.review.aboutAuthor||''} onChange={e=>set({review:{...p.review!,aboutAuthor:e.target.value}})} slotProps={{htmlInput:{dir:'auto'}}}/>
      <AskAi text={p.review.aboutAuthor||''} language={lang} onText={t=>set({review:{...p.review!,aboutAuthor:t}})} onAccount={onAccount} hasKey={hasKey}/>
      <div className="settings-grid" style={{marginTop:8}}>
       <TextField label="Praise (one per line)" multiline minRows={3} value={p.review.pros.join('\n')} onChange={e=>set({review:{...p.review!,pros:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,8)}})} slotProps={{htmlInput:{dir:'auto'}}}/>
       <TextField label="Criticism (one per line)" multiline minRows={3} value={p.review.cons.join('\n')} onChange={e=>set({review:{...p.review!,cons:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,8)}})} slotProps={{htmlInput:{dir:'auto'}}}/>
      </div>
      <div className="wizard-bar" style={{marginTop:8}}><small>{(p.review.critics||[]).length} critics · {p.review.quotes.length} quotes · {(p.review.readers||[]).length} readers</small><span style={{flex:1}}/><Button size="small" onClick={()=>setReviewOpen(true)}>Critics, quotes and sources…</Button></div>
      <FormControlLabel control={<Checkbox checked={p.reviewApproved} onChange={e=>set({reviewApproved:e.target.checked})}/>} label="Publish the reception with the book"/>
     </>:tasks.reception.state!=='running'&&<Button size="small" variant="outlined" disabled={!hasKey} startIcon={<AutoAwesomeRounded/>} onClick={reception}>Research the reception</Button>}
    </div>
    <div className="nb-card"><h4>Home page background</h4>{status('background','Paintings',background)}
     <RadioGroup row value={slide} onChange={e=>setSlideMode(e.target.value as typeof slide)}>
      <FormControlLabel value="art" control={<Radio size="small"/>} label="A painting"/><FormControlLabel value="cover" control={<Radio size="small"/>} label="The cover"/><FormControlLabel value="none" control={<Radio size="small"/>} label="The gallery rotation"/>
     </RadioGroup>
     {slide==='art'&&<>{art.length>0&&<div className="ap-grid nb-art">{art.map(h=><button type="button" key={h.file} className={'ap-tile'+(artPick?.file===h.file?' on':'')} aria-pressed={artPick?.file===h.file} onClick={()=>setArtPick(h)}><img src={h.thumb} alt="" loading="lazy"/><span className="ap-cap"><strong>{h.title.slice(0,70)}</strong><small>{[h.artist,h.year].filter(Boolean).join(', ').slice(0,70)}</small></span></button>)}</div>}
      <div className="wizard-bar" style={{marginTop:8}}>{artPick&&<a className="ap-credit" href={artPick.page} target="_blank" rel="noopener noreferrer">{artPick.title.slice(0,60)} <OpenInNewRounded fontSize="inherit"/></a>}<span style={{flex:1}}/><Button size="small" onClick={()=>setPicker(true)}>Search or more ideas…</Button></div>
      <RadioGroup row value={fit} onChange={e=>setFit(e.target.value as typeof fit)}><FormControlLabel value="fill" control={<Radio size="small"/>} label="Fill the frame"/><FormControlLabel value="whole" control={<Radio size="small"/>} label="Whole picture, blurred fill"/></RadioGroup>
      {!artPick&&<Alert severity="info">No painting chosen yet; without one the gallery rotation is used.</Alert>}</>}
    </div>
   </section>}

   {step===3&&source&&composed&&<section>
    {!done&&<>
     <p className="dialog-lead">Ready to publish. This is what readers will get:</p>
     <ul className="nb-check">
      <li><CheckCircleRounded fontSize="small"/>{composed.doc.chapters.length} chapters · {source.versions.map(v=>v.label+' · '+languageName(v.language)).join(', ')}</li>
      <li>{ov.some(x=>x.text.trim())?<CheckCircleRounded fontSize="small"/>:<RemoveCircleOutlineRounded fontSize="small"/>}{ov.some(x=>x.text.trim())?'Overview':'No overview'}</li>
      <li>{cover?<CheckCircleRounded fontSize="small"/>:<RemoveCircleOutlineRounded fontSize="small"/>}{cover?'Cover':'No cover (a lettered one is shown)'}</li>
      <li>{p.review&&p.reviewApproved?<CheckCircleRounded fontSize="small"/>:<RemoveCircleOutlineRounded fontSize="small"/>}{p.review&&p.reviewApproved?'Reception':'No reception'}</li>
      <li><CheckCircleRounded fontSize="small"/>{slide==='art'&&artPick?'Background: '+artPick.title.slice(0,60):slide==='cover'?'Background: the cover':'Background: the gallery rotation'}</li>
      <li><CheckCircleRounded fontSize="small"/>{langs.some(l=>voiceFor(l)!=='none')?'Audio: '+langs.filter(l=>voiceFor(l)!=='none').map(l=>languageName(l)+' ('+(voiceFor(l)==='elevenlabs'?'ElevenLabs':'offline voice')+')').join(', '):'No audio'}</li>
      {composed.figures.length>0&&<li><CheckCircleRounded fontSize="small"/>{composed.figures.length} figures (make sure you may publish them)</li>}
     </ul>
     {composed.problems.length>0&&<Alert severity="warning" sx={{mt:2}}>Before publishing: {composed.problems.join(' ')}</Alert>}
     <h4 className="pub-h">Who can find it?</h4>
     <RadioGroup value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)}><FormControlLabel value="public" control={<Radio/>} label="Listed in the library, open to everyone"/><FormControlLabel value="unlisted" control={<Radio/>} label="Not listed; only people with the link"/></RadioGroup>
    </>}
    {progress.length>0&&<ul className="nb-check nb-progress">{progress.map((x,i)=><li key={i}>{x.ok===null?<CircularProgress size={14}/>:x.ok?<CheckCircleRounded fontSize="small"/>:<ErrorOutlineRounded fontSize="small" color="warning"/>}{x.text}</li>)}</ul>}
    {done&&<Alert severity="success" sx={{mt:2}}>Published. Change anything later in the book editor; to swap chapter summaries, use “Replace from a ZIP” there.
     <div className="wizard-bar" style={{marginTop:8}}><Button size="small" variant="contained" onClick={()=>onOpen(done.slug)}>Open the book</Button><Button size="small" onClick={()=>onEdit(done.id)}>Book editor</Button><Button size="small" startIcon={<ContentCopyRounded/>} onClick={()=>navigator.clipboard?.writeText(location.origin+location.pathname+'#/b/'+done.slug)}>Copy link</Button></div></Alert>}
   </section>}
   {error&&<Alert severity="error" sx={{mt:2}} onClose={()=>setError('')}>{error}</Alert>}
  </DialogContent>
  <DialogActions sx={{px:3,pb:2}}>
   <Button onClick={close} disabled={busyClose}>{done?'Close':'Cancel'}</Button><span style={{flex:1}}/>
   {step>0&&!done&&<Button disabled={publishing} onClick={()=>setStep(step-1)}>Back</Button>}
   {step<3?<Button variant="contained" disabled={!canNext} onClick={next}>{step===0?'Next: chapters':step===1?'Next: the proposal':'Next: publish'}</Button>
    :!done&&<Button variant="contained" disabled={publishing||!!composed?.problems.length} onClick={publish} startIcon={publishing?<CircularProgress size={16} color="inherit"/>:undefined}>{publishing?'Publishing…':'Publish'}</Button>}
  </DialogActions>
  {picker&&<ArtPicker title={p.originalTitle||p.title} author={p.author} about={ov.map(x=>x.text).join(' ').slice(0,3800)} themes={p.review?.themes||[]} tags={p.info.categories} language={nameFor(lang)} initial={artPick} onAccount={onAccount} onClose={()=>setPicker(false)} onPick={a=>{setArtPick(a);setArt(list=>list.some(x=>x.file===a.file)?list:[a,...list]);setSlideMode('art');setPicker(false);}}/>}
  {reviewOpen&&source&&<ReviewDialog book={{...source.book,title:p.originalTitle||p.title,author:p.author||'Author not supplied'}} year={p.info.year} initial={p.review?{review:p.review,approved:p.reviewApproved}:null} language={lang} onClose={()=>setReviewOpen(false)} onAccount={onAccount} onSave={async v=>{set({review:v.review,reviewApproved:v.approved});mark('reception','done','Edited');setReviewOpen(false);}}/>}
 </Dialog>;
}

// "Ask AI to change": the editor says what, the AI rewrites only this text, and the result replaces it (one Undo away).
function AskAi({text,language,onText,onAccount,hasKey,extra}:{text:string;language:string;onText:(t:string)=>void;onAccount:()=>void;hasKey:boolean;extra?:ReactNode}){
 const[open,setOpen]=useState(false),[ask,setAsk]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[undo,setUndo]=useState<string|null>(null);
 async function run(action:'polish'|'revise'){
  setBusy(true);setError('');
  try{const r=await editorialAssist({action,source:text,language,...(action==='revise'?{instruction:ask}:{})});setUndo(text);onText(r.text);setOpen(false);setAsk('');}
  catch(e){setError(reason(e));if(e instanceof ApiError&&e.status===412)onAccount();}finally{setBusy(false);}
 }
 return <div className="nb-ask">
  <div className="editor-row-actions">
   <Button size="small" startIcon={busy?<CircularProgress size={14}/>:<AutoAwesomeRounded/>} disabled={busy||!text.trim()||!hasKey} onClick={()=>setOpen(o=>!o)}>Ask AI</Button>
   <Button size="small" disabled={busy||!text.trim()||!hasKey} onClick={()=>run('polish')}>Polish</Button>
   {undo!==null&&<Button size="small" onClick={()=>{onText(undo);setUndo(null);}}>Undo</Button>}{extra}
  </div>
  {open&&<form className="nb-ask-form" onSubmit={e=>{e.preventDefault();if(ask.trim())void run('revise');}}><TextField size="small" fullWidth autoFocus label="What should change?" placeholder="Shorter, warmer, for a general reader, mention the method…" value={ask} onChange={e=>setAsk(e.target.value)} slotProps={{htmlInput:{maxLength:600,dir:'auto'}}}/><Button type="submit" variant="contained" size="small" disabled={busy||!ask.trim()}>Rewrite</Button></form>}
  {error&&<small className="nb-ask-error" role="alert">{error}</small>}
 </div>;
}
