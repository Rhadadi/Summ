// Which of the reader's own keys are saved in their Osareh account. The keys themselves stay encrypted on the server,
// which uses them for the study companion (Gemini) and voice-note transcripts (ElevenLabs); only their presence is known here.
import{useEffect,useState}from'react';
import{me}from'./api';
export interface AccountKeys{gemini:{model:string;hint:string}|null;voice:boolean;loaded:boolean}
const EVENT='inkling-account';
let cached:Promise<AccountKeys>|null=null;
const none:AccountKeys={gemini:null,voice:false,loaded:false};
function load():Promise<AccountKeys>{
 return cached||(cached=me().then(a=>a?{gemini:a.key?{model:a.key.model,hint:a.key.hint}:null,voice:!!a.voice,loaded:true}:{...none,loaded:true}).catch(()=>{cached=null;return{...none,loaded:true};}));
}
/** Call after signing in or out, or after saving or removing a key in Account. */
export function accountChanged(){cached=null;window.dispatchEvent(new Event(EVENT));}
export function useAccountKeys():AccountKeys{
 const[k,setK]=useState<AccountKeys>(none);
 useEffect(()=>{let live=true;const get=()=>{load().then(v=>{if(live)setK(v);});};get();window.addEventListener(EVENT,get);return()=>{live=false;window.removeEventListener(EVENT,get);};},[]);
 return k;
}
