// The small floating bubble that opens the study companion. It fades back while the page is scrolling so it never
// sits on the text being read, and shows when an answer is on its way or has arrived while the panel was hidden.
import{useEffect,useState}from'react';
import{AutoAwesomeRounded}from'@mui/icons-material';
interface Props{label:string;onClick:()=>void;busy?:boolean;unread?:boolean}
export default function AiLaunch({label,onClick,busy,unread}:Props){
 const[quiet,setQuiet]=useState(false);
 useEffect(()=>{
  let t=0;
  const on=(e:Event)=>{if(e.target instanceof Element&&e.target.closest('.ai-panel'))return;setQuiet(true);clearTimeout(t);t=window.setTimeout(()=>setQuiet(false),900);};
  document.addEventListener('scroll',on,{capture:true,passive:true});
  return()=>{document.removeEventListener('scroll',on,{capture:true});clearTimeout(t);};
 },[]);
 return <button className={'ai-launch'+(quiet?' quiet':'')+(busy?' busy':'')} aria-label={label} title={label} onClick={onClick}>
  <AutoAwesomeRounded/>{unread&&!busy&&<i className="ai-dot" aria-hidden="true"/>}
 </button>;
}
