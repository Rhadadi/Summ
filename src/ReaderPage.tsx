import{useEffect,useMemo,useRef,useState}from'react';
import{sized,srcSet}from'./img';
import{Alert,Button,CircularProgress,Drawer,IconButton,LinearProgress,Menu,MenuItem,Popover,Switch,TextField,useMediaQuery}from'@mui/material';
import{ChevronLeftRounded,ChevronRightRounded,CloseRounded,ArrowBackIosNewRounded,AutoAwesomeRounded,BookmarkBorderRounded,BookmarkRounded,ExpandMoreRounded,FormatListBulletedRounded,PlayArrowRounded,TextFieldsRounded,TuneRounded}from'@mui/icons-material';
import{Lockup}from'./Shell';
import{enFonts,faFonts,lastPlace,readingStyle,savePlace,useReading,type Reading}from'./reading';
import type{Account,Block,Book,Chapter,Depth,SavedPassage,Settings,Summary,SummaryParagraph}from'./types';
import{bodyChapter,bookWords,depthLabels,isHeading,languages,sectionKind}from'./core';
import{costRange,estimateChapter,money,usageCost}from'./cost';
import type{Price}from'./cost';
import{num,rtl as isRtl,tr}from'./i18n';
import{chapterTitle,mainChapters,strip,type BookData}from'./bookData';
import type{Backdrop}from'./MuseumHero';

