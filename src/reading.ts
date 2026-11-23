import{useEffect,useState}from'react';

// How the reader looks: per device, for visitors as well as editors.
export interface Reading{size:number;leading:'tight'|'normal'|'airy';width:'narrow'|'medium'|'wide';theme:'paper'|'white'|'sepia'|'night';fa:string;en:string;justify:boolean;zen:boolean}
export const readingDefaults:Reading={size:20,leading:'airy',width:'wide',theme:'paper',fa:'scheherazade',en:'literata',justify:false,zen:false};
// Every font ships with the site under a free licence, so each reader sees the same choices; IranNastaliq is the one
// exception (see fonts/irannastaliq.css).
// optional: may not load everywhere (an installed copy, or a file the server may not have); offered only where it loads.
// lh: line spacing for this font, as a share of the chosen spacing (Nastaliq needs more room between lines).
export interface Font{id:string;label:string;family:string;load?:()=>Promise<unknown>;optional?:boolean;lh?:number}
export const faFonts:Font[]=[
 {id:'vazirmatn',label:'Vazirmatn · وزیرمتن',family:'"Vazirmatn Variable"'},
 {id:'nazli',label:'Nazli · نازلی (بر پایهٔ نازنین)',family:'"Nazli"'},
 {id:'homa',label:'Homa · هما',family:'"Homa"',load:()=>import('./fonts/farsiweb.css')},
 {id:'naskh',label:'Noto Naskh · نسخ کلاسیک',family:'"Noto Naskh Arabic Variable"',load:()=>import('@fontsource-variable/noto-naskh-arabic/index.css')},
 {id:'amiri',label:'Amiri · امیری',family:'"Amiri"',load:()=>Promise.all([import('@fontsource/amiri/arabic-400.css'),import('@fontsource/amiri/arabic-700.css')])},
 {id:'markazi',label:'Markazi · مرکزی',family:'"Markazi Text Variable"',load:()=>import('@fontsource-variable/markazi-text/index.css')},
 {id:'parastoo',label:'Parastoo · پرستو',family:'"Parastoo Variable"',load:()=>import('@fontsource-variable/parastoo/index.css')},
 {id:'sahel',label:'Sahel · ساحل',family:'"Sahel"',load:()=>import('./fonts/sahel.css')},
 {id:'samim',label:'Samim · صمیم',family:'"Samim"',load:()=>import('./fonts/samim.css')},
 {id:'shabnam',label:'Shabnam · شبنم',family:'"Shabnam"',load:()=>import('./fonts/shabnam.css')},
 // From Zekr (the Quran reader): the three of its fonts that carry every Persian letter. Its Hafs, Me-Quran and Amiri
 // Quran lack گ چ پ ژ, so they would break Persian prose.
 {id:'scheherazade',label:'Scheherazade · شهرزاد',family:'"Zekr Scheherazade"',load:()=>import('./fonts/zekr.css')},
 {id:'kfgqpc-naskh',label:'KFGQPC Naskh · نسخ عثمان طه',family:'"Zekr Naskh"',load:()=>import('./fonts/zekr.css')},
 {id:'noto-sans',label:'Noto Sans Arabic · نوتو',family:'"Zekr Noto Sans"',load:()=>import('./fonts/zekr.css')},
 // Nastaliq: an installed IranNastaliq, else the file the server keeps outside the repository (see fonts/irannastaliq.css)
 {id:'irannastaliq',label:'IranNastaliq · ایران‌نستعلیق',family:'"IranNastaliq Reading"',load:()=>import('./fonts/irannastaliq.css'),optional:true,lh:1.22},
];
export const enFonts:Font[]=[
 {id:'literata',label:'Literata',family:'"Literata Variable"'},
 {id:'source-serif',label:'Source Serif',family:'"Source Serif 4 Variable"',load:()=>import('@fontsource-variable/source-serif-4/index.css')},
 {id:'garamond',label:'EB Garamond',family:'"EB Garamond Variable"',load:()=>import('@fontsource-variable/eb-garamond/index.css')},
 {id:'atkinson',label:'Atkinson Hyperlegible',family:'"Atkinson Hyperlegible"',load:()=>Promise.all([import('@fontsource/atkinson-hyperlegible/400.css'),import('@fontsource/atkinson-hyperlegible/700.css')])},
 {id:'system',label:'System sans',family:'-apple-system,BlinkMacSystemFont,"Segoe UI"'},
];
const KEY='inkling-reading-v4',V3_KEY='inkling-reading-v3',V2_KEY='inkling-reading-v2',OLD_KEY='inkling-reading';
function load():Reading{try{
  const current=localStorage.getItem(KEY);
  if(current)return{...readingDefaults,...JSON.parse(current)};
  // v4: Scheherazade, airy and wide are the new house look; earlier choices keep size, theme and the rest
  const v3=localStorage.getItem(V3_KEY)||localStorage.getItem(V2_KEY);if(v3){const r=JSON.parse(v3);return{...readingDefaults,...r,fa:readingDefaults.fa,leading:readingDefaults.leading,width:readingDefaults.width};}
  const old=JSON.parse(localStorage.getItem(OLD_KEY)||'{}');
  return{...readingDefaults,...old,fa:readingDefaults.fa,leading:readingDefaults.leading,width:readingDefaults.width};
 }catch{return{...readingDefaults};}}
