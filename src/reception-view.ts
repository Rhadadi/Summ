import type{Review}from'./types';
import{directReviewPage,reviewSourceLinks}from'./review-links.ts';

type Critic=NonNullable<Review['critics']>[number];
type Reader=NonNullable<Review['readers']>[number];
export interface Score{value:number;source:string;count:number|null;url:string|null}
const digits=(lang:string|undefined,s:string)=>lang==='fa'?s.replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d]):s;
// A date is whatever the research wrote ("February 24, 2008", "2008-02-24", "2008"); only the year is shown, in the page's digits.
export const year=(date:string|undefined,lang?:string)=>{const m=/\b(1[5-9]\d\d|20\d\d)\b/.exec(date||'');return m?digits(lang,m[1]):'';};
// In every language but English the translation is the quote the reader sees; the excerpt is the original.
const other=(lang?:string)=>!!lang&&lang!=='en';
export const quoteFor=(item:{excerpt?:string;translation?:string},lang?:string)=>(other(lang)&&item.translation)||item.excerpt||'';
export const originalFor=(item:{excerpt?:string;translation?:string},lang?:string)=>other(lang)&&item.translation&&item.excerpt&&item.excerpt!==item.translation?item.excerpt:'';
// An untranslated English excerpt on a Persian page is set left-to-right.
export const quoteIsForeign=(item:{excerpt?:string;translation?:string},lang?:string)=>other(lang)&&!item.translation&&!!item.excerpt;
// First sentence of the verdict, so it can be set large. Very short openings ("Yes.") are joined to the next sentence.
export function splitVerdict(verdict:string){
 const parts=(verdict||'').trim().split(/(?<=[.!?؟])\s+/).filter(Boolean);
 if(!parts.length)return{lead:'',rest:''};
 let take=1;if(parts[0].length<20&&parts.length>1)take=2;
 return{lead:parts.slice(0,take).join(' '),rest:parts.slice(take).join(' ')};
}
const stanceOk=(c:Critic)=>c.stance==='positive'||c.stance==='mixed';
export function receptionView(review:Review|null,scores:Score[]=[],lang?:string){
 const r=review,all=[...(r?.ratings?.length?r.ratings:r?.rating?[r.rating]:[]),...scores].filter((s,i,a)=>s&&s.value>0&&a.findIndex(x=>x.source.toLowerCase()===s.source.toLowerCase())===i).slice(0,3);
 // Verified quotes first, then any quote, then the rest; the original order breaks ties.
 const rank=(c:Critic)=>(c.verified===true?0:2)+(c.excerpt?0:1);
 const critics=(r?.critics||[]).map((c,i)=>({c,i})).sort((a,b)=>rank(a.c)-rank(b.c)||a.i-b.i).map(x=>x.c);
 const withQuote=critics.filter(c=>c.excerpt);
 const featured=withQuote.find(c=>c.verified===true&&stanceOk(c))||withQuote.find(stanceOk)||withQuote[0]||null;
 const readers=(r?.readers||[]).filter((v:Reader)=>v.excerpt||v.summary);
 // Legacy plain quotes only when nothing richer exists.
 const legacy=critics.length||readers.length?[]:r?.quotes||[];
 const pros=r?.pros||[],cons=r?.cons||[];
 const shown=new Set<string>([...critics.map(c=>c.url||''),...(r?.readers||[]).map(v=>v.url||''),...all.map(s=>s.url||''),...legacy.map(q=>q.url||'')].filter(Boolean));
 const sources=reviewSourceLinks(r).filter(s=>!shown.has(s.url)&&directReviewPage(s.url));
 const {lead,rest}=splitVerdict(r?.verdict||'');
 const themes=(r?.themes||[]).slice(0,5),awards=r?.awards||[],impact=r?.impact||'';
 const counts={critics:critics.length,readers:readers.length,sources:sources.length};
 return{lead,rest,scores:all,themes,praise:{top:pros.slice(0,3),all:pros},criticism:{top:cons.slice(0,3),all:cons},featured,
  others:critics.filter(c=>c!==featured),readers,legacy,awards,impact,sources,counts,
  isEmpty:!lead&&!all.length&&!critics.length&&!readers.length&&!pros.length&&!cons.length&&!themes.length&&!awards.length&&!impact&&!legacy.length};
}
