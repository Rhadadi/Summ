// The small floating bubble that opens the study companion. It fades back while the page is scrolling so it never
// sits on the text being read, and shows when an answer is on its way or has arrived while the panel was hidden.
import{useEffect,useState}from'react';
import{AutoAwesomeRounded}from'@mui/icons-material';
// With text selected on the page it widens to say “Ask”, so the reader sees the passage will go with the question.
interface Props{label:string;onClick:()=>void;busy?:boolean;unread?:boolean;text?:string}
export default function AiLaunch({label,onClick,busy,unread,text}:Props){
 const[quiet,setQuiet]=useState(false);
 useEffect(()=>{
  let t=0;
  const on=(e:Event)=>{if(e.target instanceof Element&&e.target.closest('.ai-panel'))return;setQuiet(true);clearTimeout(t);t=window.setTimeout(()=>setQuiet(false),900);};
  document.addEventListener('scroll',on,{capture:true,passive:true});
  return()=>{document.removeEventListener('scroll',on,{capture:true});clearTimeout(t);};
 },[]);
 return <button className={'ai-launch'+(quiet&&!text?' quiet':'')+(busy?' busy':'')+(text?' armed':'')} aria-label={label} title={label} onClick={onClick}
  // keep a tap from clearing the reader's selection before the click lands
  onPointerDown={e=>e.preventDefault()}>
  <AutoAwesomeRounded/>{text&&<span>{text}</span>}{unread&&!busy&&<i className="ai-dot" aria-hidden="true"/>}
 </button>;
}
