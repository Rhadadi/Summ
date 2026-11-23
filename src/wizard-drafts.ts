import{ApiError,detailText}from'./api';

export interface WizardDraftMeta{id:string;title:string;updated:number;hasSource:boolean;hasCover:boolean}
export interface WizardDraft<T=unknown> extends WizardDraftMeta{state:T;revision:string}

async function json<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api/drafts'+path,{method,credentials:'same-origin',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(method==='GET'?{}:{'X-Summ-Request':'1'})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>({detail:'The draft server did not respond.'}));
 if(!response.ok)throw new ApiError(detailText(data.detail,response.status),response.status);
 return data as T;
}
async function bytes(path:string,method:string,body?:Blob):Promise<Blob>{
 const response=await fetch('/api/drafts'+path,{method,credentials:'same-origin',headers:method==='GET'?{}:{'X-Summ-Request':'1',...(body?{'Content-Type':body.type||'application/octet-stream'}:{})},body});
 if(!response.ok){const data=await response.json().catch(()=>({detail:'The file could not be saved.'}));throw new ApiError(detailText(data.detail,response.status),response.status);}
 return response.blob();
}
export const listWizardDrafts=()=>json<{drafts:WizardDraftMeta[]}>('');
export const createWizardDraft=<T>(state:T)=>json<WizardDraft<T>>('','POST',{state});
export const getWizardDraft=<T>(id:string)=>json<WizardDraft<T>>('/'+encodeURIComponent(id));
export const saveWizardDraft=<T>(id:string,state:T,base?:string)=>json<WizardDraft<T>>('/'+encodeURIComponent(id),'PUT',{state,...(base===undefined?{}:{base})});
export const deleteWizardDraft=(id:string)=>json<{ok:boolean}>('/'+encodeURIComponent(id),'DELETE');
export const putDraftSource=(id:string,file:File)=>bytes('/'+encodeURIComponent(id)+'/source','PUT',file);
export const getDraftSource=(id:string)=>bytes('/'+encodeURIComponent(id)+'/source','GET');
export const putDraftCover=(id:string,cover:Blob)=>bytes('/'+encodeURIComponent(id)+'/cover','PUT',cover);
export const getDraftCover=(id:string)=>bytes('/'+encodeURIComponent(id)+'/cover','GET');
export const deleteDraftCover=(id:string)=>json<{ok:boolean}>('/'+encodeURIComponent(id)+'/cover','DELETE');
