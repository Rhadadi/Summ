import{useRef,useState}from'react';
import{Alert,Button,ButtonBase,Checkbox,FormControlLabel,TextField}from'@mui/material';
import{FolderZipOutlined}from'@mui/icons-material';
import type{Book,ImportedVersion,SummaryImage}from'./types';
import{languages}from'./core';
import{summaryTypes}from'./prompt-builder';
import{mapChapters,parseBlock,splitBlocks,type ParsedBlock}from'./structured-import';
import{buildVersion,versionLabel}from'./imports';
import{readSummaryFiles,summaryMarkdown}from'./summary-import';

interface Found{block:ParsedBlock;type:string;lang:string;label:string}
// A finished summary (a ZIP or Markdown file) becomes a book with no source file: chapters come from the summary itself.
export default function SummaryZipTab({busy,onCreate}:{busy:boolean;onCreate:(book:Book,versions:ImportedVersion[])=>Promise<void>}){
 const input=useRef<HTMLInputElement>(null);
 const[found,setFound]=useState<Found[]>([]),[images,setImages]=useState<SummaryImage[]>([]),[sourcePath,setSourcePath]=useState(''),[skip,setSkip]=useState<Set<number>>(new Set());
 const[title,setTitle]=useState(''),[author,setAuthor]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[fileName,setFileName]=useState('');
 async function read(file:File){
  setError('');setWorking(true);setFound([]);setSkip(new Set());
  try{
   const r=await readSummaryFiles(file);setFileName(file.name);setImages(r.images);setSourcePath(r.documents[0].name);
   const out:Found[]=[];
   for(const doc of r.documents){
    const byName=summaryTypes.find(t=>doc.name.toLowerCase().includes(t.id))?.id;
    for(const part of splitBlocks(doc.markdown)){
     const block=parseBlock(part.text,part.type||byName||null,part.language||'en');
     if(!block.chapters.length)continue;
     const type=part.type||byName||'detailed',lang=part.language||block.language;
     out.push({block,type,lang,label:versionLabel(type)});
    }
   }
   if(!out.length)throw Error('No chapters were found. Each chapter needs a heading such as “## 1. Title”.');
   setFound(out);
   const first=out[0].block;setTitle(first.bookTitle||'');setAuthor('');
  }catch(e){setError(e instanceof Error?e.message:'Could not read that file.');}finally{setWorking(false);}
 }
 const picked=found.map((f,i)=>({...f,i})).filter(f=>!skip.has(f.i));
 async function create(){
  setError('');
  try{
   // The summary with the most chapters defines the book's contents; others are matched to it by position.
   const lead=[...picked].sort((a,b)=>b.block.chapters.length-a.block.chapters.length)[0];
   const chapters=lead.block.chapters.map((c,i)=>({id:'z'+i,title:c.original||c.title,blocks:[]}));
   const seen=new Set<string>(),versions:ImportedVersion[]=[];
   for(const f of picked){
    const id=f.lang+':'+f.type;if(seen.has(id))continue;seen.add(id);
    versions.push(buildVersion(f.block,mapChapters(f.block.chapters,chapters,'position').mapped,f.lang,f.type,{sourcePath,images}));
   }
   const book:Book={id:crypto.randomUUID(),title:title.trim()||lead.block.chapters[0].title,author:author.trim()||'Author not supplied',format:'SUMMARY',category:'book',chapters,warnings:[],addedAt:Date.now(),lastRead:0,chapterIndex:0,completed:[],color:Math.floor(Math.random()*4),hash:'summary:'+crypto.randomUUID()};
   await onCreate(book,versions);
  }catch(e){setError(e instanceof Error?e.message:'Could not create the book.');}
 }
 return <div className="zip-tab">
  <input ref={input} type="file" hidden accept=".zip,.md,.markdown" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void read(f);}}/>
  {!found.length?<><ButtonBase className="upload-zone" disabled={working} onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)void read(f);}}>
    <span className="upload-icon"><FolderZipOutlined/></span><strong>{working?'Reading the summary…':'Choose the summary ZIP or drop it here'}</strong><span>Markdown with its images folder, or just a .md file</span><small>No book file needed: the chapters come from the summary itself</small></ButtonBase>
   <p className="settings-help">Next you set the title and author, then go straight to publishing: background picture, caption, audio and the rest.</p></>
  :<>
   <Alert severity="success" sx={{mt:2}}>{fileName}: {found.length===1?'1 summary':found.length+' summaries'}, {found[0].block.chapters.length} chapters{images.length?', '+images.length+' images':''}.</Alert>
   <div className="zip-form"><TextField fullWidth size="small" label="Book title" value={title} onChange={e=>setTitle(e.target.value)}/><TextField fullWidth size="small" label="Author" value={author} onChange={e=>setAuthor(e.target.value)}/></div>
   {found.length>1&&<div className="zip-found">{found.map((f,i)=><FormControlLabel key={i} control={<Checkbox size="small" checked={!skip.has(i)} onChange={()=>setSkip(s=>{const n=new Set(s);n.has(i)?n.delete(i):n.add(i);return n;})}/>} label={f.label+' · '+(languages.find(l=>l.code===f.lang)?.label.replace(/ ·.*/,'')||f.lang)+' · '+f.block.chapters.length+' chapters'}/>)}</div>}
   <ol className="wizard-map">{found[0].block.chapters.slice(0,12).map((c,i)=><li key={i}><span dir="auto">{c.title}</span><small dir="auto">{c.original||''}</small></li>)}</ol>
   <div className="zip-actions"><Button onClick={()=>{setFound([]);setError('');}} disabled={busy}>Choose another</Button><Button variant="contained" disabled={busy||!picked.length||!title.trim()} onClick={create}>{busy?'Creating…':'Create the book and continue'}</Button></div>
  </>}
  {error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}
 </div>;
}
