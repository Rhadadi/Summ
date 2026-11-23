import{forwardRef,useState,type ReactNode}from'react';
import{Avatar,Divider,Drawer,IconButton,ListItemIcon,ListItemText,Menu,MenuItem}from'@mui/material';
import{AddRounded,BookmarkBorderRounded,CategoryOutlined,EditNoteRounded,ExpandMoreRounded,HomeOutlined,LanguageRounded,PersonOutlineRounded,VisibilityOutlined,LibraryBooksOutlined,MenuBookOutlined,MenuRounded,SearchRounded,SettingsOutlined,CloudOffRounded,DownloadDoneRounded,EditNoteOutlined}from'@mui/icons-material';
import{useOnline,useSaved}from'./offline';
import{categoryCounts,categoryName}from'./categories';
import{tr,rtl,num}from'./i18n';
import type{Account,PubBook}from'./types';

export function Logo({dark=false}:{dark?:boolean}){
 const drop=dark?'currentColor':'var(--brand)',page=dark?'var(--surface,#fff)':'#fff',dot=dark?'var(--surface,#fff)':'#ffc93c';
 return <svg className="logo-mark" width="28" height="28" viewBox="552 32 176 176" aria-hidden="true"><path d="M640 40C640 40 580 100 580 140a60 60 0 0 0 120 0C700 100 640 40 640 40Z" fill={drop}/><path d="M604 148Q622 136 638 147V178Q622 167 604 178Z" fill={page}/><path d="M676 148Q658 136 642 147V178Q658 167 676 178Z" fill={page}/><path d="M640 98L651 109L640 120L629 109Z" fill={dot}/></svg>;
}
// Full logo: Persian name, English name, optional tagline, and the ink-drop mark. Text follows the theme.
export function Lockup({tagline=false,className='lockup'}:{tagline?:boolean;className?:string}){
 const fa='"Vazirmatn Variable",Vazirmatn,sans-serif';
 return <svg className={className} style={{direction:'ltr',letterSpacing:0,wordSpacing:0,textTransform:'none',fontStyle:'normal'}} viewBox={tagline?'190 30 520 190':'190 30 520 172'} role="img" aria-label="Inkling">
  <path d="M640 40C640 40 580 100 580 140a60 60 0 0 0 120 0C700 100 640 40 640 40Z" fill="var(--brand)"/>
  <path d="M604 148Q622 136 638 147V178Q622 167 604 178Z" fill="#fff"/>
  <path d="M676 148Q658 136 642 147V178Q658 167 676 178Z" fill="#fff"/>
  <path d="M640 98L651 109L640 120L629 109Z" fill="#ffc93c"/>
  <text x="530" y="124" textAnchor="end" fontFamily={fa} fontSize="92" fontWeight="800" fill="currentColor">اینکلینگ</text>
  <text x="530" y="176" textAnchor="end" fontFamily={fa} fontSize="46" fontWeight="800" letterSpacing="-1"><tspan fill="var(--brand)">ink</tspan><tspan fill="currentColor">ling</tspan></text>
  {tagline&&<text x="530" y="212" textAnchor="end" fontFamily={fa} fontSize="20" fill="currentColor" opacity=".7">خلاصهٔ کتاب‌ها به فارسی</text>}
 </svg>;
}
// Account, settings and language in one place: the top corner (left in Persian). One button, one short menu.
function AccountMenu({lang,account,onAccount,onSettings,onLanguage,go}:{lang:string;account:Account|null;onAccount:()=>void;onSettings:()=>void;onLanguage:(lang:'fa'|'en')=>void;go:(path:string)=>void}){
 const saved=useSaved();
 const L=(text:string)=>tr(lang,text);
 const[anchor,setAnchor]=useState<HTMLElement|null>(null),close=()=>setAnchor(null),pick=(fn:()=>void)=>()=>{close();fn();};
 const name=account?.user.name||'';
 return <>
  <button className={'acct-btn'+(account?' in':'')} aria-haspopup="menu" aria-expanded={!!anchor} aria-label={L('Account and settings')} onClick={e=>setAnchor(e.currentTarget)}>
   {account?<Avatar className="acct-avatar">{name.slice(0,1).toUpperCase()}</Avatar>:<PersonOutlineRounded className="acct-person"/>}
   <span className="acct-label">{account?name.split(/\s+/)[0]:L('Log in')}</span>
   <SettingsOutlined className="acct-gear"/><ExpandMoreRounded className="acct-chev"/>
  </button>
  <Menu dir={rtl(lang)?'rtl':'ltr'} lang={lang} anchorEl={anchor} open={!!anchor} onClose={close} slotProps={{paper:{className:'acct-menu'}}} anchorOrigin={{vertical:'bottom',horizontal:rtl(lang)?'left':'right'}} transformOrigin={{vertical:'top',horizontal:rtl(lang)?'left':'right'}}>
   <div className="acct-head" dir="auto">{account?<><strong>{name}</strong><small>{account.user.email}</small></>:<><strong>{L('Welcome')}</strong><small>{L('Sign in to save your place and get new books first.')}</small></>}</div>
   <Divider/>
   <MenuItem onClick={pick(onAccount)}><ListItemIcon><PersonOutlineRounded fontSize="small"/></ListItemIcon><ListItemText>{account?L('Your account'):L('Log in or sign up')}</ListItemText></MenuItem>
   <MenuItem onClick={pick(()=>go('/notebook'))}><ListItemIcon><EditNoteOutlined fontSize="small"/></ListItemIcon><ListItemText primary={L('Notebook')} secondary={L('Your notes, in your own words')}/></MenuItem>
   {saved.length>0&&<MenuItem onClick={pick(()=>go('/library/saved'))}><ListItemIcon><DownloadDoneRounded fontSize="small"/></ListItemIcon><ListItemText primary={L('Saved on this device')} secondary={num(lang,saved.length)+' '+L(saved.length===1?'book':'books')+' · '+L('read without internet')}/></MenuItem>}
   <MenuItem onClick={pick(onSettings)}><ListItemIcon><SettingsOutlined fontSize="small"/></ListItemIcon><ListItemText primary={L('Settings')} secondary={L('Fonts, reading, newsletter, requests')}/></MenuItem>
   <MenuItem onClick={pick(()=>onLanguage(lang==='fa'?'en':'fa'))}><ListItemIcon><LanguageRounded fontSize="small"/></ListItemIcon><ListItemText>{lang==='fa'?'English':'فارسی'}</ListItemText></MenuItem>
  </Menu>
 </>;
}
interface Props{books?:PubBook[]|null;lang:string;onLanguage:(lang:'fa'|'en')=>void;route:string;canEdit:boolean;isEditor:boolean;asVisitor:boolean;onToggleVisitor:()=>void;account:Account|null;query:string;onQuery:(value:string)=>void;navigate:(path:string)=>void;onAdd:()=>void;onSettings:()=>void;onAccount:()=>void;children:ReactNode}
// Sidebar navigation with a search bar on top; the reader uses its own full-screen layout instead.
const Shell=forwardRef<HTMLInputElement,Props>(function Shell({books,lang,onLanguage,route,canEdit,isEditor,asVisitor,onToggleVisitor,account,query,onQuery,navigate,onAdd,onSettings,onAccount,children},search){
 const L=(text:string)=>tr(lang,text);
 const[open,setOpen]=useState(false),[searching,setSearching]=useState(false),[catAnchor,setCatAnchor]=useState<HTMLElement|null>(null);
 const shelves=books?categoryCounts(books):[];
 // The home page has no side panel on wide screens: its links live in a slim top bar and the picture gets the full width.
 // Every page a reader sees (home, library, categories, a book) has the same slim top bar; the editor's own pages keep the side panel.
 const topNav=route==='/'||route==='/notebook'||/^\/b\/[^/]+$/.test(route)||route==='/library'||route.startsWith('/library/'),here:string=route;
 const go=(path:string)=>{setOpen(false);navigate(path);};
 const online=useOnline();
 const item=(path:string,label:string,icon:ReactNode,active:boolean)=><button className={'side-item'+(active?' on':'')} aria-current={active?'page':undefined} onClick={()=>go(path)}>{icon}<span>{L(label)}</span></button>;
 const nav=<nav className="side" aria-label={L('Main')}>
  <button className="side-brand" aria-label="Inkling" onClick={()=>go('/')}><Lockup/></button>
  <label className="search2 drawer-search"><input type="search" aria-label={L('Search your library')} placeholder={L('Search your library')} value={query} onChange={e=>{onQuery(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter')setOpen(false);}}/><span aria-hidden="true"><SearchRounded/></span></label>
  {item('/','For you',<HomeOutlined/>,route==='/')}
  {item('/library','Library',<MenuBookOutlined/>,route==='/library'||route.startsWith('/b/'))}
  {canEdit&&<>{item('/workspace','Workspace',<LibraryBooksOutlined/>,route==='/workspace'||route.startsWith('/book/'))}
  {item('/saved','Saved passages',<BookmarkBorderRounded/>,route==='/saved')}
  <button className="side-item" onClick={()=>{setOpen(false);onAdd();}}><AddRounded/><span>Add a book</span></button></>}
  {isEditor&&<button className="side-item" onClick={()=>{setOpen(false);onToggleVisitor();}}>{asVisitor?<EditNoteRounded/>:<VisibilityOutlined/>}<span>{L(asVisitor?'Back to editing':'View as visitor')}</span></button>}
 </nav>;
 const link=(path:string,label:string,active:boolean)=><button className={'tn-link'+(active?' on':'')} aria-current={active?'page':undefined} onClick={()=>go(path)}>{L(label)}</button>;
 return <div className={'shell'+(topNav?' topnav':'')} lang={lang} dir={rtl(lang)?'rtl':'ltr'}>
  <aside className="shell-side">{nav}</aside>
  <Drawer open={open} onClose={()=>setOpen(false)} slotProps={{paper:{className:'side-drawer'}}}>{nav}</Drawer>
  <div className="shell-main">
   {topNav&&<header className="topnav-bar">
    <button className="tn-logo" aria-label="Inkling" onClick={()=>go('/')}><Lockup/></button>
    <nav className="tn-links" aria-label={L('Main')}>
     <button className={'tn-link'+(here==='/library'||here.startsWith('/b/')?' on':'')} aria-current={here==='/library'?'page':undefined} onClick={()=>go('/library')}><MenuBookOutlined/>{L('Library')}</button>
     {shelves.length>0&&<><button className={'tn-link'+(here.startsWith('/library/c/')?' on':'')} aria-haspopup="menu" aria-expanded={!!catAnchor} onClick={e=>setCatAnchor(e.currentTarget)}><CategoryOutlined/>{L('Categories')}<ExpandMoreRounded className="tn-chev"/></button>
      <Menu dir={rtl(lang)?'rtl':'ltr'} lang={lang} anchorEl={catAnchor} open={!!catAnchor} onClose={()=>setCatAnchor(null)} slotProps={{paper:{className:'acct-menu'}}}>{shelves.map(({category,count})=><MenuItem key={category.id} onClick={()=>{setCatAnchor(null);go('/library/c/'+category.id);}}><ListItemText>{categoryName(category,lang)}</ListItemText><span className="tn-count">{num(lang,count)}</span></MenuItem>)}</Menu></>}
     {canEdit&&<><span className="tn-sep" aria-hidden="true"/>
      <button className="tn-link" onClick={()=>go('/workspace')}><LibraryBooksOutlined/>{L('Workspace')}</button>
      <button className="tn-link" onClick={()=>go('/saved')}><BookmarkBorderRounded/>{L('Saved passages')}</button>
      <button className="tn-link tn-add" onClick={onAdd}><AddRounded/>{L('Add a book')}</button></>}
     {isEditor&&<button className={'tn-link'+(asVisitor?' on':'')} aria-pressed={asVisitor} onClick={onToggleVisitor}>{asVisitor?<EditNoteRounded/>:<VisibilityOutlined/>}{asVisitor?L('Back to editing'):L('View as visitor')}</button>}
    </nav>
    <span className="tn-grow"/>
    {searching?<label className="tn-search"><input autoFocus type="search" aria-label={L('Search your library')} placeholder={L('Search your library')} value={query} onChange={e=>onQuery(e.target.value)} onBlur={()=>{if(!query)setSearching(false);}} onKeyDown={e=>{if(e.key==='Escape')setSearching(false);}}/></label>:null}
    <IconButton className="tn-icon" aria-label={L('Search your library')} onClick={()=>setSearching(v=>!v)}><SearchRounded/></IconButton>
    {!online&&<span className="offline-pill" role="status" title={L('No connection. Saved books and pages you opened still work.')}><CloudOffRounded/><span>{L('Offline')}</span></span>}
    <AccountMenu lang={lang} account={account} onAccount={onAccount} onSettings={onSettings} onLanguage={onLanguage} go={go}/>
   </header>}
   <header className="topbar2">
    <IconButton className="topbar-menu" aria-label={L('Open menu')} onClick={()=>setOpen(true)}><MenuRounded/></IconButton>
    <button className="topbar-logo" aria-label="Inkling" onClick={()=>go('/')}><Lockup/></button>
    <label className="search2 desktop-search"><input ref={search} type="search" aria-label={L('Search your library')} placeholder={L('Search your library')} value={query} onChange={e=>onQuery(e.target.value)}/><span aria-hidden="true"><SearchRounded/></span></label>
   {asVisitor&&<button className="visitor-pill" onClick={onToggleVisitor} title={L('You are seeing the site as a visitor does. Editing tools are hidden.')}><EditNoteRounded/><span>{L('Back to editing')}</span></button>}
   {!online&&<span className="offline-pill" role="status" title={L('No connection. Saved books and pages you opened still work.')}><CloudOffRounded/><span>{L('Offline')}</span></span>}<AccountMenu lang={lang} account={account} onAccount={onAccount} onSettings={onSettings} onLanguage={onLanguage} go={go}/></header>
   <main id="main-content" tabIndex={-1}>{children}</main>
  </div>
 </div>;
});
export default Shell;
