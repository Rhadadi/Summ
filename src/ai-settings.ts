// The reader's own AI key for the study companion. It is kept in this browser only and sent straight to the provider
// (Anthropic, OpenAI or Google), never to the Inkling server.
import{useEffect,useState}from'react';
export type Provider='anthropic'|'openai'|'gemini';
export interface AiSettings{provider:Provider;keys:Partial<Record<Provider,string>>;models:Partial<Record<Provider,string>>}
export const PROVIDERS:{id:Provider;name:string;keyHint:string;keyUrl:string;models:{id:string;name:string;note:string}[]}[]=[
 {id:'anthropic',name:'Claude',keyHint:'sk-ant-…',keyUrl:'https://platform.claude.com/settings/keys',models:[
  {id:'claude-opus-5-5',name:'Claude Opus 5.5',note:'Best answers'},
  {id:'claude-sonnet-5-5',name:'Claude Sonnet 5.5',note:'Fast and strong'},
  {id:'claude-haiku-5-5',name:'Claude Haiku 5.5',note:'Quickest and cheapest'}]},
 {id:'openai',name:'ChatGPT',keyHint:'sk-…',keyUrl:'https://platform.openai.com/api-keys',models:[
  {id:'gpt-5',name:'GPT-5',note:'Best answers'},{id:'gpt-5-mini',name:'GPT-5 mini',note:'Fast and cheap'}]},
 {id:'gemini',name:'Gemini',keyHint:'AIza…',keyUrl:'https://aistudio.google.com/apikey',models:[
  {id:'gemini-pro-latest',name:'Gemini Pro',note:'Best answers'},{id:'gemini-flash-latest',name:'Gemini Flash',note:'Fast and cheap'}]},
];
const KEY='inkling-ai-v1',EVENT='inkling-ai';
export const defaults:AiSettings={provider:'anthropic',keys:{},models:{}};
export function loadAi():AiSettings{try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return s?{...defaults,...s,keys:s.keys||{},models:s.models||{}}:{...defaults};}catch{return{...defaults};}}
export function saveAi(s:AiSettings){try{localStorage.setItem(KEY,JSON.stringify(s));}catch{/* private mode */}window.dispatchEvent(new Event(EVENT));}
export const modelOf=(s:AiSettings,p=s.provider)=>s.models[p]||PROVIDERS.find(x=>x.id===p)!.models[0].id;
export const ready=(s:AiSettings)=>!!s.keys[s.provider]?.trim();
export function useAi():[AiSettings,(s:AiSettings)=>void]{
 const[s,set]=useState(loadAi);
 useEffect(()=>{const on=()=>set(loadAi());window.addEventListener(EVENT,on);window.addEventListener('storage',on);return()=>{window.removeEventListener(EVENT,on);window.removeEventListener('storage',on);};},[]);
 return[s,saveAi];
}
/** ⌘K on a Mac, Ctrl+K elsewhere (Windows, Linux). */
export const isMac=()=>typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent);
export const shortcutLabel=()=>isMac()?'⌘K':'Ctrl K';
export const isShortcut=(e:{key:string;metaKey:boolean;ctrlKey:boolean;altKey:boolean;shiftKey:boolean})=>(e.key==='k'||e.key==='K')&&!e.altKey&&!e.shiftKey&&(isMac()?e.metaKey&&!e.ctrlKey:e.ctrlKey&&!e.metaKey);
