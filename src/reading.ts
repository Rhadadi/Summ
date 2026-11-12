import{useEffect,useState}from'react';

// How the reader looks: per device, for visitors as well as editors.
export interface Reading{size:number;leading:'tight'|'normal'|'airy';width:'narrow'|'medium'|'wide';theme:'paper'|'white'|'sepia'|'night';fa:string;en:string;justify:boolean}
export const readingDefaults:Reading={size:20,leading:'normal',width:'medium',theme:'paper',fa:'vazirmatn',en:'literata',justify:false};
// Free fonts ship with the site; the classic Persian fonts many readers have installed are used when present.
interface Font{id:string;label:string;family:string;load?:()=>Promise<unknown>;local?:boolean}
export const faFonts:Font[]=[
 {id:'vazirmatn',label:'Vazirmatn · وزیرمتن',family:'"Vazirmatn Variable"'},
 {id:'nazli',label:'Nazli · نازلی (بر پایهٔ نازنین)',family:'"Nazli"',load:()=>import('./fonts/farsiweb.css')},
 {id:'homa',label:'Homa · هما',family:'"Homa"',load:()=>import('./fonts/farsiweb.css')},
 {id:'naskh',label:'Noto Naskh · نسخ کلاسیک',family:'"Noto Naskh Arabic Variable"',load:()=>import('@fontsource-variable/noto-naskh-arabic/index.css')},
 {id:'amiri',label:'Amiri · امیری',family:'"Amiri"',load:()=>Promise.all([import('@fontsource/amiri/arabic-400.css'),import('@fontsource/amiri/arabic-700.css')])},
 {id:'markazi',label:'Markazi · مرکزی',family:'"Markazi Text Variable"',load:()=>import('@fontsource-variable/markazi-text/index.css')},
 {id:'parastoo',label:'Parastoo · پرستو',family:'"Parastoo"',load:()=>import('./fonts/parastoo.css')},
 {id:'sahel',label:'Sahel · ساحل',family:'"Sahel"',load:()=>import('./fonts/sahel.css')},
 {id:'samim',label:'Samim · صمیم',family:'"Samim"',load:()=>import('./fonts/samim.css')},
 {id:'shabnam',label:'Shabnam · شبنم',family:'"Shabnam"',load:()=>import('./fonts/shabnam.css')},
 // Installed on the reader's device: B fonts and other licensed fonts, then the Persian fonts every Apple device has.
 ...[['b-nazanin','B Nazanin','نازنین','"B Nazanin","BNazanin","Nazanin"'],['b-zar','B Zar','زر','"B Zar","BZar"'],['b-badr','B Badr','بدر','"B Badr","BBadr"'],['b-mitra','B Mitra','میترا','"B Mitra","BMitra"'],['b-roya','B Roya','رویا','"B Roya","BRoya"'],['b-traffic','B Traffic','ترافیک','"B Traffic","BTraffic"'],['b-yagut','B Yagut','یاقوت','"B Yagut","BYagut"'],['b-lotus','B Lotus','لوتوس','"B Lotus","BLotus"'],['b-koodak','B Koodak','کودک','"B Koodak","BKoodak"'],['adobe-arabic','Adobe Arabic','ادوبی عربیک','"Adobe Arabic"'],['kahroba','Kahroba','کهربا','"Kahroba"'],['farhang','Farhang','فرهنگ','"Farhang","Farhang2"'],['iransans','IRANSans','ایران‌سنس','"IRANSans","IRANSansWeb"'],['anjoman','Anjoman','انجمن','"Anjoman"'],['iranyekan','IRANYekan','ایران‌یکان','"IRANYekan","IRANYekanWeb"'],
   ['geeza','Geeza Pro','گیزا (اپل)','"Geeza Pro"'],['nadeem','Nadeem','ندیم (اپل)','"Nadeem"'],['farah','Farah','فرح (اپل)','"Farah"'],['damascus','Damascus','دمشق (اپل)','"Damascus"'],['baghdad','Baghdad','بغداد (اپل)','"Baghdad"'],['albayan','Al Bayan','البیان (اپل)','"Al Bayan"'],['mishafi','Mishafi','مصحفی (اپل)','"Mishafi"'],['nastaliq','Noto Nastaliq','نستعلیق','"Noto Nastaliq Urdu"']]
  .map(([id,name,fa,family])=>({id,label:name+' · '+fa,family,local:true})),
];
export const enFonts:Font[]=[
 {id:'literata',label:'Literata',family:'"Literata Variable"'},
 {id:'source-serif',label:'Source Serif',family:'"Source Serif 4 Variable"',load:()=>import('@fontsource-variable/source-serif-4/index.css')},
 {id:'garamond',label:'EB Garamond',family:'"EB Garamond Variable"',load:()=>import('@fontsource-variable/eb-garamond/index.css')},
 {id:'atkinson',label:'Atkinson Hyperlegible',family:'"Atkinson Hyperlegible"',load:()=>Promise.all([import('@fontsource/atkinson-hyperlegible/400.css'),import('@fontsource/atkinson-hyperlegible/700.css')])},
 {id:'system',label:'System sans',family:'-apple-system,BlinkMacSystemFont,"Segoe UI"'},
];
// A font the reader has installed shows up in the list; one they lack is marked so.
let canvas:CanvasRenderingContext2D|null=null;
export function installed(f:Font){
 if(!f.local)return true;
 canvas??=document.createElement('canvas').getContext('2d');if(!canvas)return false;
 const width=(font:string)=>{canvas!.font='40px '+font;return canvas!.measureText('آزمایش نوشتار فارسی ۱۲۳').width;};
 return width(f.family+',monospace')!==width('monospace')||width(f.family+',serif')!==width('serif');
}
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
