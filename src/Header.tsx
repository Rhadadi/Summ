import{forwardRef}from'react';
import{Avatar,Button,IconButton}from'@mui/material';
import{SearchRounded,SettingsOutlined}from'@mui/icons-material';
import type{Account}from'./types';

interface Props{account:Account|null;query:string;onQuery:(value:string)=>void;onHome:()=>void;onAccount:()=>void;onSettings:()=>void;onSaved:()=>void}
export function Logo({dark=false}:{dark?:boolean}){
 return <svg className="logo-mark" width="26" height="26" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="7" fill={dark?'currentColor':'#fff'}/><path d="M8 9.5c2.5-1 4.5-1 6 .5 1.5-1.5 3.5-1.5 6-.5v9c-2.5-1-4.5-1-6 .5-1.5-1.5-3.5-1.5-6-.5z" fill="none" stroke={dark?'#fff':'var(--header)'} strokeWidth="1.7" strokeLinejoin="round"/></svg>;
}
const Header=forwardRef<HTMLInputElement,Props>(function Header({account,query,onQuery,onHome,onAccount,onSettings,onSaved},search){
 return <header className="site-header">
  <button className="site-brand" aria-label="Summ home" onClick={onHome}><Logo/><span>Summ</span></button>
  <label className="site-search"><SearchRounded fontSize="small"/><input ref={search} type="search" aria-label="Search your library" placeholder="Search by title or author" value={query} onChange={e=>onQuery(e.target.value)}/></label>
  <nav className="site-actions" aria-label="Account">
   <Button className="site-link" onClick={onSaved}>Saved</Button>
   <IconButton className="site-icon" aria-label="Settings" onClick={onSettings}><SettingsOutlined/></IconButton>
   {account?<IconButton aria-label="Account" onClick={onAccount}><Avatar sx={{width:34,height:34,fontSize:14,bgcolor:'#fff',color:'var(--brand)'}}>{account.user.name.slice(0,1).toUpperCase()}</Avatar></IconButton>:<Button className="site-login" variant="outlined" onClick={onAccount}>Log in</Button>}
  </nav>
 </header>;
});
export default Header;
