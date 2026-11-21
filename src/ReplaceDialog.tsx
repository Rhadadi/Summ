import{useMemo,useRef,useState}from'react';
import{Alert,Button,ButtonBase,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,IconButton,MenuItem,TextField}from'@mui/material';
import{CloseRounded,FolderZipOutlined}from'@mui/icons-material';
import type{PubDoc}from'./types';
import{persianImportIssue}from'./persian-import';
import{applyReplacement,defaultPlan,readZip,type Replaced,type ReplacePlan,type ZipContents}from'./replace-import';

const titleFor=(names:Record<string,string>,lang:string)=>names[lang]||names.en||Object.values(names)[0]||'';
// Put the summaries of a new ZIP into the book being edited: the person chooses the version and ticks what is replaced.
export default function ReplaceDialog({doc,onClose,onApply}:{doc:PubDoc;onClose:()=>void;onApply:(r:Replaced)=>void}){
 const input=useRef<HTMLInputElement>(null);
 const[zip,setZip]=useState<ZipContents|null>(null),[fileName,setFileName]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false);
 const[which,setWhich]=useState(0),[plan,setPlan]=useState<ReplacePlan|null>(null);
 const summary=zip?.summaries[which];
 const issue=useMemo(()=>summary&&summary.lang==='fa'?persianImportIssue(summary.block):null,[summary]);
 async function read(file:File){
  setError('');setWorking(true);
  try{const z=await readZip(file);setZip(z);setFileName(file.name);setWhich(0);setPlan(defaultPlan(doc,z.summaries[0]));}
  catch(e){setError(e instanceof Error?e.message:'Could not read that file.');}finally{setWorking(false);}
 }
 function choose(i:number){if(!zip)return;setWhich(i);setPlan(defaultPlan(doc,zip.summaries[i]));}
 const set=(patch:Partial<ReplacePlan>)=>setPlan(p=>p&&{...p,...patch});
 const chapters=summary?.block.chapters||[];
 const ticked=plan?plan.chapters.filter(Boolean).length+[plan.overview,plan.takeaways,plan.guide].filter(Boolean).length:0;
 function apply(){
  if(!zip||!summary||!plan)return;
  setError('');
  try{onApply(applyReplacement(doc,summary,zip.images,zip.sourcePath,plan));}
  catch(e){setError(e instanceof Error?e.message:'Could not apply the summary.');}
 }
 return <Dialog open onClose={onClose} fullWidth maxWidth="md" scroll="paper" aria-labelledby="replace-title">
  <DialogTitle id="replace-title" className="dialog-heading"><span>Replace from a ZIP</span><IconButton aria-label="Close" onClick={onClose}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent className="wizard">
   <input ref={input} type="file" hidden accept=".zip,.md,.markdown" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void read(f);}}/>
   {!zip?<ButtonBase className="upload-zone" disabled={working} onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)void read(f);}}>
     <span className="upload-icon"><FolderZipOutlined/></span><strong>{working?'Reading the summary…':'Choose the new summary ZIP or drop it here'}</strong><span>Next you choose what it replaces. Nothing changes until you save the book.</span></ButtonBase>
   :summary&&plan?<>
    <Alert severity="success" sx={{mb:2}}>{fileName}: {zip.summaries.length===1?'1 summary':zip.summaries.length+' summaries'}{zip.images.length?', '+zip.images.length+' images':''}.</Alert>
    {zip.summaries.length>1&&<TextField select size="small" fullWidth label="Which summary in the ZIP" value={which} onChange={e=>choose(Number(e.target.value))} sx={{mb:2}}>{zip.summaries.map((s,i)=><MenuItem key={i} value={i}>{s.label} · {s.lang} · {s.block.chapters.length} chapters</MenuItem>)}</TextField>}
    <TextField select size="small" fullWidth label="Put it in" value={plan.target} onChange={e=>set({target:e.target.value==='new'?'new':Number(e.target.value)})} sx={{mb:2}}>
     {doc.versions.map((v,i)=><MenuItem key={i} value={i}>Replace the existing “{v.label} · {v.language}”</MenuItem>)}
     <MenuItem value="new">Add it as a new version (“{summary.label} · {summary.lang}”)</MenuItem>
    </TextField>
    {issue&&<Alert severity="warning" sx={{mb:2}}>{issue}</Alert>}
    <strong>What to replace</strong>
    <div className="zip-found">
     <FormControlLabel control={<Checkbox size="small" disabled={!summary.block.overview.length} checked={plan.overview} onChange={e=>set({overview:e.target.checked})}/>} label={'Overview'+(summary.block.overview.length?' · '+summary.block.overview.length+' paragraphs':' · none in the ZIP')}/>
     <FormControlLabel control={<Checkbox size="small" disabled={!summary.block.takeaways.length} checked={plan.takeaways} onChange={e=>set({takeaways:e.target.checked})}/>} label={'Key ideas'+(summary.block.takeaways.length?' · '+summary.block.takeaways.length:' · none in the ZIP')}/>
     <FormControlLabel control={<Checkbox size="small" disabled={!summary.block.sections.length} checked={plan.guide} onChange={e=>set({guide:e.target.checked})}/>} label={'Study guide'+(summary.block.sections.length?' · '+summary.block.sections.length+' sections':' · none in the ZIP')}/>
     <FormControlLabel control={<Checkbox size="small" checked={plan.titles} onChange={e=>set({titles:e.target.checked})}/>} label="Also use the chapter titles from the ZIP"/>
    </div>
    <div className="editor-section-head" style={{marginTop:16}}><strong>Chapters</strong>
     <span><Button size="small" onClick={()=>set({chapters:defaultPlan(doc,summary).chapters})}>Match all</Button><Button size="small" onClick={()=>set({chapters:chapters.map(()=>'')})}>None</Button></span></div>
    {chapters.map((c,i)=><div key={i} className="zip-found" style={{display:'flex',gap:12,alignItems:'center',margin:'6px 0'}}>
     <Checkbox size="small" checked={!!plan.chapters[i]} onChange={e=>set({chapters:plan.chapters.map((id,j)=>j===i?(e.target.checked?(defaultPlan(doc,summary).chapters[i]||doc.chapters[Math.min(i,doc.chapters.length-1)].id):''):id)})} slotProps={{input:{'aria-label':'Replace a chapter with '+c.title}}}/>
     <span style={{flex:1,minWidth:0}} dir="auto"><strong>{c.title}</strong><small dir="ltr" style={{display:'block',textAlign:'start'}}>{c.paragraphs.length} paragraphs{c.original?' · '+c.original:''}</small></span>
     <TextField select size="small" label="Replaces" value={plan.chapters[i]||''} onChange={e=>set({chapters:plan.chapters.map((id,j)=>j===i?e.target.value:id)})} sx={{minWidth:230}}>
      <MenuItem value="">Leave it out</MenuItem>
      {doc.chapters.map((x,k)=><MenuItem key={x.id} value={x.id}>{k+1}. {titleFor(x.title,summary.lang)}</MenuItem>)}
     </TextField>
    </div>)}
    <p className="settings-help">The chapters you do not tick keep what the book has now. The changes go into the draft; you check them and press “Save changes”.</p>
   </>:null}
   {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
  </DialogContent>
  <DialogActions>
   {zip&&<Button onClick={()=>{setZip(null);setPlan(null);setError('');}}>Choose another file</Button>}
   <Button onClick={onClose}>Cancel</Button>
   {zip&&<Button variant="contained" disabled={!ticked} onClick={apply}>Replace in the draft</Button>}
  </DialogActions>
 </Dialog>;
}
