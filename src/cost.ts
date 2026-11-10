import type{Book,BookReport,Chapter,KeyInfo,Settings,Usage}from'./types.ts';
import{chapterParts,partLimit}from'./book-summary.ts';

// Gemini list prices in USD per 1M tokens, from ai.google.dev/gemini-api/docs/pricing (checked 2026-11-10).
// Output prices include thinking tokens. Users can override them in Account.
export interface Price{input:number;output:number;note?:string}
const flash=(d:Date):Price=>d<new Date('2027-01-01T00:00:00Z')?{input:.75,output:3.75}:{input:1.5,output:7.5};
const table:{pattern:RegExp;price:(d:Date)=>Price}[]=[
 {pattern:/^gemini-flash-latest$/,price:d=>({...flash(d),note:'Assumes the alias points to Gemini 3.8 Flash.'})},
 {pattern:/^gemini-flash-lite-latest$/,price:()=>({input:.3,output:2.5,note:'Assumes the alias points to Gemini 3.5 Flash-Lite.'})},
 {pattern:/^gemini-3\.[68]-flash(?!-lite)/,price:flash},
 {pattern:/^gemini-3\.5-flash-lite/,price:()=>({input:.3,output:2.5})},
 {pattern:/^gemini-3\.1-flash-lite/,price:()=>({input:.25,output:1.5})},
 {pattern:/^gemini-3\.1-pro/,price:()=>({input:2,output:12})},
 {pattern:/^gemini-3-flash/,price:()=>({input:.5,output:3})},
 {pattern:/^gemini-2\.5-flash-lite/,price:()=>({input:.1,output:.4})},
 {pattern:/^gemini-2\.5-flash/,price:()=>({input:.3,output:2.5})},
 {pattern:/^gemini-2\.5-pro/,price:()=>({input:1.25,output:10})},
];
export const modelSuggestions=['gemini-flash-latest','gemini-flash-lite-latest','gemini-pro-latest'];
export function listPrice(model:string,date=new Date()):Price|null{return table.find(row=>row.pattern.test(model.replace(/^models\//,'')))?.price(date)??null;}
export function effectivePrice(key:KeyInfo|null|undefined,date=new Date()):Price|null{
 if(!key)return null;
 if(key.price_in!=null&&key.price_out!=null)return{input:key.price_in,output:key.price_out,note:'Using the prices you entered.'};
 return listPrice(key.model,date);
}

// Rough tokenizer: ~4 Latin characters per token; Persian, Arabic and CJK text uses far more tokens per character.
export function estimateTokens(text:string){let ascii=0,other=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)ascii++;else if(c<0xdc00||c>0xdfff)other++;}return Math.ceil(ascii/4+other/1.6);}
export interface Estimate{input:number;output:number;calls:number;chars:number}
const PROMPT=350,BATCH=23700;
const citedShare={glance:.35,overview:.55,detailed:.8,close:1};
function draftTokens(s:Pick<Settings,'depth'|'language'|'review'>,source:number){
 const base={glance:500,overview:1400,detailed:Math.min(12000,800+source*.12),close:Math.min(24000,1000+source*.3)}[s.depth];
 return Math.ceil((base+(s.review==='internal'?700:0))*(s.language==='en'?1:1.3));
}
// Mirrors server/app.py: inventory batches only for long parts, a draft, then a check of the cited passages.
function partEstimate(part:Chapter,s:Pick<Settings,'depth'|'language'|'review'>){
 const chars=part.blocks.reduce((n,b)=>n+b.text.length,0);const source=part.blocks.reduce((n,b)=>n+estimateTokens(b.text)+12,0);
 const batches=Math.max(1,Math.ceil(chars/BATCH));const draft=draftTokens(s,source);
 let input=0,output=0,calls=0;
 if(batches>1){const inventory=Math.ceil(source*.3);input+=source+batches*PROMPT+inventory+PROMPT;output+=inventory;calls+=batches;}
 else input+=source+PROMPT;
 output+=draft;calls++;
 input+=Math.ceil(source*citedShare[s.depth])+draft+PROMPT;output+=60;calls++;
 return{input,output,calls,chars,draft};
}
const zero=():Estimate=>({input:0,output:0,calls:0,chars:0});
const plus=(a:Estimate,b:Estimate):Estimate=>({input:a.input+b.input,output:a.output+b.output,calls:a.calls+b.calls,chars:a.chars+b.chars});
function chapterEstimate(chapter:Chapter,s:Pick<Settings,'depth'|'language'|'review'>){
 const parts=chapterParts(chapter,partLimit(s.depth)).map(part=>partEstimate(part,s));
 let total=parts.reduce<Estimate>(plus,zero());const summary=parts.reduce((n,p)=>n+p.draft,0);
 if(parts.length>1){const combined=Math.min(16000,Math.ceil(summary*.7));total=plus(total,{input:summary*2+combined+PROMPT*2,output:combined+60,calls:2,chars:0});return{total,summary:combined};}
 return{total,summary};
}
export const estimateChapter=(chapter:Chapter,s:Settings):Estimate=>chapterEstimate(chapter,s).total;
// Chapters already in the saved report are skipped by the run, so they cost nothing again.
export function estimateBook(book:Book,s:Settings,report?:BookReport):Estimate{
 let total=zero(),summaries=0;
 for(const chapter of book.chapters){
  const done=report?.chapters[chapter.id];
  if(done){summaries+=done.paragraphs.reduce((n,p)=>n+estimateTokens(p.text),0);continue;}
  const next=chapterEstimate(chapter,s);total=plus(total,next.total);summaries+=next.summary;
 }
 if(!report?.overview)total=plus(total,{input:summaries*2+3000+PROMPT*2,output:3000+60,calls:2,chars:0});
 if(!report?.guide)total=plus(total,{input:summaries*2+5000+PROMPT*2,output:4500+60,calls:2,chars:0});
 return total;
}
export interface CostRange{likely:number;low:number;high:number}
// Thinking tokens are billed as output and vary by model, so the range doubles output at the top end.
export function costRange(e:Pick<Estimate,'input'|'output'>,price:Price):CostRange{
 const at=(input:number,output:number)=>(input*price.input+output*price.output)/1e6;
 return{likely:at(e.input,e.output*1.4),low:at(e.input*.9,e.output),high:at(e.input*1.15,e.output*2)};
}
export const usageCost=(usage:Usage|undefined,price:Price|null)=>usage&&price?(usage.input*price.input+usage.output*price.output)/1e6:null;
export function money(value:number){return value<.01?'< $0.01':'$'+(value<10?value.toFixed(2):value.toFixed(0));}
