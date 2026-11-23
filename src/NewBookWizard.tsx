import{useEffect,useMemo,useRef,useState,type ReactNode}from'react';
import{Accordion,AccordionDetails,AccordionSummary,Alert,Button,ButtonBase,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,LinearProgress,MenuItem,Radio,RadioGroup,TextField,useMediaQuery}from'@mui/material';
import{AutoAwesomeRounded,CheckCircleRounded,CloseRounded,ContentCopyRounded,ErrorOutlineRounded,ExpandMoreRounded,FolderZipOutlined,MenuBookRounded,OpenInNewRounded,RemoveCircleOutlineRounded}from'@mui/icons-material';
import ArtPicker from'./ArtPicker';
import ReviewDialog from'./ReviewDialog';
import type{ArtResult,PubBook,PubPara}from'./types';
import{ApiError,artIdeas,bookInfo,coverImage,editorialAssist,identifyBook,libraryBook,publishBook,researchReview,setSlide,setVisibility as setBookVisibility,startNarration,uploadCover,uploadFigure}from'./api';
import{coverBlob,figureBlob}from'./publish';
import{languages}from'./core';
import{readSummaryFiles}from'./summary-import';
import{parseSummaries}from'./replace-import';
import{compose,defaultChapters,hasOverview,identifyText,leadLanguage,overviewSource,sourceFromZip,type ChapterChoice,type Proposal,type Source}from'./new-book';
import{applyChapterEdits,chapterEditKey,withChapterParagraphs,type SavedWizardState,type WizardVoice}from'./wizard-state';
import{createWizardDraft,deleteDraftCover,deleteWizardDraft,getDraftCover,getDraftSource,getWizardDraft,listWizardDrafts,putDraftCover,putDraftSource,saveWizardDraft,type WizardDraftMeta}from'./wizard-drafts';
import type{SummaryParagraph}from'./types';

