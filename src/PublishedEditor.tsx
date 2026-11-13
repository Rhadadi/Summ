import{useEffect,useState}from'react';
import{Alert,Button,CircularProgress,IconButton,MenuItem,Tab,Tabs,TextField}from'@mui/material';
import{AddRounded,AutoAwesomeRounded,DeleteOutlineRounded,ArrowBackRounded}from'@mui/icons-material';
import ArtPicker from'./ArtPicker';
import ReviewDialog from'./ReviewDialog';
import type{ArtResult,LocalReview,PubBook,PubDoc,PubPara,PubVersion}from'./types';
import{bookInfo,coverImage,editorialAssist,libraryBook,publishBook,removeCover,setSlide,unpublishBook,uploadBackground,uploadCover,uploadFigure}from'./api';
import{coverBlob,figureBlob}from'./publish';
import{tr}from'./i18n';

type Edition=PubBook&{doc:PubDoc};
type Pick='cover'|'background'|null;
const emptyPara=():PubPara=>({text:''});
const copy=<T,>(v:T):T=>structuredClone(v);
const titleFor=(names:Record<string,string>,lang:string)=>names[lang]||Object.values(names)[0]||'';
interface Props{bookId:string;language:string;onBack:()=>void;onSaved:()=>void;onAccount:()=>void}
export default function PublishedEditor({bookId,language,onBack,onSaved,onAccount}:Props){
 const L=(text:string)=>tr(language,text);
 const[book,setBook]=useState<Edition|null>(null),[doc,setDoc]=useState<PubDoc|null>(null),[tab,setTab]=useState(0),[versionIndex,setVersionIndex]=useState(0);
 const[figStamp,setFigStamp]=useState(Date.now());
 const[capText,setCapText]=useState(''),[capUrl,setCapUrl]=useState('');
 const[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pick,setPick]=useState<Pick>(null),[reviewOpen,setReviewOpen]=useState(false),[reviewDraft,setReviewDraft]=useState<LocalReview|null>(null),[coverChoices,setCoverChoices]=useState<string[]>([]);
 useEffect(()=>{let live=true;setBook(null);setDoc(null);libraryBook(bookId).then(b=>{if(live){setBook(b);setDoc(copy(b.doc));setCapText(b.slide?.caption||'');setCapUrl(b.slide?.captionUrl||'');}}).catch(e=>{if(live)setError((e as Error).message);});return()=>{live=false;};},[bookId]);
 if(!book||!doc)return <div className="editor-workspace"><Button startIcon={<ArrowBackRounded/>} onClick={onBack}>Workspace</Button>{error?<Alert severity="error">{error}</Alert>:<CircularProgress/>}</div>;
 const currentBook=book,currentDoc=doc;
 const version=doc.versions[Math.min(versionIndex,doc.versions.length-1)],lang=version.language;
 const title=titleFor(doc.title,lang),about=version.overview?.paragraphs[0]?.text||doc.info?.description||'';
 const update=(fn:(draft:PubDoc)=>void)=>setDoc(current=>{if(!current)return current;const next=copy(current);fn(next);return next;});
 const updateVersion=(fn:(v:PubVersion)=>void)=>update(d=>fn(d.versions[versionIndex]));
 const updateList=(list:PubPara[],replace:(next:PubPara[])=>void)=>({
  change:(i:number,field:'heading'|'text',value:string)=>{const next=copy(list);next[i]={...next[i],[field]:value};replace(next);},
  add:()=>replace([...list,emptyPara()]),
  remove:(i:number)=>replace(list.filter((_,j)=>j!==i)),
  move:(i:number,delta:number)=>{const next=copy(list),j=i+delta;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]];replace(next);}
 });
 async function assist(action:'polish'|'overview'|'title',source:string,apply:(value:string)=>void){
  if(!source.trim()){setError('Add some text first so AI has a source to work from.');return;}
  setBusy('ai');setError('');try{const result=await editorialAssist({action,source,language:lang});apply(result.text);setNotice('AI draft added. Review it, then save your changes.');}
  catch(e){setError((e as Error).message);if((e as {status?:number}).status===412)onAccount();}finally{setBusy('');}
 }
 function paragraphs(label:string,list:PubPara[],replace:(next:PubPara[])=>void){
  const actions=updateList(list,replace);
  return <section className="editor-section"><div className="editor-section-head"><h3>{L(label)}</h3><Button startIcon={<AddRounded/>} onClick={actions.add}>{L('Add paragraph')}</Button></div>
   {list.map((p,i)=><div className="editor-paragraph" key={i}>
    <TextField label={L('Heading (optional)')} value={p.heading||''} onChange={e=>actions.change(i,'heading',e.target.value)} fullWidth/>
    <TextField label={L('Text')} multiline minRows={3} value={p.text} onChange={e=>actions.change(i,'text',e.target.value)} fullWidth dir={lang==='fa'||lang==='ar'?'rtl':'ltr'}/>
    <div className="editor-row-actions"><Button size="small" disabled={!!busy||!p.text.trim()} startIcon={<AutoAwesomeRounded/>} onClick={()=>assist('polish',p.text,value=>actions.change(i,'text',value))}>{L('Polish with AI')}</Button><Button size="small" disabled={i===0} onClick={()=>actions.move(i,-1)}>{L('Move up')}</Button><Button size="small" disabled={i===list.length-1} onClick={()=>actions.move(i,1)}>{L('Move down')}</Button><IconButton aria-label={L('Delete paragraph')+' '+(i+1)} onClick={()=>actions.remove(i)}><DeleteOutlineRounded/></IconButton></div>
   </div>)}
  </section>;
 }
 async function save(){
  setError('');setNotice('');
  if(!Object.values(currentDoc.title).some(t=>t.trim())){setError('Add a title.');return;}
  if(!currentDoc.chapters.length){setError('Keep at least one chapter.');return;}
  if(currentDoc.chapters.some(c=>!Object.values(c.title).some(t=>t.trim()))){setError('Every chapter needs a title.');return;}
  if(currentDoc.chapters.some(c=>currentDoc.versions.every(v=>!v.chapters[c.id]?.paragraphs.length))){setError('Add a summary to each chapter before saving.');return;}
  for(const v of currentDoc.versions){if(v.overview?.paragraphs.some(p=>!p.text.trim())||v.overview?.takeaways?.some(p=>!p.text.trim())||Object.values(v.chapters).some(c=>[...c.paragraphs,...(c.review||[])].some(p=>!p.text.trim()))||v.guide?.sections.some(s=>!s.title.trim()||s.items.some(p=>!p.text.trim()))){setError('Finish or remove empty paragraphs before saving.');return;}}
  setBusy('save');try{const updated=await publishBook({id:currentBook.id,doc:currentDoc,visibility:currentBook.visibility});setBook(updated);setDoc(copy(updated.doc));setNotice('Saved. Readers now see these changes.');onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}
 }
 async function upload(file:File){setBusy('cover');setError('');try{const blob=await coverBlob(file);await uploadCover(currentBook.id,blob);setBook({...currentBook,cover:'/api/library/'+currentBook.id+'/cover?v='+Date.now()});setNotice('Cover updated.');onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function useArt(art:ArtResult){setPick(null);setBusy('art');setError('');try{
   if(pick==='background'){await setSlide(currentBook.id,'art',art.file);setBook({...currentBook,slide:{mode:'art',credit:{title:art.title,artist:art.artist,year:art.year,page:art.page}}});setNotice('Background updated.');}
   else{const blob=await coverBlob(await coverImage(art.thumb));await uploadCover(currentBook.id,blob);setBook({...currentBook,cover:'/api/library/'+currentBook.id+'/cover?v='+Date.now()});setNotice('Cover updated.');}
   onSaved();
  }catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function chooseSlide(mode:'none'|'cover'){setBusy('art');setError('');try{const slide=await setSlide(currentBook.id,mode);setBook({...currentBook,slide});setNotice('Background updated.');onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function findCovers(){setBusy('covers');setError('');try{const info=await bookInfo(title,currentDoc.author);setCoverChoices(info.covers);if(!info.covers.length)setNotice('No cover images were found for this title.');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function useCoverUrl(url:string){setBusy('cover');setError('');try{await uploadCover(currentBook.id,await coverBlob(await coverImage(url)));setBook({...currentBook,cover:'/api/library/'+currentBook.id+'/cover?v='+Date.now()});setNotice('Cover updated.');onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function unpublish(){if(!confirm('Unpublish this book? Its public link, cover, background, and narration will be removed.'))return;setBusy('delete');setError('');try{await unpublishBook(currentBook.id);onSaved();onBack();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 async function backgroundFile(file:File){setBusy('background');setError('');try{
  const bitmap=await createImageBitmap(file),scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not prepare the background.')),'image/jpeg',.7));
  if(blob.size>1_400_000)throw Error('The background is too large. Choose a smaller image.');
  await uploadBackground(currentBook.id,blob);const slide={mode:'upload' as const,art:'/api/library/'+currentBook.id+'/art?v='+Date.now()};
  setBook({...currentBook,slide});setNotice('Background updated.');onSaved();
 }catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <div className="editor-workspace">
  <Button startIcon={<ArrowBackRounded/>} onClick={onBack}>{L('Workspace')}</Button>
  <div className="editor-heading"><div><span className="eyebrow">{L('BOOK EDITOR')}</span><h1 dir="auto">{title}</h1><p>{L('Change the published book directly. Text changes go live when you save.')}</p></div><Button variant="contained" disabled={!!busy} onClick={save}>{L(busy==='save'?'Saving…':'Save changes')}</Button></div>
  {error&&<Alert severity="error" onClose={()=>setError('')} sx={{mb:2}}>{error}</Alert>}{notice&&<Alert severity="success" onClose={()=>setNotice('')} sx={{mb:2}}>{notice}</Alert>}
  {doc.versions.length>1&&<TextField select size="small" label={L('Summary version')} value={versionIndex} onChange={e=>setVersionIndex(Number(e.target.value))} sx={{minWidth:260,mb:2}}>{doc.versions.map((v,i)=><MenuItem key={i} value={i}>{v.label} · {v.language}</MenuItem>)}</TextField>}
  <Tabs value={tab} onChange={(_,n)=>setTab(n)} variant="scrollable" scrollButtons="auto" aria-label={L('Book editor sections')}><Tab label={L('Details & images')}/><Tab label={L('Overview')}/><Tab label={L('Chapters')}/><Tab label={L('Study guide')}/><Tab label={L('Reception')}/></Tabs>
  {tab===0&&<div className="editor-panel"><h2>{L('Book details')}</h2><div className="editor-fields">
   <TextField label={L('Title')+' · '+lang} value={doc.title[lang]||''} onChange={e=>update(d=>{d.title[lang]=e.target.value;})} fullWidth/>
   {lang!=='en'&&<TextField label={lang==='fa'?'عنوان انگلیسی برای یافتن نقدها':'English title for review research'} value={doc.title.en||''} onChange={e=>update(d=>{d.title.en=e.target.value;})} fullWidth/>}
   <TextField label={L('Author')} value={doc.author} onChange={e=>update(d=>{d.author=e.target.value;})} fullWidth/>
   <TextField label={L('Original language')} value={doc.originalLanguage} onChange={e=>update(d=>{d.originalLanguage=e.target.value;})} fullWidth/>
   <TextField label={L('Year')} value={doc.info?.year||''} onChange={e=>update(d=>{d.info={...d.info,year:e.target.value};})} fullWidth/>
   <TextField label={L('Publisher')} value={doc.info?.publisher||''} onChange={e=>update(d=>{d.info={...d.info,publisher:e.target.value};})} fullWidth/>
   <TextField label={L('Pages')} type="number" value={doc.info?.pages??''} onChange={e=>update(d=>{d.info={...d.info,pages:e.target.value?Number(e.target.value):null};})} fullWidth/>
   <TextField select label={L('Visibility')} value={book.visibility} onChange={e=>setBook({...book,visibility:e.target.value as 'public'|'unlisted'})}><MenuItem value="public">{L('Public library')}</MenuItem><MenuItem value="unlisted">{L('Unlisted link')}</MenuItem></TextField>
  </div><TextField label={L('Publisher description')} value={doc.info?.description||''} onChange={e=>update(d=>{d.info={...d.info,description:e.target.value};})} multiline minRows={3} fullWidth sx={{mt:2}}/>
  <TextField label={L('Subjects (one per line)')} value={(doc.info?.categories||[]).join('\n')} onChange={e=>update(d=>{d.info={...d.info,categories:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)};})} multiline minRows={2} fullWidth sx={{mt:2}}/>
  <Button disabled={!!busy} startIcon={<AutoAwesomeRounded/>} onClick={()=>assist('title',title+'\n'+about,value=>update(d=>{d.title[lang]=value;}))}>{L('Suggest a title with AI')}</Button>
  <h2>{L('Cover')}</h2><div className="editor-media">{book.cover&&<img src={book.cover} alt={L('Current cover')}/>}<div><Button component="label" variant="outlined" disabled={!!busy}>{L('Upload a cover')}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></Button><Button disabled={!!busy} onClick={findCovers}>{L('Find book covers')}</Button><Button disabled={!!busy} startIcon={<AutoAwesomeRounded/>} onClick={()=>setPick('cover')}>{L('AI painting ideas for cover')}</Button>{book.cover&&<Button color="error" disabled={!!busy} onClick={async()=>{setBusy('cover');try{await removeCover(book.id);setBook({...book,cover:null});setNotice('Cover removed.');onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>{L('Remove cover')}</Button>}</div></div>
  {coverChoices.length>0&&<div className="editor-cover-choices">{coverChoices.map(url=><button key={url} onClick={()=>useCoverUrl(url)}><img src={url} alt="Suggested book cover"/></button>)}</div>}
  {(()=>{const names=[...new Set(currentDoc.versions.flatMap(v=>[...(v.overview?.paragraphs||[]),...(v.guide?.sections||[]).flatMap(x=>x.items),...Object.values(v.chapters).flatMap(c=>c.paragraphs)]).flatMap(p=>p.image?[p.image.name]:[]))];
   return names.length>0&&<><h2>Figures and maps</h2><p>If an image is cut off or blurry, replace it with a better file. Readers see the new one straight away.</p><div className="editor-figs">{names.map(n=><div key={n} className="editor-fig"><img src={'/api/library/'+currentBook.id+'/figure/'+n+'?v='+figStamp} alt=""/><Button component="label" size="small" variant="outlined" disabled={!!busy}>Replace<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;setBusy('fig');setError('');try{await uploadFigure(currentBook.id,n,await figureBlob({path:n,type:f.type,data:await f.arrayBuffer()}));setFigStamp(Date.now());setNotice('Image replaced.');}catch(x){setError((x as Error).message);}finally{setBusy('');}}}/></Button></div>)}</div></>;})()}
  <h2>{L('Home page background')}</h2><p>{L('Current choice')}: {L(book.slide?.mode||'none')}</p><div className="editor-row-actions"><Button variant={book.slide?.fit==='whole'?'outlined':'contained'} disabled={!!busy} onClick={async()=>{setBusy('art');try{setBook({...currentBook,slide:await setSlide(currentBook.id,'keep',undefined,'fill')});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>Fill the frame</Button><Button variant={book.slide?.fit==='whole'?'contained':'outlined'} disabled={!!busy} onClick={async()=>{setBusy('art');try{setBook({...currentBook,slide:await setSlide(currentBook.id,'keep',undefined,'whole')});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>Whole picture, blurred fill</Button></div><div className="editor-row-actions"><TextField size="small" label="Caption on the home page" value={capText} onChange={e=>setCapText(e.target.value)} placeholder="Shown small, in a corner of the slide" sx={{minWidth:260}}/><TextField size="small" label="Link" value={capUrl} onChange={e=>setCapUrl(e.target.value)} placeholder="https://…" sx={{minWidth:240}}/><Button disabled={!!busy} onClick={async()=>{setBusy('art');try{setBook({...currentBook,slide:await setSlide(currentBook.id,'keep',undefined,undefined,{text:capText,url:capUrl})});setNotice('Caption saved.');onSaved();}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>Save caption</Button></div><div className="editor-row-actions"><Button onClick={()=>chooseSlide('none')} disabled={!!busy}>{L('Automatic gallery')}</Button><Button onClick={()=>chooseSlide('cover')} disabled={!!busy}>{L('Use cover')}</Button><Button component="label" disabled={!!busy}>{L('Upload background')}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void backgroundFile(f);e.target.value='';}}/></Button><Button onClick={()=>setPick('background')} disabled={!!busy} startIcon={<AutoAwesomeRounded/>}>{L('Choose a painting with AI')}</Button></div>
  </div>}
  {tab===1&&<div className="editor-panel"><h2>{L('Overview')}</h2><p>{L('Readers see this on the book page.')}</p><Button disabled={!!busy} startIcon={<AutoAwesomeRounded/>} onClick={()=>{const source=doc.chapters.map(c=>{const p=version.chapters[c.id]?.paragraphs||[];return titleFor(c.title,lang)+'\n'+p.slice(0,2).map(x=>x.text).join('\n');}).join('\n\n').slice(0,24000);void assist('overview',source,value=>updateVersion(v=>{v.overview??={paragraphs:[],takeaways:[]};v.overview.paragraphs=[{text:value},...v.overview.paragraphs.slice(1)];}));}}>{L('Draft overview from chapters')}</Button>
   {paragraphs('Overview paragraphs',version.overview?.paragraphs||[],next=>updateVersion(v=>{v.overview??={paragraphs:[],takeaways:[]};v.overview.paragraphs=next;}))}
   {paragraphs('Key ideas',version.overview?.takeaways||[],next=>updateVersion(v=>{v.overview??={paragraphs:[],takeaways:[]};v.overview.takeaways=next;}))}</div>}
  {tab===2&&<div className="editor-panel"><div className="editor-section-head"><h2>{L('Chapters')}</h2><Button startIcon={<AddRounded/>} onClick={()=>update(d=>{const id=crypto.randomUUID();d.chapters.push({id,title:{[lang]:lang==='fa'?'فصل تازه':'New chapter'},group:'main'});})}>{L('Add chapter')}</Button></div><p>{L('Rename, reorder, add, or remove chapters and their summaries.')}</p>
   {doc.chapters.map((c,i)=><section className="editor-chapter" key={c.id}><div className="editor-section-head"><strong>{i+1}. {titleFor(c.title,lang)}</strong><div className="editor-row-actions"><Button size="small" disabled={i===0} onClick={()=>update(d=>{[d.chapters[i-1],d.chapters[i]]=[d.chapters[i],d.chapters[i-1]];})}>{L('Up')}</Button><Button size="small" disabled={i===doc.chapters.length-1} onClick={()=>update(d=>{[d.chapters[i+1],d.chapters[i]]=[d.chapters[i],d.chapters[i+1]];})}>{L('Down')}</Button><IconButton aria-label={L('Delete chapter')+' '+(i+1)} disabled={doc.chapters.length===1} onClick={()=>{if(!confirm(L('Remove this chapter and its summaries from every language?')))return;update(d=>{d.chapters.splice(i,1);d.versions.forEach(v=>{delete v.chapters[c.id];});});}}><DeleteOutlineRounded/></IconButton></div></div>
    <div className="editor-fields"><TextField label={L('Chapter title')+' · '+lang} value={c.title[lang]||''} onChange={e=>update(d=>{d.chapters[i].title[lang]=e.target.value;})} fullWidth/><TextField select label={L('Section')} value={c.group} onChange={e=>update(d=>{d.chapters[i].group=e.target.value as typeof c.group;})}><MenuItem value="main">{L('Main chapter')}</MenuItem><MenuItem value="front">{L('Front matter')}</MenuItem><MenuItem value="back">{L('Back matter')}</MenuItem></TextField></div>
    {paragraphs('Chapter summary',version.chapters[c.id]?.paragraphs||[],next=>updateVersion(v=>{v.chapters[c.id]??={paragraphs:[]};v.chapters[c.id].paragraphs=next;}))}
    {paragraphs('Chapter review',version.chapters[c.id]?.review||[],next=>updateVersion(v=>{v.chapters[c.id]??={paragraphs:[]};v.chapters[c.id].review=next;}))}</section>)}</div>}
  {tab===3&&<div className="editor-panel"><div className="editor-section-head"><h2>{L('Study guide')}</h2><Button startIcon={<AddRounded/>} onClick={()=>updateVersion(v=>{v.guide??={type_label:'Study guide',sections:[]};v.guide.sections.push({kind:'custom',title:lang==='fa'?'بخش تازه':'New section',items:[]});})}>{L('Add section')}</Button></div>
   {version.guide?.sections.map((s,i)=><section className="editor-chapter" key={i}><div className="editor-section-head"><TextField label="Section title" value={s.title} onChange={e=>updateVersion(v=>{v.guide!.sections[i].title=e.target.value;})} fullWidth/><IconButton aria-label={'Delete guide section '+(i+1)} onClick={()=>updateVersion(v=>{v.guide!.sections.splice(i,1);})}><DeleteOutlineRounded/></IconButton></div>{paragraphs('Guide items',s.items,next=>updateVersion(v=>{v.guide!.sections[i].items=next;}))}</section>)}</div>}
  {tab===4&&<div className="editor-panel"><h2>{L('What others say')}</h2><p>{L('Edit the approved reception shown to readers. Check any source or quotation before publishing it.')}</p><Button variant="outlined" startIcon={<AutoAwesomeRounded/>} onClick={()=>setReviewOpen(true)}>{L(doc.review?'Edit or research reception again':'Research reception with AI')}</Button>
   <TextField label="Verdict" multiline minRows={3} value={doc.review?.verdict||''} onChange={e=>update(d=>{if(d.review)d.review.verdict=e.target.value;})} disabled={!doc.review} fullWidth/>
   {doc.review&&<><TextField label="Who this book is for" multiline minRows={2} value={doc.review.audience||''} onChange={e=>update(d=>{d.review!.audience=e.target.value;})} fullWidth sx={{mt:2}}/><TextField label="About the author" multiline minRows={2} value={doc.review.aboutAuthor||''} onChange={e=>update(d=>{d.review!.aboutAuthor=e.target.value;})} fullWidth sx={{mt:2}}/>
    {(['pros','cons','awards'] as const).map(field=><TextField key={field} label={field==='pros'?'Praise (one per line)':field==='cons'?'Criticism (one per line)':'Awards (one per line)'} multiline minRows={3} value={(doc.review?.[field]||[]).join('\n')} onChange={e=>update(d=>{if(d.review)d.review[field]=e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);})} fullWidth sx={{mt:2}}/>)}</>}
   {!doc.review&&<Alert severity="info">No reception has been approved yet. Research and approve it from the book’s local editor, then republish.</Alert>}
  </div>}
  <div className="editor-footer"><Button color="error" disabled={!!busy} onClick={unpublish}>{L('Unpublish book')}</Button><Button variant="contained" disabled={!!busy} onClick={save}>{L(busy==='save'?'Saving…':'Save changes')}</Button></div>
  {pick&&<ArtPicker title={title} author={doc.author} about={about} themes={doc.review?.themes||[]} tags={doc.info?.categories||[]} language={lang==='fa'?'Persian':'English'} initial={null} onAccount={onAccount} onClose={()=>setPick(null)} onPick={useArt}/>}
  {reviewOpen&&<ReviewDialog book={{id:book.id,title:doc.title.en||title,author:doc.author,format:'SUMMARY',category:'book',chapters:[],warnings:[],addedAt:0,lastRead:0,chapterIndex:0,completed:[],color:0,hash:''}} year={doc.info?.year||''} initial={reviewDraft||(doc.review?{review:doc.review,approved:true}:null)} language={lang} onClose={()=>setReviewOpen(false)} onAccount={onAccount} onSave={async value=>{setReviewDraft(value);if(value.approved)update(d=>{d.review=value.review;});setReviewOpen(false);setNotice(value.approved?'Reception draft updated. Save changes to publish it.':'Research draft kept in this editor. Approve it before publishing.');}}/>}
 </div>;
}