interface Props{
 book:Book;chapter:Chapter;section:string;settings:Settings;account:Account|null;price:Price|null;saved:SavedPassage[];data:BookData;
 summary:Summary|null;generating:boolean;generationError:string;
 onPreferences:(patch:Partial<Settings>)=>void;onGenerate:()=>void;onCancel:()=>void;onBookmark:(block:Block,wording:string,chapter:Chapter)=>void;onEvidence:(block:Block,wording:string,chapter:Chapter)=>void;
 onChoose:(index:number)=>void;onSection:(section:string)=>void;onBack:()=>void;onHome:()=>void;onListen:(chapterId?:string)=>void;onCreate:()=>void;cover?:string;
 readOnly?:boolean;backdrop?:Backdrop;
}
const rtl=(lang?:string)=>lang&&['fa','ar'].includes(lang)?'rtl':'ltr';
export default function ReaderPage(p:Props){
 const{book,chapter,section,settings,data,account}=p;
 const[guideOpen,setGuideOpen]=useState(false);
 const[zoom,setZoom]=useState<{src:string;alt:string}|null>(null);
 const[view,setView]=useState<'summary'|'original'>('summary'),[list,setList]=useState(false),[more,setMore]=useState(false);
 const[opts,setOpts]=useState<HTMLElement|null>(null),[depthMenu,setDepthMenu]=useState<HTMLElement|null>(null);
 const top=useRef<HTMLDivElement>(null);
 const[reading,setReading]=useReading(),[look,setLook]=useState<HTMLElement|null>(null),phone=useMediaQuery('(max-width:699px)');
 // Reopening a chapter returns to where the reader stopped; moving on starts at the top.
 useEffect(()=>{
  const place=!section?lastPlace(book.id):null;
  const y=place&&place.chapterId===chapter.id?place.y:0;
  const t=setTimeout(()=>window.scrollTo({top:y}),60);
  if(!section)savePlace(book.id,chapter.id,y);
  let pending=0;
  const keep=()=>{if(section)return;clearTimeout(pending);pending=window.setTimeout(()=>savePlace(book.id,chapter.id,window.scrollY),400);};
  window.addEventListener('scroll',keep,{passive:true});
  return()=>{clearTimeout(t);clearTimeout(pending);window.removeEventListener('scroll',keep);};
 },[book.id,chapter.id,section]);
 const main=mainChapters(book),kinds=book.chapters.map((c,i)=>sectionKind(c,i,book.chapters));
 const report=data.report;
 const lang=data.version?.language||report?.language||Object.values(data.summaries)[0]?.language||settings.language,L=(t:string)=>tr(lang,t);

 const guideItems=[...(report?.overview?[{id:'overview',label:L('Overview and key takeaways')}]:[]),...(report?.guide?.sections||[]).map(s=>({id:'g:'+s.kind,label:L(s.title)}))];
 const isChapter=!section;
 const summary=isChapter?(p.summary||data.summaries[chapter.id]||null):null;
 const index=main.indexOf(chapter);
 const kept=(b:Block)=>p.saved.some(s=>s.bookId===book.id&&s.blockId===b.id);
 const estimate=p.price?costRange(estimateChapter(chapter,settings),p.price).likely:null;
 const spent=usageCost(summary?.usage,p.price);
 const aiLabel=!account?'Log in to summarize':!account.key?'Add your Gemini key':summary?'Summarize again':'Summarize this chapter';
 function choose(c:Chapter){setList(false);p.onChoose(book.chapters.indexOf(c));}
 // Pictures that came with an imported summary live in this browser; each gets a temporary address while the page is open.
 const pictures=useMemo(()=>Object.fromEntries((data.version?.images||[]).map(i=>[i.path,URL.createObjectURL(new Blob([i.data],{type:i.type}))])),[data.version]);
 useEffect(()=>()=>{for(const u of Object.values(pictures))URL.revokeObjectURL(u);},[pictures]);
 // Neighbouring pages become one chip ("pp. 16–24") so a long passage does not trail a row of numbers.
 function refs(x:SummaryParagraph,c?:Chapter){
  if(p.readOnly&&c)return null;
  if(!c)return <span className="refs">{x.evidence_ids.map(id=>{const ch=book.chapters.find(y=>y.id===id);return ch?<button key={id} onClick={()=>choose(ch)}>{strip(ch.title).slice(0,40)}</button>:null;})}</span>;
  const found=[...new Map([...x.evidence_ids.map(id=>c.blocks.find(b=>b.id===id)),...(x.pages||[]).map(n=>c.blocks.find(y=>y.page===n&&!y.note))].filter((b):b is Block=>!!b).map(b=>[b.page??b.id,b])).values()].sort((a,b)=>(a.page??1e9)-(b.page??1e9));
  const groups:Block[][]=[];for(const b of found){const g=groups[groups.length-1];if(g&&b.page&&g[g.length-1].page&&b.page-g[g.length-1].page!<=1)g.push(b);else groups.push([b]);}
  const shown=(x.pages||[]).filter(n=>!found.some(b=>b.page===n));
  return <span className="refs">{groups.map(g=>{const a=g[0].page,z=g[g.length-1].page,label=!a?'¶':a===z?'p. '+a:'pp. '+a+'–'+z;return p.readOnly?<span className="pg-chip" key={g[0].id}>{label}</span>:<button key={g[0].id} onClick={()=>p.onEvidence(g[0],g[0].text,c)}>{label}</button>;})}{shown.map(n=><span className="pg-chip" key={'p'+n}>p. {n}</span>)}</span>;
 }
 function paragraphs(items:SummaryParagraph[],c?:Chapter){
  return items.map((x,i)=>x.image&&(pictures[x.image.path]||x.image.path.startsWith('/api/'))?<figure className="r2-fig" key={i}><button className="r2-zoom" aria-label={L('Enlarge')+': '+(x.image.alt||x.text)} onClick={()=>setZoom({src:pictures[x.image!.path]||x.image!.path,alt:x.image!.alt||x.text})}><img src={pictures[x.image.path]||sized(x.image.path,1280)} srcSet={pictures[x.image.path]?undefined:srcSet(x.image.path)} sizes="(max-width:800px) 100vw, 760px" alt={x.image.alt} loading="lazy"/></button><figcaption dir="auto">{x.text}</figcaption></figure>
   :x.quote?<blockquote className="r2-quote" key={i} dir="auto">{x.heading&&<h2>{x.heading}</h2>}{x.text}{refs(x,c)}</blockquote>
   :x.table?<div className="r2-p r2-table" key={i}>{x.heading&&<h2 dir="auto">{x.heading}</h2>}<div className="r2-scroll"><table><thead><tr>{x.table[0].map((h,j)=><th key={j} dir="auto">{h}</th>)}</tr></thead><tbody>{x.table.slice(1).map((r,j)=><tr key={j}>{r.map((v,k)=><td key={k} dir="auto">{v}</td>)}</tr>)}</tbody></table></div></div>
   :<div className="r2-p" key={i}>{x.heading&&<h2 dir="auto">{x.heading}</h2>}<p dir="auto">{x.text}{refs(x,c)}</p></div>);
 }
 // Original text reads as a book page: headings, flowing paragraphs, page numbers in the margin, notes at the end.
 function original(c:Chapter){
  let page:number|undefined;const notes=c.blocks.filter(b=>b.note);
  const words=(t:string)=>new Set(t.toLowerCase().match(/\p{L}{3,}/gu)||[]);const titleWords=words(c.title);
  const body=c.blocks.filter(b=>!b.note);
  const first=body[0]&&body[0].text.length<300&&[...words(body[0].text)].filter(w=>titleWords.has(w)).length>=Math.min(4,titleWords.size*.7)?1:0;
  return <>{body.slice(first).map(b=>{
   const marker=b.page!==page?b.page:undefined;page=b.page;
   if(isHeading(b.text))return <h2 key={b.id} className="text-h" dir="auto">{b.text}</h2>;
   return <div className="text-p" key={b.id}>{marker&&<button className="folio" onClick={()=>p.onEvidence(b,b.text,c)} aria-label={L('Page')+' '+num(lang,marker)}>{num(lang,marker)}</button>}<p dir="auto">{b.text}</p><IconButton className="keep" size="small" aria-label={L(kept(b)?'Unsave passage':'Save passage')} onClick={()=>p.onBookmark(b,b.text,c)}>{kept(b)?<BookmarkRounded fontSize="inherit"/>:<BookmarkBorderRounded fontSize="inherit"/>}</IconButton></div>;
  })}{notes.length>0&&<details className="notes"><summary>{L('Notes')} ({num(lang,notes.length)})</summary>{notes.map(b=><p key={b.id} dir="auto"><button className="folio-inline" onClick={()=>p.onEvidence(b,b.text,c)}>{L('Page')} {num(lang,b.page||0)}</button> {b.text}</p>)}</details>}</>;
 }
 const row=(c:Chapter)=>{const n=main.includes(c)?main.indexOf(c)+1:Number(c.title.match(/^(\d+)[.\s]/)?.[1]||0);const on=isChapter&&c.id===chapter.id;
  return <button key={c.id} className={'r2-row'+(on?' on':'')+(data.summaries[c.id]||p.readOnly?'':' empty')} aria-current={on?'true':undefined} onClick={()=>choose(c)}><span className="n">{n?num(lang,n):''}</span><span className="t" dir="auto">{chapterTitle(data,c)}</span></button>;};
 // Front and back matter nobody summarized stays out of the way until asked for.
 const ofKind=(k:string)=>book.chapters.filter((_,i)=>kinds[i]===k),shown=(c:Chapter)=>more||!!data.summaries[c.id]||c.id===chapter.id;
 const front=ofKind('front').filter(shown),back=ofKind('back').filter(shown),hidden=[...ofKind('front'),...ofKind('back')].filter(c=>!data.summaries[c.id]&&c.id!==chapter.id).length;
 const panel=<nav className="r2-list" aria-label={L('Contents')}>
  <button className="r2-brand" aria-label="Inkling" onClick={p.onHome}><Lockup/></button>
  <button className="r2-bookline" onClick={p.onBack}>{p.cover?<img src={sized(p.cover,320)} alt=""/>:<span className="r2-nocover"/>}<span><small>{L('Back to the book')}</small><strong dir="auto">{(data.version?.bookTitle||book.title).split(':')[0]}</strong></span></button>
  {front.length>0&&<><p className="r2-head">{lang==='fa'?'پیش از فصل‌ها':'Before the chapters'}</p>{front.map(row)}</>}
  <p className="r2-head">{L('Chapters')}</p>
  {main.map(row)}
  {guideItems.length>0&&<><button className="r2-head r2-fold" aria-expanded={guideOpen||guideItems.some(x=>x.id===section)} onClick={()=>setGuideOpen(o=>!o)}>{L('Study guide')}<ExpandMoreRounded/></button>{(guideOpen||guideItems.some(x=>x.id===section))&&guideItems.map(g=><button key={g.id} className={'r2-row'+(section===g.id?' on':'')} onClick={()=>{setList(false);p.onSection(g.id);}}><span className="n"/><span className="t" dir="auto">{g.label}</span></button>)}</>}
  {back.length>0&&<div className="r2-back-list">{back.map(row)}</div>}
  {hidden>0&&<button className="more-toggle" aria-expanded={more} onClick={()=>setMore(!more)}>{L(more?'Hide':'Show')} {L('front matter, notes and index')}</button>}
 </nav>;
 const guideSection=section.startsWith('g:')?report?.guide?.sections.find(s=>'g:'+s.kind===section):undefined;
 const seq=main.includes(chapter)?main:book.chapters,next=seq[seq.indexOf(chapter)+1],prev=seq[seq.indexOf(chapter)-1];
 const curated=p.readOnly&&!!p.backdrop;
 return <div className={'r2 look-'+reading.theme+(reading.zen?' zen':'')+(curated?' curated-reader':'')} lang={lang} dir={isRtl(lang)?'rtl':'ltr'} style={readingStyle(reading)}>
  {reading.zen&&<button className="zen-exit" aria-label={L('Leave zen mode')} onClick={()=>setReading({zen:false})}><CloseRounded/></button>}
  {curated&&<header className="curated-reader-sitebar"><button className="curated-site-brand" aria-label="Inkling" onClick={p.onHome}><Lockup/></button><nav aria-label={L('Main')}><button onClick={p.onBack}>{L('Back to the book')}</button></nav><span className="curated-site-grow"/><IconButton className="curated-site-contents" aria-label={L('Contents')} onClick={()=>setList(true)}><FormatListBulletedRounded/></IconButton><IconButton className="curated-site-aa" aria-label={L('Reading settings')} onClick={e=>setLook(e.currentTarget)}><TextFieldsRounded/></IconButton></header>}
  <aside className="r2-side">{panel}</aside>
  <Drawer open={list} onClose={()=>setList(false)} slotProps={{paper:{className:'r2-drawer'}}}>{panel}</Drawer>
  <article id="main-content" tabIndex={-1} className="r2-main" ref={top}>
   {!curated&&<div className="r2-mobilebar"><IconButton aria-label={L('Contents')} onClick={()=>setList(true)}><FormatListBulletedRounded/></IconButton><button className="r2-mobile-logo" aria-label="Inkling" onClick={p.onHome}><Lockup/></button></div>}
   {curated&&isChapter&&<div className="curated-chapter-art">
    {p.backdrop!.whole&&<img className="curated-fill" src={p.backdrop!.url} alt="" aria-hidden="true"/>}
    <img className={'curated-art'+(p.backdrop!.whole?' whole':'')+(p.backdrop!.blur?' blurred':'')} src={p.backdrop!.url} srcSet={p.backdrop!.srcset} alt="" style={{objectPosition:p.backdrop!.position}}/>
    <div className="curated-art-shade"/><div className="curated-chapter-inner"><small>{index>=0?(lang==='fa'?'فصل '+num(lang,index+1)+' از '+num(lang,main.length):'Chapter '+(index+1)+' of '+main.length):L('Section')}</small><h1 dir="auto">{chapterTitle(data,chapter)}</h1><div className="curated-chapter-bottom">{summary&&<button onClick={()=>p.onListen(chapter.id)}><PlayArrowRounded/>{L('Listen')}</button>}</div></div>
   </div>}
   <div className="r2-col">
   {section==='overview'&&report?.overview&&<div dir={rtl(report.language)}>
    {!curated&&<div className="r2-bar"><span className="r2-chip">{L('Study guide')}</span><span className="grow"/>{!p.readOnly&&<button className="r2-pill" onClick={()=>{setView('original');p.onChoose(Math.max(0,book.chapters.indexOf(main[0]||book.chapters[0])));}}>{L('Original text')}</button>}<IconButton className="r2-aa" size="small" aria-label={L('Reading settings')} onClick={e=>setLook(e.currentTarget)}><TextFieldsRounded/></IconButton></div>}<h1>{L('Overview')}</h1>
    <div className="r2-box"><strong>{L('Key takeaways')}</strong><ul>{report.overview.takeaways.map((t,i)=><li key={i} dir="auto">{t.text}</li>)}</ul></div>
    {paragraphs(report.overview.paragraphs)}
   </div>}
   {guideSection&&<div dir={rtl(report?.language)}>{!curated&&<div className="r2-bar"><span className="r2-chip">{L('Study guide')}</span><span className="grow"/>{!p.readOnly&&<button className="r2-pill" onClick={()=>{setView('original');p.onChoose(Math.max(0,book.chapters.indexOf(main[0]||book.chapters[0])));}}>{L('Original text')}</button>}<IconButton className="r2-aa" size="small" aria-label={L('Reading settings')} onClick={e=>setLook(e.currentTarget)}><TextFieldsRounded/></IconButton></div>}<h1 dir="auto">{L(guideSection.title)}</h1>{paragraphs(guideSection.items)}</div>}
   {isChapter&&<>
    {!curated&&<div className="r2-bar"><span className="r2-chip">{index>=0&&<button className="r2-step" disabled={!prev} aria-label={L('Previous')} onClick={()=>prev&&choose(prev)}>{lang==='fa'||lang==='ar'?<ChevronRightRounded/>:<ChevronLeftRounded/>}</button>}<span>{index>=0?(lang==='fa'?'فصل '+num(lang,index+1)+' از '+num(lang,main.length):'Chapter '+(index+1)+' of '+main.length):L('Section')}</span>{index>=0&&<button className="r2-step" disabled={!next} aria-label={L('Next')} onClick={()=>next&&choose(next)}>{lang==='fa'||lang==='ar'?<ChevronLeftRounded/>:<ChevronRightRounded/>}</button>}</span><span className="grow"/>
     {!p.readOnly&&<div className="r2-switch" role="group" aria-label="View"><button aria-pressed={view==='summary'} className={view==='summary'?'on':''} onClick={()=>setView('summary')}>{L('Summary')}</button><button aria-pressed={view==='original'} className={view==='original'?'on':''} onClick={()=>setView('original')}>{L('Original')}</button></div>}
     {summary&&<button className="r2-pill" aria-label={L('Listen')} onClick={()=>p.onListen(chapter.id)}><PlayArrowRounded/><span>{L('Listen')}</span></button>}
     <IconButton className="r2-aa" size="small" aria-label={L('Reading settings')} onClick={e=>setLook(e.currentTarget)}><TextFieldsRounded/></IconButton>
    </div>}
    {!curated&&<h1 dir="auto" className={chapterTitle(data,chapter).length>48?'long':undefined}>{chapterTitle(data,chapter)}</h1>}
    {view==='summary'&&(summary?<>
     {!p.readOnly&&<div className="r2-meta">{spent!=null&&<span>{money(spent)}</span>}<span className="grow"/>
      {!p.readOnly&&summary.model!=='imported'&&<><Button size="small" onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button>
      <Button size="small" startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button>
      <Button size="small" disabled={p.generating} onClick={p.onGenerate}>{p.generating?'Summarizing…':'Redo'}</Button></>}</div>}
     {p.generating&&<div className="doc-status"><LinearProgress/><span>Summarizing… <button onClick={p.onCancel}>Cancel</button></span></div>}
     <div dir={rtl(summary.language)}>{paragraphs(summary.paragraphs,chapter)}{summary.review.length>0&&<><h2 className="r2-sub">Critique</h2>{paragraphs(summary.review,chapter)}</>}</div></>
    :p.readOnly?<div className="r2-box"><strong>{L('This chapter isn’t part of the published summary')}</strong><p>{L('Pick another chapter from the list.')}</p></div>
    :<div className="r2-box" dir="ltr">
     <strong>This chapter isn’t summarized yet</strong>
     <p>{bookWords({...book,chapters:[bodyChapter(chapter)]}).toLocaleString()} words{estimate!=null?' · about '+money(estimate)+' with your Gemini key':''}. Or read the original text.</p>
     <div className="box-actions"><Button variant="contained" startIcon={p.generating?<CircularProgress size={16} color="inherit"/>:<AutoAwesomeRounded/>} disabled={p.generating} onClick={p.onGenerate}>{p.generating?'Summarizing…':aiLabel}</Button><Button onClick={e=>setDepthMenu(e.currentTarget)} endIcon={<ExpandMoreRounded/>}>{depthLabels[settings.depth]}</Button><Button startIcon={<TuneRounded/>} onClick={e=>setOpts(e.currentTarget)}>Options</Button><Button onClick={()=>setView('original')}>Read the original</Button></div>
     {p.generating&&<div className="doc-status"><LinearProgress/><span>Reading the chapter and checking each paragraph against it… <button onClick={p.onCancel}>Cancel</button></span></div>}
     {p.generationError&&<Alert severity="error" sx={{mt:2}}>{p.generationError}</Alert>}
     {main.length>1&&!data.report&&<p className="muted small">Want every chapter? <button className="text-link2 inline" onClick={p.onCreate}>Create the whole study guide</button></p>}
    </div>)}
    {view==='original'&&original(chapter)}
    <nav className="doc-pager" aria-label="Chapters">{prev?<button className="pg prev" onClick={()=>choose(prev)}><small>{L('Previous')}</small><span dir="auto">{chapterTitle(data,prev)}</span></button>:<span/>}{next?<button className="pg next" onClick={()=>choose(next)}><small>{L('Next')}</small><span dir="auto">{chapterTitle(data,next)}</span></button>:<span/>}</nav>
   </>}
   </div>
  </article>
  {zoom&&<div className="lightbox" role="dialog" aria-modal="true" aria-label={zoom.alt} onClick={()=>setZoom(null)} onKeyDown={e=>{if(e.key==='Escape')setZoom(null);}}>
   <button className="lightbox-x" autoFocus aria-label={L('Close')} onClick={()=>setZoom(null)}><CloseRounded/></button>
   <img src={zoom.src} alt={zoom.alt} onClick={e=>e.stopPropagation()}/>
   {zoom.alt&&<p onClick={e=>e.stopPropagation()} dir="auto">{zoom.alt}</p>}
  </div>}
  <Menu anchorEl={depthMenu} open={!!depthMenu} onClose={()=>setDepthMenu(null)}>{(Object.keys(depthLabels) as Depth[]).map(d=><MenuItem key={d} selected={d===settings.depth} onClick={()=>{p.onPreferences({depth:d});setDepthMenu(null);}}>{depthLabels[d]}</MenuItem>)}</Menu>
  {phone?<Drawer anchor="bottom" open={!!look} onClose={()=>setLook(null)} slotProps={{paper:{className:'look-sheet'}}}><ReadingPanel lang={lang} reading={reading} onChange={setReading} onClose={()=>setLook(null)}/></Drawer>
  :<Popover open={!!look} anchorEl={look} onClose={()=>setLook(null)} disableRestoreFocus disableScrollLock slotProps={{paper:{className:'look-pop'}}}><ReadingPanel lang={lang} reading={reading} onChange={setReading} onClose={()=>setLook(null)}/></Popover>}
  <Popover open={!!opts} anchorEl={opts} onClose={()=>setOpts(null)} slotProps={{paper:{className:'opts-pop'}}}>
   <TextField select size="small" fullWidth label="Purpose" value={settings.purpose} onChange={e=>p.onPreferences({purpose:e.target.value as Settings['purpose']})}><MenuItem value="understand">Understand</MenuItem><MenuItem value="learn">Learn</MenuItem><MenuItem value="academic">Academic</MenuItem><MenuItem value="apply">Apply</MenuItem></TextField>
   <TextField select size="small" fullWidth label="Summary language" value={settings.language} onChange={e=>p.onPreferences({language:e.target.value})}>{languages.map(l=><MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}</TextField>
   <label className="opts-switch"><span>Include critique</span><Switch checked={settings.review==='internal'} onChange={e=>p.onPreferences({review:e.target.checked?'internal':'off'})}/></label>
  </Popover>
 </div>;
}

// Size, spacing, width, page colour and fonts for Persian and English text.
// The font lists open only on request, so the panel fits a phone.
function ReadingPanel({lang,reading,onChange,onClose}:{lang:string;reading:Reading;onChange:(patch:Partial<Reading>)=>void;onClose:()=>void}){
 const L=(text:string)=>tr(lang,text);
 const seg=<K extends keyof Reading>(key:K,options:[Reading[K],string][])=><div className="look-seg" role="group">{options.map(([v,l])=><button key={String(v)} aria-pressed={reading[key]===v} className={reading[key]===v?'on':''} onClick={()=>onChange({[key]:v} as Partial<Reading>)}>{L(l)}</button>)}</div>;
 const[fontsOpen,setFontsOpen]=useState(false);
 const current=faFonts.find(f=>f.id===reading.fa),currentEn=enFonts.find(f=>f.id===reading.en);
 return <div className="look" lang={lang} dir={lang==='fa'?'rtl':'ltr'}>
  <div className="look-head"><strong>{L('Reading settings')}</strong><IconButton size="small" aria-label={L('Close')} onClick={onClose}><CloseRounded/></IconButton></div>
  <div className="look-size"><button aria-label={L('Smaller text')} onClick={()=>onChange({size:Math.max(14,reading.size-1)})}>A</button><input type="range" min={14} max={30} value={reading.size} aria-label={L('Text size')} onChange={e=>onChange({size:+e.target.value})}/><button aria-label={L('Larger text')} className="big" onClick={()=>onChange({size:Math.min(30,reading.size+1)})}>A</button></div>
  <div className="look-themes" role="group" aria-label={L('Page colour')}>{(['paper','white','sepia','night'] as const).map(t=><button key={t} aria-label={L(t)} aria-pressed={reading.theme===t} className={'sw sw-'+t+(reading.theme===t?' on':'')} onClick={()=>onChange({theme:t})}>Aa</button>)}</div>
  <label>{L('Line spacing')}</label>{seg('leading',[['tight','Compact'],['normal','Normal'],['airy','Airy']])}
  <label>{L('Page width')}</label>{seg('width',[['narrow','Narrow'],['medium','Medium'],['wide','Wide']])}
  <button className="look-fold" aria-expanded={fontsOpen} onClick={()=>setFontsOpen(!fontsOpen)}><span>{L('Fonts')}</span><small>{current?.label.split(' · ')[0]} · {currentEn?.label}</small></button>
  {fontsOpen&&<>
  <label>{L('Persian font')}</label>
  <div className="look-fonts">{faFonts.map(f=><button key={f.id} className={reading.fa===f.id?'on':''} onClick={()=>onChange({fa:f.id})} style={{fontFamily:f.family+',"Vazirmatn Variable"'}}><span dir="rtl">زندگی پیش از مرگ</span><small>{f.label}</small></button>)}</div>
  <label>{L('English font')}</label>
  <div className="look-fonts en">{enFonts.map(f=><button key={f.id} className={reading.en===f.id?'on':''} onClick={()=>onChange({en:f.id})} style={{fontFamily:f.family}}><span>The examined life</span><small>{f.label}</small></button>)}</div>
  </>}
  <label className="look-switch"><input type="checkbox" checked={reading.zen} onChange={e=>{onChange({zen:e.target.checked});if(e.target.checked)onClose();}}/> {L('Zen mode')} <small>— {L('only the text, nothing else')}</small></label>
  <label className="look-switch"><input type="checkbox" checked={reading.justify} onChange={e=>onChange({justify:e.target.checked})}/> {L('Justify text')}</label>
 </div>;
}
