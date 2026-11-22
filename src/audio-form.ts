// The logic behind the Audio panel, kept free of React so it can be tested: what a run covers, what it sends, what it costs.
import type{NarrationItem,NarrationStatus,PubDoc,VoiceSettings}from'./types';
import{plainInline}from'./inline.ts';
// What the Audio panel needs from the app: whether an ElevenLabs key is saved, the default voice, and how to open Account or update it.
export interface AudioEnv{hasKey:boolean;defaultVoice:string;onAccount:()=>void;onVoice:(a:import('./types').Account)=>void}
export type Engine='offline'|'elevenlabs';
export type Scope='all'|'changed'|'pick';
// ElevenLabs' recommended delivery for narration: a steady voice, no added style, speaker boost on, normal speed (mirrors server/audio.py).
export const RECOMMENDED={speed:1,stability:.55,similarity:.8,style:0,speakerBoost:true};
// Offline speed is offered between 0.8 and 1.3; ElevenLabs reads between 0.7 and 1.2.
export const OFFLINE_SPEED=[.8,1.3] as const,ELEVEN_SPEED=[.7,1.2] as const;
export const CONFIRM_ABOVE=10000;
export const USD_PER_1000=0.10;
export interface Form{engine:Engine;scope:Scope;picked:string[];offlineSpeed:number;voice:string;model:string;eleven:typeof RECOMMENDED}
export const startForm=():Form=>({engine:'offline',scope:'all',picked:[],offlineSpeed:1,voice:'',model:'',eleven:{...RECOMMENDED}});
const round=(n:number)=>Math.round(n*100)/100;
// Items whose audio is missing or was made from earlier text. Only meaningful once some audio exists.
export const changedKeys=(items:NarrationItem[],hasAudio:boolean)=>hasAudio?items.filter(i=>i.stale||!i.narrated).map(i=>i.key):[];
// undefined means the whole book (the server then replaces everything).
export function chosenKeys(f:Pick<Form,'scope'|'picked'>,items:NarrationItem[],hasAudio:boolean):string[]|undefined{
 if(f.scope==='changed')return changedKeys(items,hasAudio);
 if(f.scope==='pick')return items.filter(i=>f.picked.includes(i.key)).map(i=>i.key);
 return undefined;
}
export const charsOf=(items:NarrationItem[],keys:string[]|undefined)=>items.filter(i=>!keys||keys.includes(i.key)).reduce((n,i)=>n+i.chars,0);
// What the server is sent. Offline takes a speed only; ElevenLabs takes everything, with the voice and model only when chosen.
export function settingsOf(f:Form):VoiceSettings{
 if(f.engine==='offline')return{speed:round(f.offlineSpeed)};
 const e=f.eleven;return{...(f.voice?{voice:f.voice}:{}),...(f.model?{model:f.model}:{}),speed:round(e.speed),stability:round(e.stability),similarity:round(e.similarity),style:round(e.style),speakerBoost:e.speakerBoost};
}
// The form that made the existing audio, so Regenerate starts from the same choices.
export function formFrom(status:NarrationStatus|null,hasKey:boolean):Form{
 const f=startForm(),s=status?.settings||{};
 if(status?.engine==='elevenlabs'&&hasKey){
  f.engine='elevenlabs';f.voice=s.voice||'';f.model=s.model||'';
  f.eleven={speed:s.speed??1,stability:s.stability??RECOMMENDED.stability,similarity:s.similarity??RECOMMENDED.similarity,style:s.style??RECOMMENDED.style,speakerBoost:s.speakerBoost??RECOMMENDED.speakerBoost};
 }else if(status?.engine==='offline'&&s.speed)f.offlineSpeed=s.speed;
 return f;
}
export const needsConfirm=(engine:Engine,chars:number)=>engine==='elevenlabs'&&chars>CONFIRM_ABOVE;
export const costUsd=(chars:number)=>Math.round(chars/1000*USD_PER_1000*100)/100;
// A partial update with a different engine or voice leaves chapters in two voices.
export function mixesVoices(partial:boolean,status:NarrationStatus|null,engine:Engine,voice:string,defaultVoice:string){
 if(!partial||!status||!status.tracks.length)return false;
 if(status.engine==='mixed')return true;
 if(status.engine&&status.engine!==engine)return true;
 return engine==='elevenlabs'&&(status.settings?.voice||defaultVoice)!==(voice||defaultVoice);
}
// The sample read aloud by Preview: the start of the first chosen item, about 250 characters, cut at a sentence or word end.
export function sampleText(doc:PubDoc,language:string,type:string,keys:string[]|undefined,max=250):string{
 const v=doc.versions.find(x=>x.language===language&&x.type===type)||doc.versions.find(x=>x.language===language);if(!v)return'';
 const order=[...(v.overview?['overview']:[]),...doc.chapters.filter(c=>v.chapters[c.id]).map(c=>c.id)];
 const key=order.find(k=>!keys||keys.includes(k))||order[0];if(!key)return'';
 const paras=key==='overview'?v.overview?.paragraphs||[]:v.chapters[key]?.paragraphs||[];
 const text=paras.filter(p=>!p.image&&!p.table).map(p=>plainInline(p.text)).join(' ').replace(/\s+/g,' ').trim();
 if(text.length<=max)return text;
 const cut=text.slice(0,max),end=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('؟ '),cut.lastIndexOf('! '),cut.lastIndexOf('? '));
 return end>max*.5?cut.slice(0,end+1):cut.slice(0,Math.max(cut.lastIndexOf(' '),1));
}
export const minutes=(seconds:number)=>Math.max(1,Math.round(seconds/60));
// The label of the main button.
export function actionLabel(hasAudio:boolean,scope:Scope,count:number):{text:string;n:number}{
 if(!hasAudio)return{text:'Make audio',n:0};
 if(scope==='all')return{text:'Replace audio',n:0};
 return{text:count===1?'Update 1 chapter':'Update {n} chapters',n:count};
}
// Stale chapter keys to titles for the notice after a save ('overview' is the overview).
export function staleTitles(doc:PubDoc,language:string,keys:string[],overview:string):string[]{
 return keys.map(k=>k==='overview'?overview:(doc.chapters.find(c=>c.id===k)?.title[language]||Object.values(doc.chapters.find(c=>c.id===k)?.title||{})[0]||k));
}
