import{useMemo,useRef,useState}from'react';
import{Alert,Button,Checkbox,Chip,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,MenuItem,Step,StepButton,Stepper,TextField}from'@mui/material';
import{AutoAwesomeRounded,CheckRounded,CloseRounded,ContentCopyRounded,FileUploadOutlined}from'@mui/icons-material';
import type{Book,ImportedVersion,SummaryImage}from'./types';
import{chapterWords,languages,minutes,sectionKind}from'./core';
import{audiences,buildPrompt,chapterLabel,defaultOptions,summaryTypes,tones,type PromptOptions}from'./prompt-builder';
import{mapChapters,parseBlock,splitBlocks}from'./structured-import';
import{buildVersion,versionLabel}from'./imports';
import{readSummaryFile,summaryMarkdown}from'./summary-import';

interface Props{book:Book;language:string;existing:ImportedVersion[];canGenerate:boolean;startAt?:number;onClose:()=>void;onSave:(versions:ImportedVersion[])=>Promise<void>;onGenerate:()=>void}
const STEPS=['Chapters','Style','Prompt','Bring it back'];
const languageName=(code:string)=>languages.find(l=>l.code===code)?.label.replace(/ ·.*|\s*\(.*/,'')||code;
const nativeName=(code:string)=>({fa:'Persian (Farsi)',ar:'Arabic',en:'English',de:'German',es:'Spanish',fr:'French',tr:'Turkish',zh:'Chinese'} as Record<string,string>)[code]||languageName(code);

// Choose chapters and styles, copy a prompt that reflects them, then bring the answer back as real chapter summaries.
export default function ImportWizard({book,language,existing,canGenerate,startAt=0,onClose,onSave,onGenerate}:Props){
 const kinds=useMemo(()=>book.chapters.map((c,i)=>sectionKind(c,i,book.chapters)),[book]);
 const[step,setStep]=useState(startAt);
 const[opts,setOpts]=useState<PromptOptions>(()=>({...defaultOptions({code:language,name:nativeName(language)}),chapters:book.chapters.map((_,i)=>i).filter(i=>kinds[i]==='main')}));
 const[raw,setRaw]=useState(''),[files,setFiles]=useState<{sourcePath:string;images:SummaryImage[]}>({sourcePath:'',images:[]}),[error,setError]=useState(''),[copied,setCopied]=useState(false),[busy,setBusy]=useState(false);
 const[overrides,setOverrides]=useState<Record<number,{type?:string;language?:string}>>({});
 const file=useRef<HTMLInputElement>(null);
 const set=(patch:Partial<PromptOptions>)=>{setOpts(o=>({...o,...patch}));setCopied(false);};
 const toggle=<T,>(list:T[],value:T)=>list.includes(value)?list.filter(x=>x!==value):[...list,value];
 const prompt=useMemo(()=>buildPrompt(book,opts),[book,opts]);
 const parsed=useMemo(()=>{
  if(!raw.trim())return[];
  return splitBlocks(summaryMarkdown(raw)).map((part,i)=>{
   const block=parseBlock(part.text,part.type,part.language||language);
   const lang=overrides[i]?.language||part.language||block.language,type=overrides[i]?.type||part.type||'detailed';
   const byPosition=mapChapters(block.chapters,book.chapters,'position'),byTitle=mapChapters(block.chapters,book.chapters,'title');
   // Numbers from our prompt count the book's sections; numbers written by another tool follow the book's own titles.
   const result=byTitle.mapped.length>byPosition.mapped.length?byTitle:byPosition;
   return{block,lang,type,result};
  });
 },[raw,book,language,overrides]);
 const chosen=opts.chapters.length,ready=parsed.length>0&&parsed.every(p=>p.result.mapped.length>0);
 async function save(){
  setBusy(true);setError('');
  try{
   const versions=parsed.map(p=>buildVersion(p.block,p.result.mapped,p.lang,p.type,files));
   if(new Set(versions.map(v=>v.id)).size!==versions.length)throw Error('Two of the summaries share a language and style. Change one of them below.');
   await onSave(versions);
  }catch(e){setError(e instanceof Error?e.message:'Could not save the summary.');setBusy(false);}
 }
 const summaryLine=[chosen+(chosen===1?' chapter':' chapters'),opts.types.length+(opts.types.length===1?' style':' styles'),opts.languages.map(l=>l.name.replace(/ \(.*/,'')).join(', ')].join(' · ');
 return <Dialog open onClose={()=>{if(!busy)onClose();}} fullWidth maxWidth="md" aria-labelledby="wizard-title" scroll="paper">
  <DialogTitle id="wizard-title" className="dialog-heading"><span>Prepare a summary of <em dir="auto">{book.title.split(':')[0]}</em></span><IconButton aria-label="Close" disabled={busy} onClick={onClose}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent className="wizard">
   <Stepper nonLinear activeStep={step} className="wizard-steps">{STEPS.map((label,i)=><Step key={label} completed={i<step}><StepButton onClick={()=>setStep(i)}>{label}</StepButton></Step>)}</Stepper>
   {step===0&&<section>
    <p className="dialog-lead">Which parts of the book should the summary cover? Front matter and back matter are left out unless you tick them.</p>
    <div className="wizard-bar"><strong>{chosen} of {book.chapters.length} selected</strong>
     <Button size="small" onClick={()=>set({chapters:book.chapters.map((_,i)=>i)})}>All</Button>
     <Button size="small" onClick={()=>set({chapters:book.chapters.map((_,i)=>i).filter(i=>kinds[i]==='main')})}>Chapters only</Button>
     <Button size="small" onClick={()=>set({chapters:[]})}>None</Button></div>
    <div className="wizard-chapters">{book.chapters.map((c,i)=><FormControlLabel key={c.id} control={<Checkbox size="small" checked={opts.chapters.includes(i)} onChange={()=>set({chapters:toggle(opts.chapters,i)})}/>} label={<span className="wizard-row"><span dir="auto">{i+1}. {chapterLabel(c.title)}</span><small>{kinds[i]!=='main'&&<Chip size="small" label={kinds[i]+' matter'}/>} {minutes(chapterWords(c))} min</small></span>}/>)}</div>
   </section>}
   {step===1&&<section>
    <p className="dialog-lead">Pick one style or several. Each one becomes its own summary of every chapter you chose.</p>
    <h4 className="pub-h">Summary styles</h4>
    <div className="wizard-types">{summaryTypes.map(t=><label key={t.id} className={'wizard-type'+(opts.types.includes(t.id)?' on':'')}><Checkbox size="small" checked={opts.types.includes(t.id)} onChange={()=>set({types:toggle(opts.types,t.id)})}/><span><strong>{t.label}</strong><small>{t.hint} · ~{t.words} words</small></span></label>)}</div>
    <h4 className="pub-h">Languages</h4>
    <div className="wizard-langs">{languages.map(l=><FormControlLabel key={l.code} control={<Checkbox size="small" checked={opts.languages.some(x=>x.code===l.code)} onChange={()=>{const has=opts.languages.some(x=>x.code===l.code);if(has&&opts.languages.length===1)return;set({languages:has?opts.languages.filter(x=>x.code!==l.code):[...opts.languages,{code:l.code,name:nativeName(l.code)}]});}}/>} label={l.label}/>)}</div>
    <div className="settings-grid" style={{marginTop:16}}>
     <TextField select size="small" label="Written for" value={opts.audience} onChange={e=>set({audience:e.target.value})}>{audiences.map(a=><MenuItem key={a.id} value={a.id}>{a.label}</MenuItem>)}</TextField>
     <TextField select size="small" label="Voice" value={opts.tone} onChange={e=>set({tone:e.target.value})}>{tones.map(a=><MenuItem key={a.id} value={a.id}>{a.label}</MenuItem>)}</TextField>
    </div>
    <h4 className="pub-h">Also include</h4>
    <div className="wizard-langs">
     <FormControlLabel control={<Checkbox size="small" checked={opts.overview} onChange={()=>set({overview:!opts.overview})}/>} label="Overview of the whole book"/>
     <FormControlLabel control={<Checkbox size="small" checked={opts.takeaways} onChange={()=>set({takeaways:!opts.takeaways})}/>} label="Key takeaways"/>
     <FormControlLabel control={<Checkbox size="small" checked={opts.concepts} onChange={()=>set({concepts:!opts.concepts})}/>} label="Key concepts and connections"/>
     <FormControlLabel control={<Checkbox size="small" checked={opts.evidence} onChange={()=>set({evidence:!opts.evidence})}/>} label="Evidence and limitations"/>
     <FormControlLabel control={<Checkbox size="small" checked={opts.figures} onChange={()=>set({figures:!opts.figures})}/>} label="Figures, images and tables (as a ZIP)"/>
     <FormControlLabel control={<Checkbox size="small" checked={opts.glossary} onChange={()=>set({glossary:!opts.glossary})}/>} label="Key terms"/>
     <FormControlLabel control={<Checkbox size="small" checked={opts.pageRefs} onChange={()=>set({pageRefs:!opts.pageRefs})}/>} label="Page references"/>
     <FormControlLabel control={<Checkbox size="small" checked={opts.quotes} onChange={()=>set({quotes:!opts.quotes})}/>} label="Short quotes"/>
    </div>
    <TextField fullWidth multiline minRows={2} size="small" sx={{mt:2}} label="Anything else the summary should do" placeholder="For example: focus on the legal arguments, or compare each chapter with the one before." value={opts.notes} onChange={e=>set({notes:e.target.value})}/>
   </section>}
   {step===2&&<section>
    <p className="dialog-lead">{canGenerate?'Copy this prompt into ChatGPT, Claude or Gemini with the book attached — or let the app write the summary with your own API key.':'Copy this prompt into ChatGPT, Claude or Gemini with the book attached, then bring the answer back.'}</p>
    <div className="wizard-bar"><Chip label={summaryLine}/>
     <Button variant="contained" startIcon={copied?<CheckRounded/>:<ContentCopyRounded/>} disabled={!chosen||!opts.types.length} onClick={async()=>{try{await navigator.clipboard.writeText(prompt);setCopied(true);setError('');}catch{setError('Select the prompt text below and copy it by hand.');}}}>{copied?'Copied':'Copy prompt'}</Button>
     {canGenerate&&<Button startIcon={<AutoAwesomeRounded/>} onClick={onGenerate}>Write it here instead</Button>}</div>
    {(!chosen||!opts.types.length)&&<Alert severity="warning">Choose at least one chapter and one style first.</Alert>}
    <pre className="wizard-prompt" aria-label="Generated prompt">{prompt}</pre>
   </section>}
   {step===3&&<section>
    <p className="dialog-lead">Paste the AI's answer or choose its Markdown or ZIP file (with the images). Chapter titles, overview and summaries are split out and matched to the book's chapters.</p>
    <div className="wizard-bar"><Button variant="outlined" startIcon={<FileUploadOutlined/>} onClick={()=>file.current?.click()}>Choose a file</Button>
     <input ref={file} hidden type="file" accept=".md,.markdown,.zip" onChange={async e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';if(!f)return;try{const r=await readSummaryFile(f);setRaw(r.markdown);setFiles({sourcePath:r.sourcePath,images:r.images});setOverrides({});setError('');}catch(x){setError((x as Error).message);}}}/>
     {files.images.length>0&&<small>{files.images.length} {files.images.length===1?'image':'images'} found in the ZIP</small>}
     {existing.length>0&&<small>Already saved: {existing.map(v=>v.label+' · '+languageName(v.language)).join(', ')}</small>}</div>
    <TextField fullWidth multiline minRows={6} maxRows={14} label="Summary" placeholder="Paste the Markdown here" value={raw} onChange={e=>{setRaw(e.target.value);setOverrides({});if(files.images.length)setFiles({sourcePath:'',images:[]});}} slotProps={{htmlInput:{maxLength:2*1024*1024,dir:'auto'}}}/>
    {parsed.map((p,i)=>{const{mapped,missing,extra}=p.result;return <div className="wizard-found" key={i}>
     <div className="wizard-found-head"><strong>Found a summary</strong>
      <TextField select size="small" label="Style" value={p.type} onChange={e=>setOverrides(o=>({...o,[i]:{...o[i],type:e.target.value}}))}>{summaryTypes.map(t=><MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}{!summaryTypes.some(t=>t.id===p.type)&&<MenuItem value={p.type}>{versionLabel(p.type)}</MenuItem>}</TextField>
      <TextField select size="small" label="Language" value={p.lang} onChange={e=>setOverrides(o=>({...o,[i]:{...o[i],language:e.target.value}}))}>{languages.map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField></div>
     <p className="settings-help">{mapped.length} of {mapped.length+extra.length} chapters matched{p.block.overview.length?' · overview':''}{p.block.takeaways.length?' · key takeaways':''}{p.block.sections.length?' · '+p.block.sections.length+' more sections':''}{existing.some(v=>v.id===p.lang+':'+p.type)?' · replaces your saved '+versionLabel(p.type)+' summary':''}</p>
     <ol className="wizard-map">{mapped.slice(0,40).map(m=>{const c=book.chapters.find(x=>x.id===m.chapterId)!;return <li key={m.chapterId}><span dir="auto">{m.parsed.title}</span><small dir="auto">{chapterLabel(c.title)}</small></li>;})}</ol>
     {extra.length>0&&<Alert severity="warning">{extra.length} chapter{extra.length===1?'':'s'} in the summary could not be matched to the book: {extra.slice(0,4).map(e=>e.title).join('; ')}.</Alert>}
     {mapped.length>0&&missing.length>0&&opts.chapters.some(i=>missing.some(c=>c.id===book.chapters[i].id))&&<small className="settings-help">Not covered: {missing.filter(c=>opts.chapters.includes(book.chapters.indexOf(c))).slice(0,6).map(c=>c.title.replace(/^\d+[.\s]+/,'')).join('; ')}</small>}
     {mapped.length===0&&<Alert severity="error">No chapters were recognised. Each chapter needs a heading such as “## 1. Title” (or “## Chapter 1: Title”).</Alert>}
    </div>;})}
    {raw.trim()&&!parsed.length&&<Alert severity="error" sx={{mt:2}}>Nothing to import yet.</Alert>}
   </section>}
   {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  </DialogContent>
  <DialogActions sx={{px:3,pb:2}}>
   <Button onClick={onClose} disabled={busy}>Cancel</Button><span style={{flex:1}}/>
   {step>0&&<Button disabled={busy} onClick={()=>setStep(step-1)}>Back</Button>}
   {step<3?<Button variant="contained" disabled={step===0&&!chosen||step===1&&!opts.types.length} onClick={()=>setStep(step+1)}>{step===2?'I have the answer':'Next'}</Button>
    :<Button variant="contained" disabled={busy||!ready} onClick={save}>{busy?'Saving…':parsed.length>1?'Add '+parsed.length+' summaries':'Add to this book'}</Button>}
  </DialogActions>
 </Dialog>;
}
