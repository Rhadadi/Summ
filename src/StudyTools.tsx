// The end of a chapter: key concepts, questions to check yourself, and a note in your own words (saved to the notebook).
import{useEffect,useRef,useState}from'react';
import{EditNoteRounded,LightbulbOutlined,QuizOutlined}from'@mui/icons-material';
import{concepts,selfCheck}from'./study';
import{getNote,putNote}from'./notes';
import{tr}from'./i18n';
interface Props{lang:string;paragraphs:{heading?:string;text:string}[];book:{id:string;slug:string;title:string};chapter:{id:string;title:string}}
export default function StudyTools({lang,paragraphs,book,chapter}:Props){
 const L=(t:string)=>tr(lang,t);
 const terms=concepts(paragraphs),checks=selfCheck(paragraphs,lang);
 const[text,setText]=useState(()=>getNote(book.id,chapter.id)),[state,setState]=useState<''|'saving'|'saved'>('');
 const timer=useRef(0);
 useEffect(()=>{setText(getNote(book.id,chapter.id));setState('');},[book.id,chapter.id]);
 function change(v:string){
  setText(v);setState('saving');clearTimeout(timer.current);
  timer.current=window.setTimeout(()=>{putNote({bookId:book.id,slug:book.slug,bookTitle:book.title,chapterId:chapter.id,chapterTitle:chapter.title,text:v,lang});setState('saved');},500);
 }
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 return <section className="study" aria-label={L('Study this chapter')}>
  {terms.length>0&&<div className="study-block"><h2><LightbulbOutlined/>{L('Key concepts')}</h2><ul className="study-terms">{terms.map(t=><li key={t} dir="auto">{t}</li>)}</ul></div>}
  {checks.length>0&&<div className="study-block"><h2><QuizOutlined/>{L('Check your understanding')}</h2><p className="study-help">{L('Answer in your head first, then open the answer.')}</p>
   {checks.map((c,i)=><details key={i} className="study-q"><summary dir="auto">{c.question}</summary><p dir="auto">{c.answer}</p></details>)}</div>}
  <div className="study-block"><h2><EditNoteRounded/>{L('In your own words')}</h2>
   <p className="study-help">{L('Write the chapter’s main idea in two or three sentences. It stays on this device, in your notebook.')}</p>
   <textarea dir="auto" rows={4} value={text} onChange={e=>change(e.target.value)} aria-label={L('In your own words')} placeholder={L('The main idea of this chapter is…')}/>
   <div className="study-foot"><span role="status">{state==='saving'?L('Saving…'):state==='saved'?L('Saved in your notebook'):''}</span><a href="#/notebook">{L('Open the notebook')}</a></div>
  </div>
 </section>;
}
