import{forwardRef,useState,type ReactNode}from'react';
import{Avatar,Drawer,IconButton}from'@mui/material';
import{AddRounded,BookmarkBorderRounded,EditNoteRounded,HomeOutlined,VisibilityOutlined,LibraryBooksOutlined,MenuBookOutlined,MenuRounded,SearchRounded,SettingsOutlined}from'@mui/icons-material';
import{tr,rtl}from'./i18n';
import type{Account}from'./types';

export function Logo({dark=false}:{dark?:boolean}){
 const drop=dark?'currentColor':'#ff5a3c',page=dark?'var(--surface,#fff)':'#fff',dot=dark?'var(--surface,#fff)':'#ffc93c';
 return <svg className="logo-mark" width="28" height="28" viewBox="552 32 176 176" aria-hidden="true"><path d="M640 40C640 40 580 100 580 140a60 60 0 0 0 120 0C700 100 640 40 640 40Z" fill={drop}/><path d="M604 148Q622 136 638 147V178Q622 167 604 178Z" fill={page}/><path d="M676 148Q658 136 642 147V178Q658 167 676 178Z" fill={page}/><path d="M640 98L651 109L640 120L629 109Z" fill={dot}/></svg>;
}
interface Props{lang:string;onLanguage:(lang:'fa'|'en')=>void;route:string;canEdit:boolean;isEditor:boolean;asVisitor:boolean;onToggleVisitor:()=>void;account:Account|null;query:string;onQuery:(value:string)=>void;navigate:(path:string)=>void;onAdd:()=>void;onSettings:()=>void;onAccount:()=>void;children:ReactNode}
// Sidebar navigation with a search bar on top; the reader uses its own full-screen layout instead.
const Shell=forwardRef<HTMLInputElement,Props>(function Shell({lang,onLanguage,route,canEdit,isEditor,asVisitor,onToggleVisitor,account,query,onQuery,navigate,onAdd,onSettings,onAccount,children},search){
 const L=(text:string)=>tr(lang,text);
 const[open,setOpen]=useState(false);
 const go=(path:string)=>{setOpen(false);navigate(path);};
 const item=(path:string,label:string,icon:ReactNode,active:boolean)=><button className={'side-item'+(active?' on':'')} aria-current={active?'page':undefined} onClick={()=>go(path)}>{icon}<span>{L(label)}</span></button>;
 const nav=<nav className="side" aria-label={L('Main')}>
  <button className="side-brand" onClick={()=>go('/')}><Logo/><span>Inkling</span></button>
  {item('/','For you',<HomeOutlined/>,route==='/')}
  {item('/library','Library',<MenuBookOutlined/>,route==='/library'||route.startsWith('/b/'))}
  {canEdit&&<>{item('/workspace','Workspace',<LibraryBooksOutlined/>,route==='/workspace'||route.startsWith('/book/'))}
  {item('/saved','Saved passages',<BookmarkBorderRounded/>,route==='/saved')}
  <button className="side-item" onClick={()=>{setOpen(false);onAdd();}}><AddRounded/><span>Add a book</span></button></>}
  {isEditor&&<button className="side-item" onClick={()=>{setOpen(false);onToggleVisitor();}}>{asVisitor?<EditNoteRounded/>:<VisibilityOutlined/>}<span>{asVisitor?'Back to editing':'View as visitor'}</span></button>}
  <hr/>
  <button className="side-item" onClick={()=>{setOpen(false);onSettings();}}><SettingsOutlined/><span>{L('Settings')}</span></button>
  <button className="side-item" onClick={()=>{setOpen(false);onAccount();}}>{account?<Avatar className="side-avatar">{account.user.name.slice(0,1).toUpperCase()}</Avatar>:<span className="side-avatar empty"/>}<span>{account?account.user.name:L('Log in')}</span></button>
 </nav>;
 return <div className="shell" lang={lang} dir={rtl(lang)?'rtl':'ltr'}>
  <aside className="shell-side">{nav}</aside>
  <Drawer open={open} onClose={()=>setOpen(false)} slotProps={{paper:{className:'side-drawer'}}}>{nav}</Drawer>
  <div className="shell-main">
   <header className="topbar2">
    <IconButton className="topbar-menu" aria-label={L('Open menu')} onClick={()=>setOpen(true)}><MenuRounded/></IconButton>
    <label className="search2"><input ref={search} type="search" aria-label={L('Search your library')} placeholder={L('Search your library')} value={query} onChange={e=>onQuery(e.target.value)}/><span aria-hidden="true"><SearchRounded/></span></label>
   <button className="language-switch" onClick={()=>onLanguage(lang==='fa'?'en':'fa')} aria-label={lang==='fa'?'Switch to English':'تغییر زبان به فارسی'}>{lang==='fa'?'English':'فارسی'}</button></header>
   {asVisitor&&<div className="visitor-bar" role="status"><VisibilityOutlined/><span>You are seeing the site as a visitor does. Editing tools are hidden.</span><button onClick={onToggleVisitor}>Back to editing</button></div>}
   <main id="main-content" tabIndex={-1}>{children}</main>
  </div>
 </div>;
});
export default Shell;
