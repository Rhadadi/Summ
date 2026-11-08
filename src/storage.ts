import type{Book,SavedPassage,Settings,Summary}from './types';
export const defaults:Settings={depth:'detailed',purpose:'understand',review:'off',language:'en',apiUrl:'',token:'',fontSize:19,dark:false};
const database=new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('summ-reader',1);r.onupgradeneeded=()=>{for(const n of ['books','files','passages','summaries'])r.result.createObjectStore(n);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function request<T>(name:string,method:'get'|'getAll'|'put'|'delete',key?:IDBValidKey,value?:unknown):Promise<T>{
 const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction(name,['put','delete'].includes(method)?'readwrite':'readonly');const s=tx.objectStore(name);const r=method==='put'?s.put(value,key):method==='delete'?s.delete(key!):method==='get'?s.get(key!):s.getAll();let result:T;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
}
export const store={
 books:()=>request<Book[]>('books','getAll'),saveBook:(b:Book)=>request('books','put',b.id,b),
 saveFile:(id:string,f:Blob)=>request('files','put',id,f),file:(id:string)=>request<Blob|undefined>('files','get',id),
 passages:()=>request<SavedPassage[]>('passages','getAll'),savePassage:(p:SavedPassage)=>request('passages','put',p.id,p),deletePassage:(id:string)=>request('passages','delete',id),
 summary:(id:string)=>request<Summary|undefined>('summaries','get',id),saveSummary:(id:string,s:Summary)=>request('summaries','put',id,s),
 async deleteBook(id:string){
  await request('books','delete',id);await request('files','delete',id);
  for(const p of await this.passages())if(p.bookId===id)await this.deletePassage(p.id);
  const db=await database;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('summaries','readwrite');const r=tx.objectStore('summaries').openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith(id+':'))c.delete();c.continue();}};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
 }
};
export function loadSettings():Settings{try{return{...defaults,...JSON.parse(localStorage.getItem('summ-settings')||'{}'),token:sessionStorage.getItem('summ-token')||''};}catch{return{...defaults};}}
export function saveSettings(s:Settings){const{token,...rest}=s;localStorage.setItem('summ-settings',JSON.stringify(rest));if(token)sessionStorage.setItem('summ-token',token);else sessionStorage.removeItem('summ-token');}
