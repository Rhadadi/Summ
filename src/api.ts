import type{Chapter,Settings,Summary}from './types';
import{cleanApiUrl}from './core';
export interface Health{ai_configured:boolean;auth_required:boolean;version:string}
async function call<T>(s:Settings,path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const base=cleanApiUrl(s.apiUrl)||window.location.origin;
 const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(s.token?{Authorization:'Bearer '+s.token}:{})},body:body?JSON.stringify(body):undefined,signal:signal||AbortSignal.timeout(body?300000:8000),credentials:'omit'});
 if(!r.headers.get('content-type')?.includes('application/json'))throw Error('No Summ processing server was found. File imports and original-passage reading still work.');
 const data=await r.json();if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'Processing request failed ('+r.status+').');return data as T;
}
export const health=(s:Settings)=>call<Health>(s,'health');
export const importUrl=(s:Settings,url:string)=>call<{text:string;title:string;url:string;warnings:string[]}>(s,'import',{url});
export const summarize=(s:Settings,chapter:Chapter,signal?:AbortSignal)=>call<Summary>(s,'summarize',{chapter,depth:s.depth,purpose:s.purpose,language:s.language,review:s.review},signal);
export const summaryKey=(book:string,hash:string,c:Chapter,s:Settings)=>[book,hash,c.id,c.title,c.blocks.map(b=>b.id).join(','),s.depth,s.purpose,s.language,s.review,'v1'].join(':');
