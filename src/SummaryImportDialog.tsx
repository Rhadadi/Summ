import{useMemo,useRef,useState}from 'react';
import{Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,TextField}from '@mui/material';
import type{Book,ImportedSummary}from './types';
import{languages}from './core';
import{attachSummaryImages,detectSummaryLanguage,readSummaryFile,summaryMarkdown,summaryPrompt,validateImportedSummary}from './summary-import';

interface Props{
 book:Book;
 language:string;
 initial:ImportedSummary|null;
 existingLanguages:string[];
 onClose:()=>void;
 onSave:(summary:ImportedSummary,language:string)=>Promise<void>;
}

export default function SummaryImportDialog({book,language,initial,existingLanguages,onClose,onSave}:Props){
 const [draft,setDraft]=useState<ImportedSummary>(()=>initial??{markdown:'',sourcePath:'',images:[]});
 const [selectedLanguage,setSelectedLanguage]=useState(language);
 const languageChosen=useRef(!!initial);
 const [error,setError]=useState('');
 const [copied,setCopied]=useState(false);
 const [busy,setBusy]=useState(false);
 const working=useRef(false);
 const documentInput=useRef<HTMLInputElement>(null);
 const imageInput=useRef<HTMLInputElement>(null);
 const prompt=useMemo(()=>summaryPrompt(book,languages.find(option=>option.code===selectedLanguage)?.label??'English',selectedLanguage==='fa'),[book,selectedLanguage]);
 const replace=existingLanguages.includes(selectedLanguage)&&(!initial||selectedLanguage!==language);

 function updateDraft(summary:ImportedSummary){
  setDraft(summary);
  if(!languageChosen.current){
   const detected=detectSummaryLanguage(summary.markdown,language);
   if(detected!==selectedLanguage){setSelectedLanguage(detected);setCopied(false);}
  }
 }

 async function run(task:()=>Promise<void>){
  if(working.current)return;
  working.current=true;
  setBusy(true);
  setError('');
  try{await task();}
  catch(reason){setError(reason instanceof Error?reason.message:'Could not import the summary. Please try again.');}
  finally{working.current=false;setBusy(false);}
 }

 return <Dialog open onClose={()=>{if(!working.current)onClose();}} fullWidth maxWidth="md" aria-labelledby="summary-import-title">
  <DialogTitle id="summary-import-title">{initial?'Edit imported summary':'Import a summary'}</DialogTitle>
  <DialogContent className="summary-import">
   <p className="dialog-lead" dir="auto">Add a summary to <strong>{book.title}</strong>. It’s saved with this book on this device.</p>
   <TextField select fullWidth size="small" label="Summary language" value={selectedLanguage} disabled={busy} sx={{mb:2}}
    helperText={replace?'Saving replaces the existing summary in this language.':'Each language is saved separately.'}
    onChange={event=>{languageChosen.current=true;setSelectedLanguage(event.target.value);setCopied(false);}}>
    {languages.map(option=><MenuItem key={option.code} value={option.code}>{option.label}</MenuItem>)}
   </TextField>
   <div className="summary-prompt">
    <strong>Need a summary?</strong>
    <p>Attach the original document in ChatGPT or another AI app, use this prompt, then bring the result back here.</p>
    <Button size="small" onClick={async()=>{
     try{await navigator.clipboard.writeText(prompt);setCopied(true);setError('');}
     catch{setError('Open “View prompt” and copy the text manually.');}
    }}>{copied?'Prompt copied':'Copy AI prompt'}</Button>
    <details><summary>View prompt</summary><pre>{prompt}</pre></details>
   </div>
   <div className="summary-file-actions">
    <Button variant="outlined" disabled={busy} onClick={()=>documentInput.current?.click()}>Choose Markdown or ZIP</Button>
    <Button disabled={busy} onClick={()=>imageInput.current?.click()}>Attach images</Button>
    {draft.images.length>0&&<span role="status">{draft.images.length} {draft.images.length===1?'image':'images'} attached</span>}
   </div>
   <input ref={documentInput} hidden type="file" accept=".md,.markdown,.zip" onChange={event=>{
    const file=event.currentTarget.files?.[0];
    event.currentTarget.value='';
    if(file)void run(async()=>updateDraft(await readSummaryFile(file)));
   }}/>
   <input ref={imageInput} hidden type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.avif,.svg" onChange={event=>{
    const files=Array.from(event.currentTarget.files??[]);
    event.currentTarget.value='';
    if(files.length)void run(async()=>{
     const images=await attachSummaryImages(files,draft.images,draft.sourcePath);
     setDraft({...draft,images});
    });
   }}/>
   <p className="settings-help">Paste the result below or choose a Markdown file. To keep image folders, choose a ZIP with one Markdown file and its images.</p>
   <TextField fullWidth multiline minRows={7} maxRows={16} disabled={busy} label="Summary Markdown" placeholder="Paste your summary here" value={draft.markdown}
    onChange={event=>updateDraft({...draft,markdown:event.target.value})} slotProps={{htmlInput:{maxLength:2*1024*1024,dir:selectedLanguage==='fa'||selectedLanguage==='ar'?'rtl':'auto'}}}/>
   {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  </DialogContent>
  <DialogActions>
   <Button onClick={onClose} disabled={busy}>Cancel</Button>
   <Button variant="contained" disabled={busy||!draft.markdown.trim()} onClick={()=>void run(async()=>{
    const summary={...draft,markdown:summaryMarkdown(draft.markdown)};
    validateImportedSummary(summary);
    await onSave(summary,selectedLanguage);
   })}>{busy?'Working…':'Save imported summary'}</Button>
  </DialogActions>
 </Dialog>;
}
