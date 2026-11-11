import type{Book,BookInfo,SavedPassage,Settings,Summary,BookReport,ImportedSummaries,ImportedSummary,ImportedVersion}from './types';
import{importedSummaryVersions}from './summary-import';
export const defaults:Settings={depth:'detailed',purpose:'understand',review:'off',language:'en',fontSize:19,theme:'paper'};
const database=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('summ-reader',2);r.onupgradeneeded=()=>{for(const n of ['books','files','passages','summaries','covers','audio'])if(!r.result.objectStoreNames.contains(n))r.result.createObjectStore(n);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
interface StoredFile{version:1;data:ArrayBuffer;type:string}
async function request<T>(name:string,method:'get'|'getAll'|'put'|'delete',key?:IDBValidKey,value?:unknown):Promise<T>{
 const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction(name,['put','delete'].includes(method)?'readwrite':'readonly');const s=tx.objectStore(name);const r=method==='put'?s.put(value,key):method==='delete'?s.delete(key!):method==='get'?s.get(key!):s.getAll();let result:T;r.onsuccess=()=>{result=r.result;};r.onerror=()=>reject(r.error||new Error('Browser storage request failed. Check site storage permissions and available space.'));tx.oncomplete=()=>resolve(result);const failed=()=>reject(tx.error||r.error||new Error('Browser storage transaction failed. Check site storage permissions and available space.'));tx.onabort=failed;tx.onerror=failed;});
}
export const store={
 books:()=>request<Book[]>('books','getAll'),saveBook:(b:Book)=>request('books','put',b.id,b),
 // Persist bytes rather than a File/Blob: WebKit can fail serializing File
 // objects into IndexedDB. Recreate a Blob only when opening the original.
 async saveFile(id:string,f:Blob){const value:StoredFile={version:1,data:await f.arrayBuffer(),type:f.type};await request('files','put',id,value);},
 async file(id:string){const value=await request<StoredFile|Blob|undefined>('files','get',id);if(!value)return undefined;return value instanceof Blob?value:new Blob([value.data],{type:value.type});},
 passages:()=>request<SavedPassage[]>('passages','getAll'),savePassage:(p:SavedPassage)=>request('passages','put',p.id,p),deletePassage:(id:string)=>request('passages','delete',id),
 summary:(id:string)=>request<Summary|undefined>('summaries','get',id),saveSummary:(id:string,s:Summary)=>request('summaries','put',id,s),
 report:(id:string)=>request<BookReport|undefined>('summaries','get',id),saveReport:(id:string,r:BookReport)=>request('summaries','put',id,r),
 imports:async(bookId:string)=>(await request<ImportedVersion[]|undefined>('summaries','get',bookId+':imports'))||[],
 // Re-importing the same language and style replaces that version.
 async saveImports(bookId:string,versions:ImportedVersion[]){
  const db=await database;
  return new Promise<ImportedVersion[]>((resolve,reject)=>{
   const tx=db.transaction(['books','summaries'],'readwrite'),key=bookId+':imports';let result:ImportedVersion[]=[];
   const book=tx.objectStore('books').getKey(bookId);
   book.onsuccess=()=>{
    if(book.result===undefined){reject(new Error('This source is no longer in your library.'));return;}
    const current=tx.objectStore('summaries').get(key);
    current.onsuccess=()=>{const old:ImportedVersion[]=current.result||[];result=[...old.filter(o=>!versions.some(v=>v.id===o.id)),...versions];tx.objectStore('summaries').put(result,key);};
   };
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||new Error('Could not save the summary on this device.'));
  });
 },
 async deleteImport(bookId:string,id:string){const all=await this.imports(bookId);await request('summaries','put',bookId+':imports',all.filter(v=>v.id!==id));},
 async importedSummaries(bookId:string){return importedSummaryVersions(await request<ImportedSummaries|ImportedSummary|undefined>('summaries','get',bookId+':imported-summary'));},
 async saveImportedSummary(bookId:string,language:string,summary:ImportedSummary){
  const db=await database;
  return new Promise<ImportedSummaries>((resolve,reject)=>{
   const tx=db.transaction(['books','summaries'],'readwrite');
   const book=tx.objectStore('books').getKey(bookId);
   const summaries=tx.objectStore('summaries'),key=bookId+':imported-summary';
   let result:ImportedSummaries;
   book.onsuccess=()=>{
    if(book.result===undefined){reject(new Error('This source is no longer in your library.'));return;}
    const current=summaries.get(key);
    current.onsuccess=()=>{
     const existing=importedSummaryVersions(current.result);
     result={latestLanguage:language,versions:{...existing?.versions,[language]:summary}};
     summaries.put(result,key);
    };
   };
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(tx.error||new Error('Could not save the summary on this device.'));
  });
 },
 // The study guide page opens the most recent whole-book report for a book.
 latestReport:(bookId:string)=>request<string|undefined>('summaries','get',bookId+':latest-report'),setLatestReport:(bookId:string,key:string)=>request('summaries','put',bookId+':latest-report',key),
 info:(bookId:string)=>request<BookInfo|undefined>('summaries','get',bookId+':info'),
 async saveInfo(bookId:string,info:BookInfo,replace=false){
  const db=await database;
  return new Promise<BookInfo>((resolve,reject)=>{
   const tx=db.transaction('summaries','readwrite'),summaries=tx.objectStore('summaries'),key=bookId+':info';
   let result=info;
   const current=summaries.get(key);
   // A delayed automatic lookup must preserve a user's edition selection.
   current.onsuccess=()=>{if(current.result&&!replace)result=current.result;else summaries.put(info,key);};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);
  });
 },
 async cover(id:string){const value=await request<StoredFile&{source:string}|undefined>('covers','get',id);return value?{blob:new Blob([value.data],{type:value.type}),source:value.source}:undefined;},
 async saveCover(id:string,blob:Blob,source:'file'|'online',expectedUrl?:string){
  const value={version:1,data:await blob.arrayBuffer(),type:blob.type,source};
  if(source==='file'){await request('covers','put',id,value);return true;}
  const db=await database;
  return new Promise<boolean>((resolve,reject)=>{
   const tx=db.transaction(['covers','summaries'],'readwrite'),covers=tx.objectStore('covers');
   let saved=false;
   const info=tx.objectStore('summaries').get(id+':info');
   info.onsuccess=()=>{
    if(info.result?.covers[0]!==expectedUrl)return;
    const cover=covers.get(id);
    cover.onsuccess=()=>{if(cover.result?.source!=='file'){covers.put(value,id);saved=true;}};
   };
   tx.oncomplete=()=>resolve(saved);tx.onabort=()=>reject(tx.error);
  });
 },
 async audio(id:string){const value=await request<StoredFile|undefined>('audio','get',id);return value?new Blob([value.data],{type:value.type}):undefined;},
 async saveAudio(id:string,blob:Blob){await request('audio','put',id,{version:1,data:await blob.arrayBuffer(),type:blob.type});},
 async deleteBook(id:string){
  await request('books','delete',id);await request('files','delete',id);
  for(const p of await this.passages())if(p.bookId===id)await this.deletePassage(p.id);
  await request('covers','delete',id);
  const db=await database;await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['summaries','audio'],'readwrite');for(const name of ['summaries','audio']){const r=tx.objectStore(name).openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith(id+':'))c.delete();c.continue();}};}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
 }
};
export function loadSettings():Settings{try{const{apiUrl:_,token:__,dark,...saved}=JSON.parse(localStorage.getItem('summ-settings')||'{}');return{...defaults,...(dark?{theme:'night'}:{}),...saved};}catch{return{...defaults};}}
export function saveSettings(s:Settings){localStorage.setItem('summ-settings',JSON.stringify(s));}