export function useReading(){
 const[reading,setReading]=useState<Reading>(load);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(reading));}catch{/* private mode */}
  faFonts.find(f=>f.id===reading.fa)?.load?.();enFonts.find(f=>f.id===reading.en)?.load?.();
  // the Settings dialog and an open reader each hold a copy; tell the others
  window.dispatchEvent(new CustomEvent('inkling-reading',{detail:reading}));},[reading]);
 useEffect(()=>{const sync=(e:Event)=>{const next=(e as CustomEvent<Reading>).detail;setReading(r=>JSON.stringify(r)===JSON.stringify(next)?r:next);};
  window.addEventListener('inkling-reading',sync);return()=>window.removeEventListener('inkling-reading',sync);},[]);
 return[reading,(patch:Partial<Reading>)=>setReading(r=>({...r,...patch}))] as const;
}
export function readingStyle(r:Reading):Record<string,string>{
 const fa=faFonts.find(f=>f.id===r.fa)||faFonts.find(f=>f.id===readingDefaults.fa)!,en=enFonts.find(f=>f.id===r.en)||enFonts[0];
 return{'--read-size':r.size+'px','--read-lh':String({tight:1.6,normal:1.85,airy:2.1}[r.leading]),'--read-width':{narrow:'620px',medium:'760px',wide:'920px'}[r.width],
  // the chosen font is for the summary itself, its chapter title and headings included (--read-text-font); the top bar,
  // contents, chapter banners and buttons are Vazirmatn, as on every other page (--read-font holds only the English choice)
  '--read-font':en.family+',"Vazirmatn Variable",Georgia,serif','--read-text-font':en.family+','+fa.family+',"Vazirmatn Variable",Georgia,serif','--read-align':r.justify?'justify':'start','--read-fa-lh':String(fa.lh||1)};
}
// Where the reader stopped in each book: the chapter and how far down it.
const POS='inkling-place:';
export const savePlace=(bookId:string,chapterId:string,y:number)=>{try{localStorage.setItem(POS+bookId,JSON.stringify({chapterId,y:Math.round(y),at:Date.now()}));}catch{/* private mode */}};
export const lastPlace=(bookId:string):{chapterId:string;y:number}|null=>{try{const v=JSON.parse(localStorage.getItem(POS+bookId)||'null');return v&&typeof v.chapterId==='string'?v:null;}catch{return null;}};

/** Every font's file, so a chooser can show each one in its own face. */
export const loadAllFonts=()=>{for(const f of [...faFonts,...enFonts])f.load?.();};
// Whether an optional font loads here: an installed copy, or the server's file. The answer stays on the device.
const seen=new Map<string,Promise<boolean>>();
export function available(f:Font):Promise<boolean>{
 if(!f.optional)return Promise.resolve(true);
 if(typeof document==='undefined'||!document.fonts)return Promise.resolve(false);
 if(!seen.has(f.id))seen.set(f.id,Promise.resolve(f.load?.()).then(()=>document.fonts.load('20px '+f.family,'ا')).then(list=>list.length>0,()=>false));
 return seen.get(f.id)!;
}