// Adding a book, start to finish: the summary ZIP (or the summaries brought back into a whole book), its chapters, a proposal
// AI prepares while the editor checks the chapters, then publishing. Every AI part can fail on its own without stopping the rest.
type TaskId='identify'|'details'|'reception'|'background'|'overview';
type Task={state:'idle'|'running'|'done'|'failed'|'off';message?:string};
type Voice=WizardVoice;
const VOICES=['en','fa','de','es','fr','tr','zh','ar'];
const STEPS=['Source','Chapters','Details','Review'];
const languageName=(code:string)=>languages.find(l=>l.code===code)?.label.replace(/.*· /,'').replace(/ \(.*/,'')||code;
const paragraphCount=(count:number)=>count+' paragraph'+(count===1?'':'s');
const nameFor=(code:string)=>({fa:'Persian',en:'English',de:'German',ar:'Arabic',es:'Spanish',fr:'French',tr:'Turkish',zh:'Chinese'} as Record<string,string>)[code]||'English';
const blankProposal=():Proposal=>({title:'',originalTitle:'',author:'',info:{year:'',publisher:'',pages:null,description:'',categories:[]},overviews:{},review:null,reviewApproved:false});
const freshTasks=():Record<TaskId,Task>=>({identify:{state:'idle'},details:{state:'idle'},reception:{state:'idle'},background:{state:'idle'},overview:{state:'idle'}});
// The reason, said so the editor can act on it; a missing key is not a failure of the book.
const reason=(e:unknown)=>e instanceof ApiError&&e.status===412?'Needs your Gemini key (Account).':e instanceof ApiError&&e.status===401?'Sign in again to use AI.':e instanceof Error?e.message:'Something went wrong.';

interface Props{hasKey:boolean;hasVoiceKey:boolean;initial?:Source|null;initialCover?:Blob|null;resumeDraftId?:string|null;onWholeBook:(file:File)=>void;onOtherSource:()=>void;onClose:()=>void;onPublished:(b:PubBook)=>void;onAccount:()=>void;onOpen:(slug:string)=>void;onEdit:(id:string)=>void}
export default function NewBookWizard({hasKey,hasVoiceKey,initial=null,initialCover=null,resumeDraftId=null,onWholeBook,onOtherSource,onClose,onPublished,onAccount,onOpen,onEdit}:Props){
 const phone=useMediaQuery('(max-width:699px)');
 const zipInput=useRef<HTMLInputElement>(null),bookInput=useRef<HTMLInputElement>(null),coverInput=useRef<HTMLInputElement>(null);
 const stepHeading=useRef<HTMLHeadingElement>(null),previousStep=useRef(0);
 const[step,setStep]=useState(0),[source,setSource]=useState<Source|null>(initial),[fileName,setFileName]=useState(''),[reading,setReading]=useState(false),[error,setError]=useState('');
 // a whole book: the summary names it in its own language; the file's title is then the original one
 const[p,setP]=useState<Proposal>(()=>{if(!initial)return blankProposal();const named=initial.versions[0]?.bookTitle?.trim()||initial.book.title;
  return{...blankProposal(),title:named,originalTitle:named!==initial.book.title?initial.book.title:'',author:initial.book.author==='Author not supplied'?'':initial.book.author};});
 const[chapters,setChapters]=useState<ChapterChoice[]>(()=>initial?defaultChapters(initial):[]);
 const[wants,setWants]=useState({details:true,reception:false,background:false,overview:hasKey});
 const[voices,setVoices]=useState<Record<string,Voice>>({}),[visibility,setVisibility]=useState<'public'|'unlisted'>('public');
 const[tasks,setTasks]=useState<Record<TaskId,Task>>(freshTasks);
 const[covers,setCovers]=useState<string[]>([]),[cover,setCover]=useState<{blob:Blob;url:string;from:string}|null>(null);
 const[coverChoice,setCoverChoice]=useState<'zip'|'saved'|'none'>(initial?.cover?'zip':'none');
 const[art,setArt]=useState<ArtResult[]>([]),[slide,setSlideMode]=useState<'art'|'cover'|'none'>('art'),[artPick,setArtPick]=useState<ArtResult|null>(null),[fit,setFit]=useState<'fill'|'whole'>('fill'),[picker,setPicker]=useState(false),[reviewOpen,setReviewOpen]=useState(false);
 const[editingChapter,setEditingChapter]=useState<string|null>(null),[previewMode,setPreviewMode]=useState<'phone'|'desktop'>('phone'),[previewChapter,setPreviewChapter]=useState('');
 const[chapterEdits,setChapterEdits]=useState<SavedWizardState['chapterEdits']>({});
 const[singleChapterConfirmed,setSingleChapterConfirmed]=useState(false);
 const[draftId,setDraftId]=useState<string|null>(null),[drafts,setDrafts]=useState<WizardDraftMeta[]>([]),[draftStatus,setDraftStatus]=useState(''),[restoring,setRestoring]=useState(false);
 const[stagedId,setStagedId]=useState<string|null>(null),[stagedRev,setStagedRev]=useState<string|null>(null);
 const draftIdRef=useRef<string|null>(null),revisionRef=useRef<string|undefined>(undefined),saveQueue=useRef<Promise<unknown>>(Promise.resolve());
 const identityConfirmed=useRef(false);
 const identifyRun=useRef(0),detailsRun=useRef(0),overviewRun=useRef(0),receptionRun=useRef(0),backgroundRun=useRef(0);
 const invalidateAsync=()=>{identifyRun.current++;detailsRun.current++;overviewRun.current++;receptionRun.current++;backgroundRun.current++;};
 const coverRef=useRef(cover);coverRef.current=cover;
 const[progress,setProgress]=useState<{text:string;ok:boolean|null}[]>([]),[publishing,setPublishing]=useState(false),[done,setDone]=useState<PubBook|null>(null);
 const lang=source?leadLanguage(source):'fa';
 useEffect(()=>{if(previousStep.current!==step){previousStep.current=step;requestAnimationFrame(()=>stepHeading.current?.focus());}},[step]);
 const set=(patch:Partial<Proposal>)=>setP(x=>({...x,...patch}));
 const setIdentity=(patch:Partial<Pick<Proposal,'title'|'originalTitle'|'author'>>)=>{identifyRun.current++;detailsRun.current++;receptionRun.current++;backgroundRun.current++;setP(x=>({...x,...patch,review:null,reviewApproved:false}));setTasks(t=>({...t,identify:{state:'idle'},details:{state:'idle'},reception:{state:'idle'},background:{state:'idle'}}));};
 const setInfo=(patch:Partial<Proposal['info']>)=>setP(x=>({...x,info:{...x.info,...patch}}));
 const mark=(id:TaskId,state:Task['state'],message?:string)=>setTasks(t=>({...t,[id]:{state,message}}));
 const live=useRef(true);useEffect(()=>()=>{live.current=false;},[]);
 const useCover=async(blob:Blob,from:string,save=true)=>{const b=await coverBlob(blob);if(save&&draftIdRef.current)try{await putDraftCover(draftIdRef.current,b);}catch(e){setDraftStatus('Cover not saved: '+reason(e));throw e;}setCover(old=>{if(old)URL.revokeObjectURL(old.url);return{blob:b,url:URL.createObjectURL(b),from};});setCoverChoice(from==='the ZIP'?'zip':'saved');};
 const snapshot=():SavedWizardState=>({version:1,fileName,step,proposal:p,chapters,chapterEdits,wants,voices,visibility,slide,fit,artPick,coverChoice,singleChapterConfirmed,stagedId,stagedRev});
 async function persist(state:SavedWizardState){
  const id=draftIdRef.current;if(!id)return;
  setDraftStatus('Saving draft…');
  const next=saveQueue.current.catch(()=>{}).then(async()=>{
   if(draftIdRef.current!==id)return;
   const saved=await saveWizardDraft(id,state,revisionRef.current);
   if(draftIdRef.current===id){revisionRef.current=saved.revision;setDraftStatus('Draft saved');}return saved;
  });
  saveQueue.current=next;await next;
 }
 useEffect(()=>{
  if(initial)return;
  void listWizardDrafts().then(r=>setDrafts(r.drafts)).catch(e=>{if(!(e instanceof ApiError&&[401,403].includes(e.status)))setDraftStatus('Drafts unavailable: '+reason(e));});
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  if(!draftId||!source||restoring||done||publishing)return;
  const timer=setTimeout(()=>{void persist(snapshot()).catch(e=>setDraftStatus('Draft not saved: '+reason(e)));},700);
  return()=>clearTimeout(timer);
 },[draftId,source,restoring,done,publishing,step,p,chapters,chapterEdits,wants,voices,visibility,slide,fit,artPick,coverChoice,singleChapterConfirmed,stagedId,stagedRev]);// eslint-disable-line react-hooks/exhaustive-deps
 async function resume(id:string){
  invalidateAsync();setTasks(freshTasks());setRestoring(true);setError('');
  try{
   const saved=await getWizardDraft<SavedWizardState>(id);
   if(!saved.hasSource)throw Error('This draft has no saved summary ZIP. Remove it or start with another file.');
   const blob=await getDraftSource(id),name=saved.state.fileName||'summary.zip';
   const file=new File([blob],name,{type:blob.type});
   const result=await readSummaryFiles(file),found=parseSummaries(result.documents);
   const fresh=sourceFromZip(found,result.images,result.documents[0].name);
   const state=saved.state;
   setSource(applyChapterEdits(fresh,state.chapterEdits||{}));setFileName(name);
   setP(state.proposal);setChapters(state.chapters);setChapterEdits(state.chapterEdits||{});
   setWants(state.wants);setVoices(state.voices);setVisibility(state.visibility);
   setSlideMode(state.slide);setFit(state.fit);setArtPick(state.artPick);setSingleChapterConfirmed(Boolean(state.singleChapterConfirmed));setStagedId(state.stagedId||null);setStagedRev(state.stagedRev||null);
   setStep(Math.max(0,Math.min(3,state.step)));identityConfirmed.current=state.step>0;
   if(state.coverChoice==='none')setCover(null);
   else if(saved.hasCover)await useCover(await getDraftCover(id),'saved draft',false);
   else if(fresh.cover)await useCover(new Blob([fresh.cover.data],{type:fresh.cover.type}),'the ZIP',false);
   setCoverChoice(state.coverChoice||'none');
   draftIdRef.current=id;revisionRef.current=saved.revision;setDraftId(id);setDraftStatus('Draft restored');
  }catch(e){setError('Could not open draft: '+reason(e));}finally{setRestoring(false);}
 }
 useEffect(()=>{if(resumeDraftId)void resume(resumeDraftId);},[]);// eslint-disable-line react-hooks/exhaustive-deps
 async function removeDraft(id:string){
  if(!confirm('Delete this unfinished book draft?'))return;
  try{await deleteWizardDraft(id);setDrafts(d=>d.filter(x=>x.id!==id));}catch(e){setError('Could not delete draft: '+reason(e));}
 }
 async function chooseAnother(){
  if(draftIdRef.current)try{await persist(snapshot());}catch(e){setError('Save this draft before choosing another file: '+reason(e));return;}
  invalidateAsync();setTasks(freshTasks());
  draftIdRef.current=null;revisionRef.current=undefined;setDraftId(null);setSource(null);setFileName('');setCover(old=>{if(old)URL.revokeObjectURL(old.url);return null;});setCovers([]);setSingleChapterConfirmed(false);setDraftStatus('');
 }
 useEffect(()=>{
  if(initialCover)void useCover(initialCover,'the book file').catch(()=>{});else if(initial?.cover)void useCover(new Blob([initial.cover.data],{type:initial.cover.type}),'the ZIP').catch(()=>{});
  if(initial)void identify(initial,initial.book.title);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps

 // ---- the AI tasks. Each one fills only what the editor has not typed, and says why when it cannot.
 async function details(title:string,author:string){
  if(!title.trim())return;const run=++detailsRun.current;mark('details','running');
  try{const info=await bookInfo(title,author);if(!live.current||run!==detailsRun.current)return;
   setP(x=>({...x,author:x.author||info.authors.join(' and '),info:{year:x.info.year||info.year||'',publisher:x.info.publisher||info.publisher||'',pages:x.info.pages??info.pages,description:x.info.description||info.description||'',categories:x.info.categories.length?x.info.categories:info.categories.slice(0,8)}}));
   setCovers(info.covers.slice(0,8));
   if(info.covers[0]&&!coverRef.current)void coverImage(info.covers[0]).then(b=>{if(run!==detailsRun.current||coverRef.current)return;return useCover(b,'an online catalogue');}).catch(()=>{});
   mark('details','done',info.covers.length?info.covers.length+' covers found':'No cover found online; upload one if you have it.');
  }catch(e){if(run===detailsRun.current)mark('details','failed',reason(e));}
 }
 async function identify(s:Source,title:string){
  if(!hasKey){mark('identify','off','Add your Gemini key in Account to fill these in automatically.');await details(title,'');return;}
  const run=++identifyRun.current;mark('identify','running');
  try{const r=await identifyBook({title,text:identifyText(s)});if(!live.current||run!==identifyRun.current||identityConfirmed.current)return;
   setP(x=>({...x,originalTitle:x.originalTitle||r.original_title,author:x.author||r.author,info:{...x.info,year:x.info.year||r.year}}));
   mark('identify','done',r.original_title?'Identified as “'+r.original_title+'”'+(r.author?' by '+r.author:''):'The AI could not tell which book this is. Type the original title.');
   await details(r.original_title||title,r.author);
  }catch(e){if(run===identifyRun.current){mark('identify','failed',reason(e));await details(title,'');}}
 }
 async function reception(){
  const run=++receptionRun.current;mark('reception','running');
  try{const r=await researchReview({title:p.originalTitle||p.title,author:p.author,year:p.info.year,language:lang});if(!live.current||run!==receptionRun.current)return;setP(x=>x.review?x:{...x,review:r,reviewApproved:false});mark('reception','done',(r.critics?.length||0)+' critics, '+r.quotes.length+' quotes, '+r.sources.length+' sources');}
  catch(e){if(run===receptionRun.current)mark('reception','failed',reason(e));}
 }
 async function background(){
  const run=++backgroundRun.current;mark('background','running');
  try{const about=(p.overviews[0]||source?.versions[0]?.report.overview?.paragraphs||[]).map(x=>x.text).join(' ').slice(0,3800);
   const r=await artIdeas({title:p.originalTitle||p.title,author:p.author,about,themes:[...(p.review?.themes||[]),...p.info.categories].slice(0,12),language:nameFor(lang)});if(!live.current||run!==backgroundRun.current)return;
   const all=r.ideas.flatMap(i=>i.results.slice(0,2));setArt(all);setArtPick(old=>old||all[0]||null);
   mark('background','done',all.length?all.length+' paintings to choose from':'No public-domain painting matched. Search for one or use the cover.');
  }catch(e){if(run===backgroundRun.current)mark('background','failed',reason(e));}
 }
 async function overview(){
  if(!source)return;const run=++overviewRun.current;mark('overview','running');
  try{const r=await editorialAssist({action:'overview',source:overviewSource(source,chapters),language:lang});if(!live.current||run!==overviewRun.current)return;setP(x=>x.overviews[0]?.some(y=>y.text.trim())?x:{...x,overviews:{...x.overviews,0:[{text:r.text}]}});mark('overview','done','Drafted from the chapter summaries');}
  catch(e){if(run===overviewRun.current)mark('overview','failed',reason(e));}
 }
 // Leaving the first step starts everything that takes a while, so it is ready by the time the chapters are checked.
 function startProposal(){
  if(!source)return;
  if(wants.reception&&lang==='fa'&&!p.originalTitle.trim())mark('reception','off','Add the original title to research reviews accurately.');
  else if(wants.reception&&tasks.reception.state==='idle')void reception();else if(!wants.reception)mark('reception','off');
  if(wants.background&&tasks.background.state==='idle')void background();else if(!wants.background)mark('background','off');
 }
 async function read(file:File){
  invalidateAsync();setError('');setReading(true);
  try{const r=await readSummaryFiles(file);const found=parseSummaries(r.documents),s=sourceFromZip(found,r.images,r.documents[0].name);
   draftIdRef.current=null;revisionRef.current=undefined;setDraftId(null);identityConfirmed.current=false;
   setSource(s);setFileName(file.name);setStep(0);setChapterEdits({});setSingleChapterConfirmed(false);setStagedId(null);setStagedRev(null);
   const selected=defaultChapters(s),title=s.book.title,proposal={...blankProposal(),title};
   setChapters(selected);setP(proposal);setTasks(freshTasks());
   setCover(old=>{if(old)URL.revokeObjectURL(old.url);return null;});setCoverChoice(s.cover?'zip':'none');
   if(s.cover)void useCover(new Blob([s.cover.data],{type:s.cover.type}),'the ZIP',false).catch(()=>{});
   let createdId:string|null=null;
   try{
    setDraftStatus('Saving source…');
    const state:SavedWizardState={version:1,fileName:file.name,step:0,proposal,chapters:selected,chapterEdits:{},wants,voices,visibility,slide,fit,artPick:null,coverChoice:s.cover?'zip':'none',singleChapterConfirmed:false,stagedId:null,stagedRev:null};
    const created=await createWizardDraft(state);
    createdId=created.id;
    const upload=new File([file],file.name,{type:/\.zip$/i.test(file.name)?'application/zip':'text/markdown'});
    await putDraftSource(created.id,upload);
    draftIdRef.current=created.id;revisionRef.current=created.revision;setDraftId(created.id);setDraftStatus('Draft saved');
    setDrafts(d=>[{id:created.id,title,updated:created.updated,hasSource:true,hasCover:false},...d]);
   }catch(e){if(createdId)void deleteWizardDraft(createdId).catch(()=>{});setDraftStatus('Draft not saved: '+reason(e));}
   void identify(s,title);
  }catch(e){setError(e instanceof Error?e.message:'That file could not be read.');}finally{setReading(false);}
 }
 const composed=useMemo(()=>source?compose(source,chapters,p):null,[source,chapters,p]);
 const voiceFor=(l:string):Voice=>voices[l]??'none';
 const langs=source?[...new Set(source.versions.map(v=>v.language))]:[];
 const warnings=[...new Set([...(source?.book.warnings||[]),...(composed?.warnings||[])])];
 const editChapter=(versionId:string,chapterId:string,paragraphs:SummaryParagraph[])=>{
  overviewRun.current++;
  setTasks(t=>({...t,overview:t.overview.state==='idle'?t.overview:{state:'off',message:'Chapter text changed. Review or redraft the overview.'}}));
  setChapterEdits(x=>({...x,[chapterEditKey(versionId,chapterId)]:paragraphs}));
  setSource(x=>x?withChapterParagraphs(x,versionId,chapterId,paragraphs):x);
 };

 async function publish(){
  if(!composed||!source)return;
  if(composed.problems.length){setError(composed.problems.join(' '));return;}
  if(source.book.chapters.length===1&&!singleChapterConfirmed){setError('Check the source outline and confirm that this one-chapter summary is complete.');return;}
  setPublishing(true);setError('');const lines:{text:string;ok:boolean|null}[]=[];
  const say=(text:string,ok:boolean|null)=>{lines.push({text,ok});setProgress([...lines]);};
  const fix=(i:number,text:string,ok:boolean)=>{lines[i]={text,ok};setProgress([...lines]);};
  try{
   say(stagedId?'Updating the staged book…':'Staging the book as unlisted…',null);
   const result=await publishBook({...(stagedId?{id:stagedId,...(stagedRev?{base:stagedRev}:{})}:{}),doc:composed.doc,visibility:'unlisted'});fix(0,'Text staged: '+composed.doc.chapters.length+' chapters',true);
   setStagedId(result.id);setStagedRev(result.rev||null);
   if(draftIdRef.current)try{await persist({...snapshot(),stagedId:result.id,stagedRev:result.rev||null});}catch(e){setError('The book is staged as unlisted, but its draft could not be saved: '+reason(e));return;}
   let mediaFailed=false;
   if(cover){const i=lines.length;say('Uploading the cover…',null);await uploadCover(result.id,cover.blob).then(()=>fix(i,'Cover uploaded',true)).catch(e=>{mediaFailed=true;fix(i,'Cover upload failed: '+reason(e),false);});}
   if(composed.figures.length){const i=lines.length;let failed=0;say('Uploading '+composed.figures.length+' figures…',null);for(const f of composed.figures)await uploadFigure(result.id,f.name,await figureBlob(f.image)).catch(()=>{failed++;});if(failed)mediaFailed=true;fix(i,failed?failed+' of '+composed.figures.length+' figures failed to upload.':'Figures uploaded',!failed);}
   if(slide==='cover'||(slide==='art'&&artPick)){const i=lines.length;say('Setting the home page background…',null);
    const caption=slide==='art'&&artPick?{text:[artPick.title,artPick.artist,artPick.year].filter(Boolean).join(', ').slice(0,200),url:artPick.page}:undefined;
    await setSlide(result.id,slide,slide==='art'?artPick!.file:undefined,fit,caption).then(()=>fix(i,'Home page background set',true)).catch(e=>{mediaFailed=true;fix(i,'Background failed: '+reason(e),false);});}
   if(mediaFailed){setError('The book is staged as unlisted. Fix the failed uploads, then choose Retry publishing. No duplicate book will be created.');return;}
   let published=await libraryBook(result.id);
   if(visibility==='public'){const i=lines.length;say('Adding the finished book to the library…',null);published=await setBookVisibility(result.id,'public');fix(i,'Book is public',true);}
   else fix(0,'Book is ready at its unlisted link',true);
   for(const l of langs.filter(x=>VOICES.includes(x)&&voiceFor(x)!=='none')){const v=composed.doc.versions.find(x=>x.language===l)!;const i=lines.length;say('Starting the '+languageName(l)+' narration…',null);
    await startNarration(result.id,l,v.type,voiceFor(l) as 'offline'|'elevenlabs').then(()=>fix(i,languageName(l)+' narration started; it is ready in a few minutes',true)).catch(e=>fix(i,'The '+languageName(l)+' narration could not start: '+reason(e)+' Start it later from the book’s Audio tab.',false));}
   if(draftIdRef.current)await deleteWizardDraft(draftIdRef.current).catch(e=>setDraftStatus('Book published, but draft cleanup failed: '+reason(e)));
   setDone(published);onPublished(published);
  }catch(e){if(!lines.length||lines[0].ok===null){setProgress([]);setError('Nothing was published. '+reason(e));}else setError(reason(e));}
  finally{setPublishing(false);}
 }
 const busyClose=publishing||reading;
 async function close(){if(busyClose)return;if(draftIdRef.current&&source&&!done){try{await persist(snapshot());}catch(e){setError('Draft could not be saved: '+reason(e));return;}}else if(source&&!done&&!confirm('Close without saving? This book has no saved draft.'))return;onClose();}
 const canNext=step===0?!!source&&!!p.title.trim():step===1?chapters.some(c=>c.include):true;
 function next(){if(step===0){identityConfirmed.current=true;startProposal();}if(step===1&&source){if(!hasOverview(source)){if(wants.overview&&tasks.overview.state==='idle')void overview();else if(!wants.overview)mark('overview','off');}else mark('overview','off','The ZIP has its own overview.');}setStep(step+1);setError('');}

 const status=(id:TaskId,label:string,run?:()=>void)=>{const t=tasks[id];if(t.state==='idle'||t.state==='running'||(t.state==='off'&&!t.message))return null;return <div className={'nb-task nb-'+t.state} role={t.state==='failed'?'alert':undefined}>
  <span className="nb-task-copy"><strong>{label}</strong>{t.message?' · '+t.message:''}</span>
  {t.state==='failed'&&/Gemini key|Sign in/.test(t.message||'')&&<Button size="small" onClick={onAccount}>Account</Button>}
  {run&&(t.state==='failed'||t.state==='done'||t.state==='off')&&<Button size="small" onClick={run} disabled={!hasKey&&id!=='details'}>{t.state==='done'?'Again':'Try'}</Button>}</div>;};
 const ov=p.overviews[0]||source?.versions[0]?.report.overview?.paragraphs.map(x=>({text:x.text}))||[];
 const setOv=(next:PubPara[])=>set({overviews:{...p.overviews,0:next}});
 const dir=lang==='fa'||lang==='ar'?'rtl':'ltr';
 const previewBookChapter=composed?.doc.chapters.find(c=>c.id===previewChapter)||composed?.doc.chapters[0];
 const activeTasks=(['identify','details','reception','background','overview'] as TaskId[]).filter(id=>tasks[id].state==='running');
 const taskNames:Record<TaskId,string>={identify:'book identity',details:'book details and covers',reception:'reviews',background:'paintings',overview:'overview'};
 const activity=reading?'Reading the summary file…':publishing?'Publishing the book…':activeTasks.length?'Looking up '+activeTasks.map(id=>taskNames[id]).join(', ')+'…':'';

 return <Dialog open onClose={close} fullScreen={phone} fullWidth maxWidth="md" scroll="paper" aria-labelledby="nb-title">
  <DialogTitle id="nb-title" className="dialog-heading nb-dialog-title"><span>{done?'Published':'Add a book'}{p.title&&<> · <em dir="auto">{p.title.split(':')[0]}</em></>}</span>{draftStatus&&<small className="nb-save-state">{draftStatus}</small>}<IconButton aria-label="Close" disabled={busyClose} onClick={close}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent className="wizard nb">
   <nav className="nb-step-nav" aria-label="Add a book steps"><ol>{STEPS.map((label,i)=><li key={label}><button type="button" aria-current={i===step?'step':undefined} disabled={publishing||!!done||i>step} onClick={()=>setStep(i)}>{label}</button></li>)}</ol></nav>
   <div className="nb-step-heading"><span>Step {step+1} of {STEPS.length}</span><h2 ref={stepHeading} tabIndex={-1}>{STEPS[step]}</h2></div>
   <div className={'nb-activity'+(activity?' is-active':'')} aria-live="polite" aria-atomic="true"><span>{activity}</span>{activity&&<LinearProgress aria-label={activity}/>}</div>
   <input ref={zipInput} type="file" hidden accept=".zip,.md,.markdown" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void read(f);}}/>
   <input ref={bookInput} type="file" hidden accept=".pdf,.epub,.txt,.md,.html,.htm" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)onWholeBook(f);}}/>
   <input ref={coverInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void useCover(f,'your upload').catch(()=>setError('That image could not be read.'));}}/>

   {step===0&&!source&&<section>
    <p className="dialog-lead">Bring in your finished summary. You can check its chapters and wording before anyone sees it.</p>
    <div className="nb-choices">
     <ButtonBase className="upload-zone nb-primary-upload" disabled={reading||restoring} onClick={()=>zipInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)void read(f);}}>
      <span className="upload-icon"><FolderZipOutlined/></span><strong>{reading?'Reading the summary…':'Upload a summary ZIP or Markdown file'}</strong><span>From Claude, ChatGPT, Gemini, or your own writing. Images in a ZIP come with the book.</span><small>Choose a file or drop it here. Your draft is saved as you work.</small></ButtonBase>
    </div>
    <div className="nb-secondary"><span>Need to make a summary first?</span><Button size="small" startIcon={<MenuBookRounded/>} onClick={()=>bookInput.current?.click()}>Start from a whole book</Button><Button size="small" onClick={onOtherSource}>Use a link or pasted text</Button></div>
    {drafts.length>0&&<div className="nb-resume"><h3>Continue an unfinished book</h3>{drafts.map(d=><div className="nb-resume-row" key={d.id}><div><strong dir="auto">{d.title||'Untitled draft'}</strong><small>{d.hasSource?'Saved '+new Date(d.updated*1000).toLocaleDateString():'Source file missing'}</small></div><Button size="small" disabled={restoring||!d.hasSource} onClick={()=>void resume(d.id)}>Continue</Button><Button size="small" color="inherit" onClick={()=>void removeDraft(d.id)}>Delete</Button></div>)}</div>}
   </section>}

   {step===0&&source&&<section>
    <div className="nb-source-summary"><div><strong dir="auto">{fileName||'Summary file'}</strong><span>{source.versions.length===1?'1 summary':source.versions.length+' summaries'} · {source.versions.map(v=>languageName(v.language)).join(', ')} · {source.book.chapters.length} {source.book.chapters.length===1?'chapter':'chapters'}{source.images.length?' · '+source.images.length+' images':''}</span></div><Button size="small" onClick={()=>void chooseAnother()}>Replace file</Button></div>
    {warnings.length>0&&<div className="nb-source-warning" role="alert"><strong>Check before publishing</strong><ul>{warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></div>}
    <p className="dialog-lead">Check the title and author. For Persian summaries, the original title helps find the right cover and reviews.</p>
    <div className="settings-grid">
     <TextField label={'Title · '+languageName(lang)} value={p.title} onChange={e=>setIdentity({title:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}} required/>
     <TextField label="Original title (for covers and reviews)" value={p.originalTitle} onChange={e=>setIdentity({originalTitle:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
     <TextField label="Author" value={p.author} onChange={e=>setIdentity({author:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
     <TextField label="Year" value={p.info.year} onChange={e=>setInfo({year:e.target.value.replace(/\D/g,'').slice(0,4)})}/>
    </div>
    <div className="nb-lookup-results">{hasKey&&status('identify','Book identity')}{status('details','Catalogue details')}</div>
    <div className="wizard-bar" style={{marginTop:8}}><span style={{flex:1}}/><Button size="small" disabled={!p.title.trim()&&!p.originalTitle.trim()} onClick={()=>details(p.originalTitle||p.title,p.author)}>Look up details and covers again</Button></div>
    <Accordion className="nb-optional"><AccordionSummary expandIcon={<ExpandMoreRounded/>}>Optional AI research and audio</AccordionSummary><AccordionDetails>
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
    </AccordionDetails></Accordion>
   </section>}

   {step===1&&source&&<section>
    <p className="dialog-lead">Check what the ZIP brought in. Open a chapter to read or edit its summary before publishing.</p>
    {warnings.length>0&&<div className="nb-source-warning" role="alert"><strong>Check the source</strong><ul>{warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></div>}
    {composed?.problems.map((x,i)=><Alert key={i} severity="error" sx={{mb:1}}>{x}</Alert>)}
    <div className="wizard-bar"><strong>{chapters.filter(c=>c.include).length} of {chapters.length} {chapters.length===1?'chapter':'chapters'}</strong><Button size="small" onClick={()=>setChapters(cs=>cs.map(c=>({...c,include:true})))}>All</Button><Button size="small" onClick={()=>setChapters(cs=>cs.map(c=>({...c,include:c.group==='main'})))}>Main only</Button></div>
    <ol className="nb-chapters">{chapters.map((c,i)=>{const v=source.versions.find(x=>x.report.chapters[c.id]);const n=v?.report.chapters[c.id].paragraphs.length||0;
     const upd=(patch:Partial<ChapterChoice>)=>setChapters(cs=>cs.map((x,j)=>j===i?{...x,...patch}:x));
     return <li key={c.id} className={c.include?'':'off'}>
      <Checkbox size="small" checked={c.include} onChange={e=>upd({include:e.target.checked})} slotProps={{input:{'aria-label':'Publish chapter '+(i+1)}}}/>
      <TextField className="nb-chapter-title" size="small" fullWidth value={c.title} onChange={e=>upd({title:e.target.value})} slotProps={{htmlInput:{dir:'auto','aria-label':'Title of chapter '+(i+1)}}} helperText={v?paragraphCount(n)+(n>400?' · too long to publish: merge paragraphs':''):'No summary yet'} error={n===0||n>400}/>
      <TextField className="nb-chapter-kind" select size="small" value={c.group} onChange={e=>upd({group:e.target.value as ChapterChoice['group']})} slotProps={{htmlInput:{'aria-label':'Kind of chapter '+(i+1)}}} sx={{minWidth:120}}><MenuItem value="front">Front</MenuItem><MenuItem value="main">Chapter</MenuItem><MenuItem value="back">Back</MenuItem></TextField>
      <span className="nb-move"><IconButton size="small" aria-label={'Move chapter '+(i+1)+' up'} disabled={i===0} onClick={()=>setChapters(cs=>{const n_=[...cs];[n_[i-1],n_[i]]=[n_[i],n_[i-1]];return n_;})}>↑</IconButton><IconButton size="small" aria-label={'Move chapter '+(i+1)+' down'} disabled={i===chapters.length-1} onClick={()=>setChapters(cs=>{const n_=[...cs];[n_[i+1],n_[i]]=[n_[i],n_[i+1]];return n_;})}>↓</IconButton></span>
      <div className="nb-chapter-review">{source.versions.map(version=>{const paragraphs=version.report.chapters[c.id]?.paragraphs||[],key=chapterEditKey(version.id,c.id),editing=editingChapter===key;
       return <details key={key}><summary>{languageName(version.language)} · {version.label} · {paragraphs.length?paragraphCount(paragraphs.length):'Missing summary'}</summary>
        {editing?<div className="nb-chapter-edit" dir={version.language==='fa'?'rtl':'ltr'}>{paragraphs.map((para,j)=><div className="nb-chapter-para" key={j}><TextField label={'Paragraph '+(j+1)} multiline minRows={2} fullWidth value={para.text} onChange={e=>editChapter(version.id,c.id,paragraphs.map((x,k)=>k===j?{...x,text:e.target.value}:x))}/><Button size="small" color="inherit" onClick={()=>editChapter(version.id,c.id,paragraphs.filter((_,k)=>k!==j))}>Remove</Button></div>)}<Button size="small" onClick={()=>editChapter(version.id,c.id,[...paragraphs,{text:'',evidence_ids:[]}])}>Add paragraph</Button><Button size="small" onClick={()=>setEditingChapter(null)}>Done editing</Button></div>
        :<><div className="nb-excerpt" dir={version.language==='fa'?'rtl':'ltr'}>{paragraphs.length?paragraphs.slice(0,2).map((para,j)=><p key={j}>{para.text}</p>):<p>This version has no text for this chapter.</p>}</div><Button size="small" onClick={()=>setEditingChapter(key)}>Edit this summary</Button></>}
       </details>;})}</div>
     </li>;})}</ol>
    <div className="nb-tasks">{status('reception','Reception')}{status('background','Background painting')}{status('overview','Overview')}</div>
   </section>}

   {step===2&&source&&<section>
    <p className="dialog-lead">The proposal. Change anything; “Ask AI” rewrites a part the way you say. Parts AI could not prepare say why and can be tried again.</p>
    <div className="nb-card"><h4>Book</h4>
     <div className="settings-grid">
      <TextField label={'Title · '+languageName(lang)} value={p.title} onChange={e=>setIdentity({title:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
      <TextField label="Original title" value={p.originalTitle} onChange={e=>setIdentity({originalTitle:e.target.value})} slotProps={{htmlInput:{dir:'auto'}}}/>
      <TextField label="Author" value={p.author} onChange={e=>setIdentity({author:e.target.value})}/>
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
      <div className="zip-cover-actions"><Button size="small" variant="outlined" onClick={()=>coverInput.current?.click()}>Upload an image</Button>{cover&&<Button size="small" onClick={()=>{setCover(null);setCoverChoice('none');if(draftIdRef.current)void deleteDraftCover(draftIdRef.current).catch(e=>setDraftStatus('Cover not removed from draft: '+reason(e)));}}>No cover</Button>}</div></div></div>
     {covers.length>0&&<div className="zip-choices">{covers.map(u=><button key={u} type="button" aria-label="Use this cover" onClick={async()=>{try{await useCover(await coverImage(u),'an online catalogue');}catch{setError('That cover could not be downloaded. Pick another.');}}}><img src={u} alt="" loading="lazy"/></button>)}</div>}
    </div>
    <div className="nb-card"><h4>Overview</h4>{status('overview','Overview',overview)}
     {!ov.some(x=>x.text.trim())&&<Alert severity="info" sx={{mb:1}}>This book has no overview yet. Write one below or draft it from the chapter summaries. <Button size="small" disabled={!hasKey||tasks.overview.state==='running'} onClick={overview}>Draft overview</Button></Alert>}
     {ov.map((x,i)=><div key={i} className="nb-para"><TextField fullWidth multiline minRows={3} value={x.text} onChange={e=>setOv(ov.map((y,j)=>j===i?{...y,text:e.target.value}:y))} slotProps={{htmlInput:{dir,'aria-label':'Overview paragraph '+(i+1)}}}/>
      <AskAi text={x.text} language={lang} onText={t=>setOv(ov.map((y,j)=>j===i?{...y,text:t}:y))} onAccount={onAccount} hasKey={hasKey} extra={<Button size="small" color="inherit" onClick={()=>setOv(ov.filter((_,j)=>j!==i))}>Remove</Button>}/></div>)}
     <Button size="small" onClick={()=>setOv([...ov,{text:''}])}>Add a paragraph</Button>
    </div>
    <Accordion className="nb-optional"><AccordionSummary expandIcon={<ExpandMoreRounded/>}>Reception and the author {p.review&&<small> · research available</small>}</AccordionSummary><AccordionDetails><div className="nb-card">{status('reception','Reception',()=>{if(lang==='fa'&&!p.originalTitle.trim())setError('Enter the original book title before researching reviews.');else void reception();})}
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
     </>:tasks.reception.state!=='running'&&<><Button size="small" variant="outlined" disabled={!hasKey||(lang==='fa'&&!p.originalTitle.trim())} startIcon={<AutoAwesomeRounded/>} onClick={reception}>Research the reception</Button>{lang==='fa'&&!p.originalTitle.trim()&&<p className="settings-help">Add the original title above so searches reach the right book.</p>}</>}
    </div></AccordionDetails></Accordion>
    <Accordion className="nb-optional"><AccordionSummary expandIcon={<ExpandMoreRounded/>}>Home page background</AccordionSummary><AccordionDetails><div className="nb-card">{status('background','Paintings',background)}
     <RadioGroup row value={slide} onChange={e=>setSlideMode(e.target.value as typeof slide)}>
      <FormControlLabel value="art" control={<Radio size="small"/>} label="A painting"/><FormControlLabel value="cover" control={<Radio size="small"/>} label="The cover"/><FormControlLabel value="none" control={<Radio size="small"/>} label="The gallery rotation"/>
     </RadioGroup>
     {slide==='art'&&<>{art.length>0&&<div className="ap-grid nb-art">{art.map(h=><button type="button" key={h.file} className={'ap-tile'+(artPick?.file===h.file?' on':'')} aria-pressed={artPick?.file===h.file} onClick={()=>setArtPick(h)}><img src={h.thumb} alt="" loading="lazy"/><span className="ap-cap"><strong>{h.title.slice(0,70)}</strong><small>{[h.artist,h.year].filter(Boolean).join(', ').slice(0,70)}</small></span></button>)}</div>}
      <div className="wizard-bar" style={{marginTop:8}}>{artPick&&<a className="ap-credit" href={artPick.page} target="_blank" rel="noopener noreferrer">{artPick.title.slice(0,60)} <OpenInNewRounded fontSize="inherit"/></a>}<span style={{flex:1}}/><Button size="small" onClick={()=>setPicker(true)}>Search or more ideas…</Button></div>
      <RadioGroup row value={fit} onChange={e=>setFit(e.target.value as typeof fit)}><FormControlLabel value="fill" control={<Radio size="small"/>} label="Fill the frame"/><FormControlLabel value="whole" control={<Radio size="small"/>} label="Whole picture, blurred fill"/></RadioGroup>
      {!artPick&&<Alert severity="info">No painting chosen yet; without one the gallery rotation is used.</Alert>}</>}
    </div></AccordionDetails></Accordion>
   </section>}

   {step===3&&source&&composed&&<section>
    {!done&&<>
     <p className="dialog-lead">Review the book as a reader will see it. Fix any blockers before publishing.</p>
     {composed.problems.length>0&&<Alert severity="error" sx={{mb:2}}><strong>Needs attention</strong><ul>{composed.problems.map((problem,i)=><li key={i}>{problem}</li>)}</ul></Alert>}
     {warnings.length>0&&<Alert severity="warning" sx={{mb:2}}><strong>Please check</strong><ul>{warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></Alert>}
     {source.book.chapters.length===1&&<FormControlLabel control={<Checkbox checked={singleChapterConfirmed} onChange={e=>setSingleChapterConfirmed(e.target.checked)}/>} label="I checked the source outline; this one-chapter summary is complete."/>}
     <div className="nb-preview-head"><h4>Reader preview</h4><div><Button size="small" variant={previewMode==='phone'?'contained':'text'} onClick={()=>setPreviewMode('phone')}>Phone</Button><Button size="small" variant={previewMode==='desktop'?'contained':'text'} onClick={()=>setPreviewMode('desktop')}>Desktop</Button></div></div>
     <TextField select size="small" label="Preview chapter" value={previewBookChapter?.id||''} onChange={e=>setPreviewChapter(e.target.value)} sx={{mb:1,minWidth:220}}>{composed.doc.chapters.map((chapter,i)=><MenuItem key={chapter.id} value={chapter.id}>{i+1}. {chapter.title[lang]||Object.values(chapter.title)[0]}</MenuItem>)}</TextField>
     <div className={'nb-reader-preview '+previewMode} dir={lang==='fa'?'rtl':'ltr'}><header>{cover&&<img src={cover.url} alt="Book cover"/>}<small>Osareh · {languageName(lang)}</small><strong>{p.title}</strong><span>{p.author}</span></header><article>{composed.doc.versions[0]?.overview?.paragraphs.map((para,i)=><p key={'o'+i}>{para.text}</p>)}{!composed.doc.versions[0]?.overview?.paragraphs.length&&p.info.description&&<p>{p.info.description}</p>}<h3>{previewBookChapter?.title[lang]||Object.values(previewBookChapter?.title||{})[0]}</h3>{previewBookChapter&&composed.doc.versions[0]?.chapters[previewBookChapter.id]?.paragraphs.map((para,i)=><p key={'c'+i}>{para.text}</p>)}</article></div>
     <h4 className="pub-h">Publication details</h4>
     <ul className="nb-check">
      <li><CheckCircleRounded fontSize="small"/>{composed.doc.chapters.length} {composed.doc.chapters.length===1?'chapter':'chapters'} · {source.versions.map(v=>v.label+' · '+languageName(v.language)).join(', ')}</li>
      <li>{ov.some(x=>x.text.trim())?<CheckCircleRounded fontSize="small"/>:<RemoveCircleOutlineRounded fontSize="small"/>}{ov.some(x=>x.text.trim())?'Overview':'No overview'}</li>
      <li>{cover?<CheckCircleRounded fontSize="small"/>:<RemoveCircleOutlineRounded fontSize="small"/>}{cover?'Cover':'No cover (a lettered one is shown)'}</li>
      <li>{p.review&&p.reviewApproved?<CheckCircleRounded fontSize="small"/>:<RemoveCircleOutlineRounded fontSize="small"/>}{p.review&&p.reviewApproved?'Reception':'No reception'}</li>
      <li><CheckCircleRounded fontSize="small"/>{slide==='art'&&artPick?'Background: '+artPick.title.slice(0,60):slide==='cover'?'Background: the cover':'Background: the gallery rotation'}</li>
      <li><CheckCircleRounded fontSize="small"/>{langs.some(l=>voiceFor(l)!=='none')?'Audio: '+langs.filter(l=>voiceFor(l)!=='none').map(l=>languageName(l)+' ('+(voiceFor(l)==='elevenlabs'?'ElevenLabs':'offline voice')+')').join(', '):'No audio'}</li>
      {composed.figures.length>0&&<li><CheckCircleRounded fontSize="small"/>{composed.figures.length} figures (make sure you may publish them)</li>}
     </ul>
     <h4 className="pub-h">Who can find it?</h4>
     <RadioGroup value={visibility} onChange={e=>setVisibility(e.target.value as typeof visibility)}><FormControlLabel value="public" control={<Radio/>} label="Listed in the library, open to everyone"/><FormControlLabel value="unlisted" control={<Radio/>} label="Not listed; only people with the link"/></RadioGroup>
    </>}
    {progress.length>0&&<ul className="nb-check nb-progress">{progress.map((x,i)=><li key={i}>{x.ok===null?<span className="nb-progress-word">In progress</span>:x.ok?<CheckCircleRounded fontSize="small"/>:<ErrorOutlineRounded fontSize="small" color="warning"/>}{x.text}</li>)}</ul>}
    {done&&<Alert severity="success" sx={{mt:2}}>Published. Change anything later in the book editor; to swap chapter summaries, use “Replace from a ZIP” there.
     <div className="wizard-bar" style={{marginTop:8}}><Button size="small" variant="contained" onClick={()=>onOpen(done.slug)}>Open the book</Button><Button size="small" onClick={()=>onEdit(done.id)}>Book editor</Button><Button size="small" startIcon={<ContentCopyRounded/>} onClick={()=>navigator.clipboard?.writeText(location.origin+'/b/'+done.slug)}>Copy link</Button></div></Alert>}
   </section>}
   {error&&<Alert severity="error" sx={{mt:2}} onClose={()=>setError('')}>{error}</Alert>}
  </DialogContent>
  <DialogActions className="nb-actions" sx={{px:3,pb:2}}>
   <Button onClick={close} disabled={busyClose}>{done?'Close':draftId?(phone?'Save':'Save & close'):'Cancel'}</Button><span style={{flex:1}}/>
   {step>0&&!done&&<Button disabled={publishing} onClick={()=>setStep(step-1)}>Back</Button>}
   {step<3?<Button variant="contained" disabled={!canNext||restoring} onClick={next}>{phone?(step===0?'Next: Chapters':step===1?'Next: Details':'Review book'):step===0?'Continue to chapters':step===1?'Continue to details':'Review book'}</Button>
    :!done&&<Button variant="contained" disabled={publishing||!!composed?.problems.length||(source?.book.chapters.length===1&&!singleChapterConfirmed)} onClick={publish}>{publishing?'Publishing…':stagedId?'Retry publishing':'Publish book'}</Button>}
  </DialogActions>
  {picker&&<ArtPicker title={p.originalTitle||p.title} author={p.author} about={ov.map(x=>x.text).join(' ').slice(0,3800)} themes={p.review?.themes||[]} tags={p.info.categories} language={nameFor(lang)} initial={artPick} onAccount={onAccount} onClose={()=>setPicker(false)} onPick={a=>{setArtPick(a);setArt(list=>list.some(x=>x.file===a.file)?list:[a,...list]);setSlideMode('art');setPicker(false);}}/>}
  {reviewOpen&&source&&<ReviewDialog book={{...source.book,title:p.originalTitle||p.title,author:p.author||'Author not supplied'}} year={p.info.year} initial={p.review?{review:p.review,approved:p.reviewApproved}:null} language={lang} onClose={()=>setReviewOpen(false)} onAccount={onAccount} onSave={async v=>{set({review:v.review,reviewApproved:v.approved});mark('reception','done','Edited');setReviewOpen(false);}}/>}
 </Dialog>;
}

// "Ask AI to change": the editor says what, the AI rewrites only this text, and the result replaces it (one Undo away).
function AskAi({text,language,onText,onAccount,hasKey,extra}:{text:string;language:string;onText:(t:string)=>void;onAccount:()=>void;hasKey:boolean;extra?:ReactNode}){
 const[open,setOpen]=useState(false),[ask,setAsk]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[undo,setUndo]=useState<string|null>(null),[suggestion,setSuggestion]=useState<{from:string;text:string}|null>(null);
 async function run(action:'polish'|'revise'){
  setBusy(true);setError('');
  const from=text;
  try{const r=await editorialAssist({action,source:from,language,...(action==='revise'?{instruction:ask}:{})});setSuggestion({from,text:r.text});setOpen(false);setAsk('');}
  catch(e){setError(reason(e));if(e instanceof ApiError&&e.status===412)onAccount();}finally{setBusy(false);}
 }
 return <div className="nb-ask">
  <div className="editor-row-actions">
   <Button size="small" startIcon={<AutoAwesomeRounded/>} disabled={busy||!text.trim()||!hasKey} onClick={()=>setOpen(o=>!o)}>Ask AI</Button>
   <Button size="small" disabled={busy||!text.trim()||!hasKey} onClick={()=>run('polish')}>Polish</Button>
   {undo!==null&&<Button size="small" onClick={()=>{onText(undo);setUndo(null);}}>Undo</Button>}{extra}
  </div>
  {busy&&<div className="nb-ask-working" role="status">Preparing a suggestion…<LinearProgress aria-label="Preparing a writing suggestion"/></div>}
  {open&&<form className="nb-ask-form" onSubmit={e=>{e.preventDefault();if(ask.trim())void run('revise');}}><TextField size="small" fullWidth autoFocus label="What should change?" placeholder="Shorter, warmer, for a general reader, mention the method…" value={ask} onChange={e=>setAsk(e.target.value)} slotProps={{htmlInput:{maxLength:600,dir:'auto'}}}/><Button type="submit" variant="contained" size="small" disabled={busy||!ask.trim()}>Rewrite</Button></form>}
  {suggestion&&<div className="nb-ai-suggestion"><strong>Suggested wording</strong><p dir="auto">{suggestion.text}</p>{suggestion.from!==text&&<small>The original text changed. Ask AI again for an up-to-date suggestion.</small>}<div><Button size="small" variant="contained" disabled={suggestion.from!==text} onClick={()=>{setUndo(text);onText(suggestion.text);setSuggestion(null);}}>Use this wording</Button><Button size="small" onClick={()=>setSuggestion(null)}>Keep mine</Button></div></div>}
  {error&&<small className="nb-ask-error" role="alert">{error}</small>}
 </div>;
}
