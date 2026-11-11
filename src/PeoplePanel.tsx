import{useEffect,useState}from'react';
import{Alert,Button,CircularProgress}from'@mui/material';
import type{People}from'./types';
import{approvePerson,people,rejectPerson,revokePerson}from'./api';

// The owner decides who may import, generate and publish. Everyone else only reads.
export default function PeoplePanel(){
 const[data,setData]=useState<People|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 useEffect(()=>{people().then(setData).catch(e=>setError(e.message));},[]);
 const act=async(id:string,task:(id:string)=>Promise<People>)=>{setBusy(id);setError('');try{setData(await task(id));}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 return <div className="people-panel">
  <h3 className="settings-section-title">Editors</h3>
  <p className="settings-help">People you approve can import books, generate summaries with their own key, and publish. Everyone else can only read.</p>
  {error&&<Alert severity="error">{error}</Alert>}
  {!data&&!error&&<CircularProgress size={20}/>}
  {data&&<>
   {data.pending.length>0&&<><strong className="people-h">Waiting for your decision</strong>{data.pending.map(p=><div className="person" key={p.id}><div><strong dir="auto">{p.name}</strong>{p.email&&p.email!==p.name&&<small>{p.email}</small>}{p.message&&<p dir="auto">“{p.message}”</p>}</div><div className="person-actions"><Button size="small" variant="contained" disabled={busy===p.id} onClick={()=>act(p.id,approvePerson)}>Approve</Button><Button size="small" disabled={busy===p.id} onClick={()=>act(p.id,rejectPerson)}>Decline</Button></div></div>)}</>}
   <strong className="people-h">Current editors</strong>
   {data.editors.length?data.editors.map(p=><div className="person" key={p.id}><div><strong dir="auto">{p.name}</strong>{p.email&&p.email!==p.name&&<small>{p.email}</small>}</div><Button size="small" color="error" disabled={busy===p.id} onClick={()=>confirm('Remove editor access for '+p.name+'?')&&act(p.id,revokePerson)}>Remove</Button></div>):<p className="muted small">No editors yet.</p>}
  </>}
 </div>;
}
