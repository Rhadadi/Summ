import type{Review}from'./types';

// A reception link must lead to an actual book or review page, never a site search.
export const directReviewPage=(url:string)=>{try{
 const parsed=new URL(url);return parsed.protocol==='https:'&&parsed.pathname!=='/'&&!/(?:^|\/)(?:search|browse)(?:\/|$)/i.test(parsed.pathname);
}catch{return false;}};

export const reviewSourceLinks=(review:Review|null)=>{
 if(!review)return[];
 const candidates=[...review.sources,...(review.critics||[]).filter(c=>c.url).map(c=>({name:c.publication,url:c.url!})),...(review.readers||[]).filter(r=>r.url).map(r=>({name:'Goodreads',url:r.url!})),...(review.ratings||[]).filter(r=>r.url).map(r=>({name:r.source,url:r.url!}))];
 return candidates.filter((s,i,a)=>directReviewPage(s.url)&&a.findIndex(x=>x.url===s.url)===i);
};
