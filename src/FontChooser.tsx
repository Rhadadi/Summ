import{useEffect,useState}from'react';
import{enFonts,faFonts,installed,loadAllFonts,type Reading}from'./reading';
import{tr}from'./i18n';
// Persian and English reading fonts, each shown in its own face. Used in the reader's look panel and in Settings.
// A font the site only names (IranNastaliq) can be chosen where this device has it installed.
export default function FontChooser({lang,reading,onChange}:{lang:string;reading:Reading;onChange:(patch:Partial<Reading>)=>void}){
 const L=(text:string)=>tr(lang,text);
 useEffect(loadAllFonts,[]);
 const[here,setHere]=useState<Record<string,boolean>>({});
 useEffect(()=>{let live=true;for(const f of faFonts)if(f.local)void installed(f).then(ok=>{if(live)setHere(h=>({...h,[f.id]:ok}));});return()=>{live=false;};},[]);
 return <>
  <label>{L('Persian font')}</label>
  <div className="look-fonts">{faFonts.map(f=>{const missing=!!f.local&&!here[f.id];
   return <button key={f.id} type="button" aria-pressed={reading.fa===f.id} className={reading.fa===f.id?'on':''} disabled={missing&&reading.fa!==f.id} onClick={()=>onChange({fa:f.id})} style={{fontFamily:f.family+',"Vazirmatn Variable"'}}><span dir="rtl">زندگی پیش از مرگ</span><small>{f.label}{missing&&<em className="font-missing">{L('Not installed on this device')}</em>}</small></button>;})}</div>
  <label>{L('English font')}</label>
  <div className="look-fonts en">{enFonts.map(f=><button key={f.id} type="button" aria-pressed={reading.en===f.id} className={reading.en===f.id?'on':''} onClick={()=>onChange({en:f.id})} style={{fontFamily:f.family}}><span>The examined life</span><small>{f.label}</small></button>)}</div>
 </>;
}
