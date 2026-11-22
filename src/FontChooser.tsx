import{useEffect}from'react';
import{enFonts,faFonts,loadAllFonts,type Reading}from'./reading';
import{tr}from'./i18n';
// Persian and English reading fonts, each shown in its own face. Used in the reader's look panel and in Settings.
export default function FontChooser({lang,reading,onChange}:{lang:string;reading:Reading;onChange:(patch:Partial<Reading>)=>void}){
 const L=(text:string)=>tr(lang,text);
 useEffect(loadAllFonts,[]);
 return <>
  <label>{L('Persian font')}</label>
  <div className="look-fonts">{faFonts.map(f=><button key={f.id} type="button" aria-pressed={reading.fa===f.id} className={reading.fa===f.id?'on':''} onClick={()=>onChange({fa:f.id})} style={{fontFamily:f.family+',"Vazirmatn Variable"'}}><span dir="rtl">زندگی پیش از مرگ</span><small>{f.label}</small></button>)}</div>
  <label>{L('English font')}</label>
  <div className="look-fonts en">{enFonts.map(f=><button key={f.id} type="button" aria-pressed={reading.en===f.id} className={reading.en===f.id?'on':''} onClick={()=>onChange({en:f.id})} style={{fontFamily:f.family}}><span>The examined life</span><small>{f.label}</small></button>)}</div>
 </>;
}
