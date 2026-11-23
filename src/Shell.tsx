import{forwardRef,useState,type ReactNode}from'react';
import{Avatar,Divider,Drawer,IconButton,ListItemIcon,ListItemText,Menu,MenuItem}from'@mui/material';
import{AddRounded,BookmarkBorderRounded,CategoryOutlined,EditNoteRounded,ExpandMoreRounded,HomeOutlined,LanguageRounded,PersonOutlineRounded,VisibilityOutlined,LibraryBooksOutlined,MenuBookOutlined,MenuRounded,SearchRounded,SettingsOutlined,CloudOffRounded,DownloadDoneRounded,EditNoteOutlined,InfoOutlined}from'@mui/icons-material';
import{useOnline,useSaved}from'./offline';
import{categoryCounts,categoryName}from'./categories';
import{tr,rtl,num}from'./i18n';
import type{Account,PubBook}from'./types';

export function Logo({dark=false}:{dark?:boolean}){
 const drop=dark?'currentColor':'var(--brand)',page=dark?'var(--surface,#fff)':'#fff',dot=dark?'var(--surface,#fff)':'#ffc93c';
 return <svg className="logo-mark" width="28" height="28" viewBox="552 32 176 176" aria-hidden="true"><path d="M640 40C640 40 580 100 580 140a60 60 0 0 0 120 0C700 100 640 40 640 40Z" fill={drop}/><path d="M604 148Q622 136 638 147V178Q622 167 604 178Z" fill={page}/><path d="M676 148Q658 136 642 147V178Q658 167 676 178Z" fill={page}/><path d="M640 98L651 109L640 120L629 109Z" fill={dot}/></svg>;
}
// The logo: «عصاره» in Nastaliq (lettering from IranNastaliq, recomposed: shorter alef, one outline), in the brand teal.
// The final ه is the brand's drop (the app icon's), with a gold drop for its counter: the essence. The square app icon
// is only for places that show the mark alone, never above the name (a mark over ع reads as «غ»).
// Master files: public/brand/. Follows the theme through --brand.
const WORD='M1420.2,-531.4Q1420,-529.9 1419.8,-528.5Q1424.2,-487.4 1438.5,-453.5Q1459,-405 1493.5,-374Q1528,-343 1574,-330Q1620,-317 1670,-323Q1691,-327 1710,-336.5Q1729,-346 1750.5,-364Q1772,-382 1797.5,-410.5Q1823,-439 1858,-483Q1883,-514 1906.5,-520Q1930,-526 1951,-518Q1971,-505 1993.5,-495Q2016,-485 2043,-480Q2045,-482 2077,-517Q2109,-552 2165,-616Q2225,-683 2283,-742Q2341,-801 2387,-821.5Q2433,-842 2466,-839Q2510.1,-833.6 2537.6,-803Q2575.7,-884.8 2631,-959Q2695,-1045 2785,-1103Q2829,-1132 2873.5,-1129.5Q2918,-1127 2950,-1097Q2969,-1079 2970,-1048.5Q2971,-1018 2958,-993.5Q2945,-969 2919,-959.5Q2893,-950 2859,-975Q2829,-986 2799.5,-984Q2770,-982 2745.5,-972Q2721,-962 2703,-945.5Q2685,-929 2676.5,-912.5Q2668,-896 2670.5,-881.5Q2673,-867 2691,-859Q2712,-848 2745,-838Q2778,-828 2814,-821.5Q2850,-815 2884,-814Q2918,-813 2942,-820Q2968,-831 2992.5,-845.5Q3017,-860 3041.5,-875Q3066,-890 3091,-904Q3116,-918 3144,-928Q3176,-937 3184,-918.5Q3192,-900 3161,-865Q3138,-846 3100,-818.5Q3062,-791 3005,-755Q2977,-737 2954.5,-720Q2932,-703 2910.5,-685Q2889,-667 2867,-646Q2845,-625 2819,-598Q2744,-528 2664,-463.5Q2584,-399 2500,-350Q2416,-301 2329,-274Q2242,-247 2154,-252Q2148.4,-252.5 2143.5,-253.2Q2137.8,-252 2132,-251Q2096,-248 2057.5,-248.5Q2019,-249 1981,-255.5Q1943,-262 1906.5,-276.5Q1870,-291 1837,-316Q1820,-321 1803.5,-301Q1787,-281 1769,-247.5Q1751,-214 1730,-173.5Q1709,-133 1683,-96.5Q1657,-60 1624.5,-33Q1592,-6 1551,0Q1477,5 1426.5,-21Q1376,-47 1345,-93Q1314,-139 1300.5,-199.5Q1287,-260 1289,-325Q1289.1,-325.5 1289.2,-326Q1282.5,-325 1275.7,-325Q1275.7,-357.7 1303.1,-528Q1330.6,-698.2 1344.6,-771.8Q1358.6,-845.3 1376.5,-927.9Q1394.4,-1010.4 1411.2,-1061.2Q1430.2,-1103.3 1452.1,-1146.3Q1473.9,-1189.3 1497.4,-1231.4Q1505.1,-1240.7 1510.1,-1239.4Q1515.3,-1238.1 1517.6,-1225.4Q1489.6,-1082.7 1466.1,-929.2Q1442.6,-775.6 1434.2,-709.4Q1425.8,-643.2 1425.8,-632Q1420.2,-561.5 1420.2,-531.4ZM394.8,-615C394.8,-615 565.9,-330.2 528,-178.1C496.6,-52.2 369.1,24.4 243.1,-7C117.2,-38.4 40.6,-165.9 72,-291.9C109.9,-443.9 394.8,-615 394.8,-615ZM1175,-826Q1132,-562 1097.5,-432Q1063,-302 1035,-233.5Q1007,-165 973.5,-129Q940,-93 850.5,-60.5Q761,-28 701,-15Q641,-2 626,-1Q611,-2 607,-6.5Q603,-11 614,-28Q633,-55 693.5,-102Q754,-149 836.5,-219Q919,-289 960,-342.5Q1001,-396 1032.5,-488.5Q1064,-581 1094,-682Q1124,-783 1137.5,-819Q1151,-855 1165,-854Q1169.7,-853.1 1172.5,-850.3Q1179.2,-843.6 1175,-826ZM344.5,-413.6C344.5,-413.6 210.6,-333.2 192.8,-261.7C178.1,-202.5 214.1,-142.6 273.3,-127.8C332.5,-113.1 392.4,-149.1 407.2,-208.3C425,-279.7 344.5,-413.6 344.5,-413.6ZM2304,-496Q2398,-529 2480,-612Q2476,-618 2467.5,-628Q2459,-638 2444.5,-648.5Q2430,-659 2410,-668Q2390,-677 2363,-679Q2305,-686 2244.5,-631.5Q2184,-577 2098,-476Q2208,-462 2304,-496ZM2558.8,-669.4Q2542.2,-612.4 2494.5,-540Q2433.6,-447.5 2374.7,-386Q2404.3,-399.5 2433.5,-415Q2503,-452 2568,-501.5Q2633,-551 2689,-614Q2649,-625 2610.5,-641Q2578.1,-654.5 2558.8,-669.4Z';
const HEART='M337.9,-387C337.9,-387 406.4,-273.1 391.2,-212.3C378.6,-161.9 327.6,-131.2 277.3,-143.8C226.9,-156.4 196.2,-207.4 208.8,-257.7C224,-318.5 337.9,-387 337.9,-387Z';
export function Lockup({className='lockup'}:{className?:string}){
 return <svg className={className} viewBox="41 -1264 3169 1288" role="img" aria-label="عصاره"><path d={WORD} fill="var(--brand)"/><path d={HEART} fill="#ffc93c"/></svg>;
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
   <MenuItem onClick={pick(()=>go('/about'))}><ListItemIcon><InfoOutlined fontSize="small"/></ListItemIcon><ListItemText>{L('About Osareh')}</ListItemText></MenuItem>
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
 const topNav=route==='/'||route==='/notebook'||route==='/about'||/^\/b\/[^/]+$/.test(route)||route==='/library'||route.startsWith('/library/'),here:string=route;
 const go=(path:string)=>{setOpen(false);navigate(path);};
 const online=useOnline();
 const item=(path:string,label:string,icon:ReactNode,active:boolean)=><button className={'side-item'+(active?' on':'')} aria-current={active?'page':undefined} onClick={()=>go(path)}>{icon}<span>{L(label)}</span></button>;
 const nav=<nav className="side" aria-label={L('Main')}>
  <button className="side-brand" aria-label="Osareh" onClick={()=>go('/')}><Lockup/></button>
  <label className="search2 drawer-search"><input type="search" aria-label={L('Search your library')} placeholder={L('Search your library')} value={query} onChange={e=>{onQuery(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter')setOpen(false);}}/><span aria-hidden="true"><SearchRounded/></span></label>
  {item('/','For you',<HomeOutlined/>,route==='/')}
  {item('/library','Library',<MenuBookOutlined/>,route==='/library'||route.startsWith('/b/'))}
  {canEdit&&<>{item('/workspace','Workspace',<LibraryBooksOutlined/>,route==='/workspace'||route.startsWith('/book/'))}
  {item('/saved','Saved passages',<BookmarkBorderRounded/>,route==='/saved')}
  <button className="side-item" onClick={()=>{setOpen(false);onAdd();}}><AddRounded/><span>Add a book</span></button></>}
  {item('/about','About Osareh',<InfoOutlined/>,route==='/about')}
  {isEditor&&<button className="side-item" onClick={()=>{setOpen(false);onToggleVisitor();}}>{asVisitor?<EditNoteRounded/>:<VisibilityOutlined/>}<span>{L(asVisitor?'Back to editing':'View as visitor')}</span></button>}
 </nav>;
 const link=(path:string,label:string,active:boolean)=><button className={'tn-link'+(active?' on':'')} aria-current={active?'page':undefined} onClick={()=>go(path)}>{L(label)}</button>;
 return <div className={'shell'+(topNav?' topnav':'')} lang={lang} dir={rtl(lang)?'rtl':'ltr'}>
  <aside className="shell-side">{nav}</aside>
  <Drawer open={open} onClose={()=>setOpen(false)} slotProps={{paper:{className:'side-drawer'}}}>{nav}</Drawer>
  <div className="shell-main">
   {topNav&&<header className="topnav-bar">
    <button className="tn-logo" aria-label="Osareh" onClick={()=>go('/')}><Lockup/></button>
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
    <button className="topbar-logo" aria-label="Osareh" onClick={()=>go('/')}><Lockup/></button>
    <label className="search2 desktop-search"><input ref={search} type="search" aria-label={L('Search your library')} placeholder={L('Search your library')} value={query} onChange={e=>onQuery(e.target.value)}/><span aria-hidden="true"><SearchRounded/></span></label>
   {asVisitor&&<button className="visitor-pill" onClick={onToggleVisitor} title={L('You are seeing the site as a visitor does. Editing tools are hidden.')}><EditNoteRounded/><span>{L('Back to editing')}</span></button>}
   {!online&&<span className="offline-pill" role="status" title={L('No connection. Saved books and pages you opened still work.')}><CloudOffRounded/><span>{L('Offline')}</span></span>}<AccountMenu lang={lang} account={account} onAccount={onAccount} onSettings={onSettings} onLanguage={onLanguage} go={go}/></header>
   <main id="main-content" tabIndex={-1}>{children}</main>
  </div>
 </div>;
});
export default Shell;
