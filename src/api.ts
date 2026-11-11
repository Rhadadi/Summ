import type{Review,ArtResult,Account,AppConfig,BookInfo,NarrationStatus,People,PubBook,PubDoc,Chapter,GoogleBookEdition,Guide,Settings,Summary,Overview,SummarySection}from './types';
export class ApiError extends Error{constructor(message:string,readonly status:number){super(message);}}
// The session lives in an HttpOnly cookie, so requests stay same-origin; the header lets the server refuse cross-site writes.
async function call<T>(path:string,{method,body,signal}:{method?:string;body?:unknown;signal?:AbortSignal}={}):Promise<T>{
 const verb=method||(body===undefined?'GET':'POST');
 const r=await fetch('/api/'+path,{method:verb,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(verb!=='GET'?{'X-Summ-Request':'1'}:{})},body:body!==undefined?JSON.stringify(body):undefined,signal:signal||AbortSignal.timeout(verb==='GET'?8000:300000),credentials:'same-origin'});
 if(!r.headers.get('content-type')?.includes('application/json'))throw new ApiError('No Inkling server was found at this address. File imports and original-passage reading still work.',r.status);
 const data=await r.json();if(!r.ok)throw new ApiError(typeof data.detail==='string'?data.detail:'Request failed ('+r.status+').',r.status);return data as T;
}
export const config=()=>call<AppConfig>('config');
export const me=()=>call<Account>('me').catch(e=>{if(e instanceof ApiError&&e.status===401)return null;throw e;});
export const register=(username:string,password:string)=>call<Account>('auth/register',{body:{username,password}});
export const login=(username:string,password:string)=>call<Account>('auth/login',{body:{username,password}});
export const googleLogin=(credential:string)=>call<Account>('auth/google',{body:{credential}});
export const logout=()=>call<{ok:boolean}>('auth/logout',{body:{}});
export const deleteAccount=()=>call<{ok:boolean}>('me',{method:'DELETE'});
export const saveKey=(key:{api_key?:string;model:string;price_in:number|null;price_out:number|null})=>call<Account>('me/key',{method:'PUT',body:key});
export const removeKey=()=>call<Account>('me/key',{method:'DELETE'});
export const importUrl=(url:string)=>call<{text:string;title:string;url:string;warnings:string[]}>('import',{body:{url}});
export const summarize=(s:Settings,chapter:Chapter,signal?:AbortSignal)=>call<Summary>('summarize',{body:{chapter,depth:s.depth,purpose:s.purpose,language:s.language,review:s.review},signal});
export const composeSummary=(s:Settings,title:string,sections:SummarySection[],kind:'chapter'|'book',signal?:AbortSignal)=>call<Overview>('compose',{body:{title,sections,language:s.language,kind},signal});
export const guide=(s:Settings,title:string,author:string,sections:SummarySection[],signal?:AbortSignal)=>call<Guide>('guide',{body:{title,author,sections,language:s.language},signal});
export const bookInfo=(title:string,author:string,volumeId?:string)=>call<BookInfo>('book-info?'+new URLSearchParams({title,author,...(volumeId?{google_volume_id:volumeId}:{})}),{signal:AbortSignal.timeout(30000)});
export const searchGoogleBooks=(q:string,signal:AbortSignal)=>call<{items:GoogleBookEdition[]}>('books/search?'+new URLSearchParams({q}),{signal});
export const saveVoiceKey=(key:{api_key?:string;voice:string})=>call<Account>('me/voice-key',{method:'PUT',body:key});
export const removeVoiceKey=()=>call<Account>('me/voice-key',{method:'DELETE'});
// Binary endpoints return the bytes on success and JSON details on failure.
async function binary(path:string,init:RequestInit):Promise<Blob>{
 const r=await fetch('/api/'+path,{credentials:'same-origin',...init});
 if(r.ok)return r.blob();
 const data=r.headers.get('content-type')?.includes('application/json')?await r.json():{};throw new ApiError(typeof data.detail==='string'?data.detail:'Request failed ('+r.status+').',r.status);
}
const post=(body:unknown,signal?:AbortSignal):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json','X-Summ-Request':'1'},body:JSON.stringify(body),signal:signal||AbortSignal.timeout(300000)});
export const coverImage=(src:string)=>binary('cover?'+new URLSearchParams({src}),{signal:AbortSignal.timeout(30000)});
export const pdfReport=(doc:unknown)=>binary('pdf',post(doc));
export const narrate=(text:string,language:string,engine:'offline'|'elevenlabs',signal?:AbortSignal)=>binary('audio',post({text,language,engine},signal));
// ---- editors and the public library
export const askEditor=(message:string)=>call<Account>('editor-request',{body:{message}});
export const people=()=>call<People>('people');
export const approvePerson=(id:string)=>call<People>('people/'+id+'/approve',{body:{}});
export const rejectPerson=(id:string)=>call<People>('people/'+id+'/reject',{body:{}});
export const revokePerson=(id:string)=>call<People>('people/'+id,{method:'DELETE'});
export const libraryList=()=>call<{books:PubBook[]}>('library').then(r=>r.books);
export const libraryMine=()=>call<{books:PubBook[]}>('library/mine').then(r=>r.books);
export const libraryBook=(key:string)=>call<PubBook&{doc:PubDoc}>('library/'+encodeURIComponent(key));
export const publishBook=(body:{id?:string;doc:PubDoc;visibility:'public'|'unlisted'})=>call<PubBook&{doc:PubDoc}>('library',{body});
export const unpublishBook=(id:string)=>call<{ok:boolean}>('library/'+id,{method:'DELETE'});
export const setVisibility=(id:string,visibility:'public'|'unlisted')=>call<PubBook&{doc:PubDoc}>('library/'+id+'/visibility',{method:'PUT',body:{visibility}});
export const uploadCover=(id:string,blob:Blob)=>binary('library/'+id+'/cover',{method:'PUT',headers:{'Content-Type':blob.type||'image/jpeg','X-Summ-Request':'1'},body:blob,signal:AbortSignal.timeout(60000)});
export const startNarration=(id:string,language:string,type?:string)=>call<NarrationStatus>('library/'+id+'/narration',{body:{language,type}});
export const narrationStatus=(id:string,language:string)=>call<NarrationStatus>('library/'+id+'/narration/'+language);
export const summaryKey=(book:string,hash:string,c:Chapter,s:Settings,model='')=>[book,hash,c.id,c.title,c.blocks.map(b=>b.id).join(','),s.depth,s.purpose,s.language,s.review,model,'v2'].join(':');
export const artSearch=(q:string)=>call<{results:ArtResult[]}>('art/search?q='+encodeURIComponent(q)).then(r=>r.results);
export const setSlide=(id:string,mode:'none'|'cover'|'art',file?:string)=>call<NonNullable<PubBook['slide']>>('library/'+id+'/slide',{method:'PUT',body:{mode,file}});
export const researchReview=(body:{title:string;author:string;year:string;language:string})=>call<Review>('review/research',{body,signal:AbortSignal.timeout(200000)});
export const uploadFigure=(id:string,name:string,blob:Blob)=>binary('library/'+id+'/figure/'+name,{method:'PUT',headers:{'Content-Type':blob.type||'image/png','X-Summ-Request':'1'},body:blob,signal:AbortSignal.timeout(60000)});
