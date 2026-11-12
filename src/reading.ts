import{useEffect,useState}from'react';

// How the reader looks: per device, for visitors as well as editors.
export interface Reading{size:number;leading:'tight'|'normal'|'airy';width:'narrow'|'medium'|'wide';theme:'paper'|'white'|'sepia'|'night';fa:string;en:string;justify:boolean}
export const readingDefaults:Reading={size:20,leading:'normal',width:'medium',theme:'paper',fa:'vazirmatn',en:'literata',justify:false};
// Every font ships with the site under a free licence, so each reader sees the same choices.
interface Font{id:string;label:string;family:string;load?:()=>Promise<unknown>}
export const faFonts:Font[]=[
 {id:'vazirmatn',label:'Vazirmatn · وزیرمتن',family:'"Vazirmatn Variable"'},
 {id:'nazli',label:'Nazli · نازلی (بر پایهٔ نازنین)',family:'"Nazli"',load:()=>import('./fonts/farsiweb.css')},
 {id:'homa',label:'Homa · هما',family:'"Homa"',load:()=>import('./fonts/farsiweb.css')},
 {id:'naskh',label:'Noto Naskh · نسخ کلاسیک',family:'"Noto Naskh Arabic Variable"',load:()=>import('@fontsource-variable/noto-naskh-arabic/index.css')},
 {id:'amiri',label:'Amiri · امیری',family:'"Amiri"',load:()=>Promise.all([import('@fontsource/amiri/arabic-400.css'),import('@fontsource/amiri/arabic-700.css')])},
 {id:'markazi',label:'Markazi · مرکزی',family:'"Markazi Text Variable"',load:()=>import('@fontsource-variable/markazi-text/index.css')},
 {id:'parastoo',label:'Parastoo · پرستو',family:'"Parastoo Variable"',load:()=>import('@fontsource-variable/parastoo/index.css')},
 {id:'sahel',label:'Sahel · ساحل',family:'"Sahel"',load:()=>import('./fonts/sahel.css')},
 {id:'samim',label:'Samim · صمیم',family:'"Samim"',load:()=>import('./fonts/samim.css')},
 {id:'shabnam',label:'Shabnam · شبنم',family:'"Shabnam"',load:()=>import('./fonts/shabnam.css')},
];
export const enFonts:Font[]=[
 {id:'literata',label:'Literata',family:'"Literata Variable"'},
 {id:'source-serif',label:'Source Serif',family:'"Source Serif 4 Variable"',load:()=>import('@fontsource-variable/source-serif-4/index.css')},
 {id:'garamond',label:'EB Garamond',family:'"EB Garamond Variable"',load:()=>import('@fontsource-variable/eb-garamond/index.css')},
 {id:'atkinson',label:'Atkinson Hyperlegible',family:'"Atkinson Hyperlegible"',load:()=>Promise.all([import('@fontsource/atkinson-hyperlegible/400.css'),import('@fontsource/atkinson-hyperlegible/700.css')])},
 {id:'system',label:'System sans',family:'-apple-system,BlinkMacSystemFont,"Segoe UI"'},
];
const KEY='inkling-reading';
function load():Reading{try{return{...readingDefaults,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return{...readingDefaults};}}
export function useReading(){
 const[reading,setReading]=useState<Reading>(load);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(reading));}catch{/* private mode */}
  faFonts.find(f=>f.id===reading.fa)?.load?.();enFonts.find(f=>f.id===reading.en)?.load?.();},[reading]);
 return[reading,(patch:Partial<Reading>)=>setReading(r=>({...r,...patch}))] as const;
}
export function readingStyle(r:Reading):Record<string,string>{
 const fa=faFonts.find(f=>f.id===r.fa)||faFonts[0],en=enFonts.find(f=>f.id===r.en)||enFonts[0];
 return{'--read-size':r.size+'px','--read-lh':String({tight:1.6,normal:1.85,airy:2.1}[r.leading]),'--read-width':{narrow:'620px',medium:'760px',wide:'920px'}[r.width],
  '--read-font':en.family+','+fa.family+',"Vazirmatn Variable",Georgia,serif','--read-align':r.justify?'justify':'start'};
}
// Where the reader stopped in each book: the chapter and how far down it.
const POS='inkling-place:';
export const savePlace=(bookId:string,chapterId:string,y:number)=>{try{localStorage.setItem(POS+bookId,JSON.stringify({chapterId,y:Math.round(y),at:Date.now()}));}catch{/* private mode */}};
export const lastPlace=(bookId:string):{chapterId:string;y:number}|null=>{try{const v=JSON.parse(localStorage.getItem(POS+bookId)||'null');return v&&typeof v.chapterId==='string'?v:null;}catch{return null;}};
