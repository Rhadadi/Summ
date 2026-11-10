import{useEffect,useState}from'react';
import{Alert,Button,Divider,IconButton,LinearProgress,ListItemText,Menu,MenuItem,Popover,Slider,Switch,TextField,ToggleButton,ToggleButtonGroup}from'@mui/material';
import{ArrowBackIosNewRounded,AutoAwesomeRounded,BookmarkBorderRounded,BookmarkRounded,FormatListBulletedRounded,MoreHorizRounded,TextFieldsRounded}from'@mui/icons-material';
import type{Account,Block,Book,Chapter,Depth,SavedPassage,Settings,Summary}from'./types';
import{depthLabels,languages,selectedPassages}from'./core';
import{money,usageCost}from'./cost';
import type{Price}from'./cost';

type View='highlights'|'original'|'summary';
interface Props{
 book:Book;chapter:Chapter;settings:Settings;account:Account|null;price:Price|null;saved:SavedPassage[];
 summary:Summary|null;generating:boolean;generationError:string;
 onPreferences:(patch:Partial<Settings>)=>void;onGenerate:()=>void;onCancel:()=>void;
 onBookmark:(block:Block,wording:string,chapter:Chapter)=>void;onEvidence:(block:Block,wording:string,chapter:Chapter)=>void;
 onChoose:(index:number)=>void;onContents:()=>void;onBack:()=>void;onGuide:()=>void;onWholeBook:()=>void;onExport:()=>void;onEditContents:()=>void;onSettings:()=>void;onFinished:()=>void;
}
const themes:{id:Settings['theme'];label:string}[]=[{id:'paper',label:'Paper'},{id:'white',label:'White'},{id:'night',label:'Night'}];
export default function Reader(p:Props){
 const{book,chapter,settings,summary}=p;
 const[view,setView]=useState<View>(summary?'summary':'highlights'),[chrome,setChrome]=useState(true);
 const[type,setType]=useState<HTMLElement|null>(null),[more,setMore]=useState<HTMLElement|null>(null),[ai,setAi]=useState<HTMLElement|null>(null),[depthMenu,setDepthMenu]=useState<HTMLElement|null>(null);
 const index=book.chapters.indexOf(chapter),next=book.chapters[index+1],previous=book.chapters[index-1],finished=book.completed.includes(chapter.id);
 useEffect(()=>{if(summary)setView('summary');},[summary]);
 // Bars step aside while reading down and return when scrolling up, at either end of the page, or near the screen edges.
 useEffect(()=>{
  let last=window.scrollY;
  const scroll=()=>{const y=window.scrollY,end=y+innerHeight>=document.documentElement.scrollHeight-40;setChrome(y<80||end||y<last);last=y;};
  const move=(e:MouseEvent)=>{if(e.clientY<70||e.clientY>innerHeight-110)setChrome(true);};
  addEventListener('scroll',scroll,{passive:true});addEventListener('mousemove',move);
  return()=>{removeEventListener('scroll',scroll);removeEventListener('mousemove',move);};
 },[]);
 const kept=(block:Block,wording:string)=>p.saved.some(s=>s.bookId===book.id&&s.blockId===block.id&&s.text===wording);
 function passage(block:Block,wording:string,key:string){
  return <div className="r-passage" key={key}><p dir="auto">{wording}</p><span className="r-tools"><button onClick={()=>p.onEvidence(block,wording,chapter)}>{block.page?'p. '+block.page:block.location}</button><IconButton size="small" aria-label={kept(block,wording)?'Unsave passage':'Save passage'} onClick={()=>p.onBookmark(block,wording,chapter)}>{kept(block,wording)?<BookmarkRounded fontSize="inherit"/>:<BookmarkBorderRounded fontSize="inherit"/>}</IconButton></span></div>;
 }
 function summaryText(items:Summary['paragraphs']){
  return items.map((item,i)=><div className="r-passage" key={i}>{item.heading&&<h3 dir="auto">{item.heading}</h3>}<p dir="auto">{item.text}</p><span className="r-tools">{item.evidence_ids.map(id=>{const block=chapter.blocks.find(b=>b.id===id);return block?<button key={id} onClick={()=>p.onEvidence(block,block.text,chapter)}>{block.page?'p. '+block.page:block.location}</button>:null;})}</span></div>);
 }
 const spent=usageCost(summary?.usage,p.price);
 const aiLabel=!p.account?'Sign in to summarize':!p.account.key?'Add your Gemini key':summary?'Summarize again':'Summarize this chapter';
 return <div className={'reader'+(chrome?'':' r-quiet')} data-chrome={chrome}>
  <header className="r-top">
   <IconButton aria-label="Back to library" onClick={p.onBack}><ArrowBackIosNewRounded fontSize="small"/></IconButton>
   <span className="r-where" dir="auto">{book.title}</span>
   <span className="r-top-actions">
    <IconButton aria-label="Contents" onClick={p.onContents}><FormatListBulletedRounded/></IconButton>
    <IconButton aria-label="Text and theme" onClick={e=>setType(e.currentTarget)}><TextFieldsRounded/></IconButton>
    <IconButton aria-label="More" onClick={e=>setMore(e.currentTarget)}><MoreHorizRounded/></IconButton>
   </span>
  </header>

  <article className="r-page" style={{fontSize:settings.fontSize}} lang={view==='summary'&&summary?summary.language:undefined}>
   <p className="r-kicker">{index+1} / {book.chapters.length}</p>
   <h1 className="r-title" dir="auto">{chapter.title.replace(/^\d+[.\s]+/,'')}</h1>
   {view==='original'&&chapter.blocks.map(b=>passage(b,b.text,b.id))}
   {view==='highlights'&&selectedPassages(chapter,settings.depth).map(({block,text})=>passage(block,text,block.id))}
   {view==='summary'&&<>
    {p.generating&&<div className="r-status"><LinearProgress/><span>Summarizing… <button onClick={p.onCancel}>Cancel</button></span></div>}
    {p.generationError&&<Alert severity="error" sx={{mb:3}}>{p.generationError}</Alert>}
    {summary?<>{summaryText(summary.paragraphs)}
     {summary.review.length>0&&<><h2 className="r-section">Critique</h2>{summaryText(summary.review)}</>}
     <p className="r-note">AI summary{summary.model?' · '+summary.model:''}{spent!=null?' · '+money(spent):''}</p></>
    :!p.generating&&<div className="r-empty"><p>No summary yet.</p><Button variant="contained" startIcon={<AutoAwesomeRounded/>} onClick={e=>setAi(e.currentTarget)}>{aiLabel}</Button></div>}
   </>}
   <nav className="r-end" aria-label="Chapters">
    {next?<button className="r-next" onClick={()=>p.onChoose(index+1)}><span>Next</span><strong dir="auto">{next.title.replace(/^\d+[.\s]+/,'')}</strong></button>:<button className="r-next" onClick={p.onGuide}><span>Finished the book</span><strong>Open the study guide</strong></button>}
    <span className="r-end-links">{previous&&<button onClick={()=>p.onChoose(index-1)}>Previous</button>}<button onClick={p.onFinished}>{finished?'Marked as read ✓':'Mark as read'}</button></span>
   </nav>
  </article>

  <div className="r-dock" role="toolbar" aria-label="Reading controls">
   <ToggleButtonGroup size="small" exclusive value={view} onChange={(_,v)=>{if(v)setView(v);}} aria-label="View">
    <ToggleButton value="highlights">Highlights</ToggleButton><ToggleButton value="original">Full text</ToggleButton><ToggleButton value="summary">Summary</ToggleButton>
   </ToggleButtonGroup>
   {view!=='original'&&<Button size="small" className="r-depth" onClick={e=>setDepthMenu(e.currentTarget)}>{depthLabels[settings.depth]} ▾</Button>}
   <IconButton aria-label="Summary options" className="r-ai" onClick={e=>setAi(e.currentTarget)}><AutoAwesomeRounded fontSize="small"/></IconButton>
  </div>

  <Menu anchorEl={depthMenu} open={!!depthMenu} onClose={()=>setDepthMenu(null)}>{(Object.keys(depthLabels) as Depth[]).map(d=><MenuItem key={d} selected={d===settings.depth} onClick={()=>{p.onPreferences({depth:d});setDepthMenu(null);}}>{depthLabels[d]}</MenuItem>)}</Menu>
  <Popover open={!!ai} anchorEl={ai} onClose={()=>setAi(null)} anchorOrigin={{vertical:'top',horizontal:'center'}} transformOrigin={{vertical:'bottom',horizontal:'center'}} slotProps={{paper:{className:'r-pop'}}}>
   <TextField select size="small" fullWidth label="Purpose" value={settings.purpose} onChange={e=>p.onPreferences({purpose:e.target.value as Settings['purpose']})}><MenuItem value="understand">Understand</MenuItem><MenuItem value="learn">Learn</MenuItem><MenuItem value="academic">Academic</MenuItem><MenuItem value="apply">Apply</MenuItem></TextField>
   <TextField select size="small" fullWidth label="Language" value={settings.language} onChange={e=>p.onPreferences({language:e.target.value})}>{languages.map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>
   <label className="r-switch"><span>Include critique</span><Switch checked={settings.review==='internal'} onChange={e=>p.onPreferences({review:e.target.checked?'internal':'off'})}/></label>
   <Button variant="contained" fullWidth disabled={p.generating} onClick={()=>{setAi(null);setView('summary');p.onGenerate();}}>{aiLabel}</Button>
  </Popover>
  <Popover open={!!type} anchorEl={type} onClose={()=>setType(null)} anchorOrigin={{vertical:'bottom',horizontal:'right'}} transformOrigin={{vertical:'top',horizontal:'right'}} slotProps={{paper:{className:'r-pop'}}}>
   <div className="r-size"><span style={{fontSize:14}}>A</span><Slider size="small" min={16} max={26} step={1} value={settings.fontSize} onChange={(_,v)=>p.onPreferences({fontSize:v as number})} aria-label="Text size"/><span style={{fontSize:22}}>A</span></div>
   <div className="r-themes">{themes.map(t=><button key={t.id} className={'r-theme r-theme-'+t.id+(settings.theme===t.id?' active':'')} aria-pressed={settings.theme===t.id} onClick={()=>p.onPreferences({theme:t.id})}>Aa<span>{t.label}</span></button>)}</div>
  </Popover>
  <Menu anchorEl={more} open={!!more} onClose={()=>setMore(null)}>
   <MenuItem onClick={()=>{setMore(null);p.onGuide();}}><ListItemText>Study guide</ListItemText></MenuItem>
   <MenuItem onClick={()=>{setMore(null);p.onWholeBook();}}><ListItemText>Summarize whole book</ListItemText></MenuItem>
   <Divider/>
   <MenuItem onClick={()=>{setMore(null);p.onExport();}}><ListItemText>Export notes</ListItemText></MenuItem>
   <MenuItem onClick={()=>{setMore(null);p.onEditContents();}}><ListItemText>Edit contents</ListItemText></MenuItem>
   <MenuItem onClick={()=>{setMore(null);p.onSettings();}}><ListItemText>Settings</ListItemText></MenuItem>
  </Menu>
 </div>;
}
