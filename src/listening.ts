export interface ListeningPlace{signature:string;index:number;seconds:number;rate:number}
const rates=[.75,1,1.25,1.5,1.75,2];
export function validPlace(value:unknown,signature:string,count:number):ListeningPlace|null{
 const v=value as ListeningPlace|null;return v&&v.signature===signature&&Number.isInteger(v.index)&&v.index>=0&&v.index<count&&Number.isFinite(v.seconds)&&v.seconds>=0&&rates.includes(v.rate)?v:null;
}
export function listeningPlace(id:string,signature:string,count:number){try{return validPlace(JSON.parse(localStorage.getItem('inkling-audio:'+id)||'null'),signature,count);}catch{return null;}}
export function saveListening(id:string,place:ListeningPlace){try{localStorage.setItem('inkling-audio:'+id,JSON.stringify(place));}catch{/* Storage can be disabled. */}}
export function partTitle(tracks:{title:string;chapterId?:string|null}[],index:number,lang:string){
 const track=tracks[index],same=tracks.map((t,i)=>({t,i})).filter(({t})=>t.chapterId===track.chapterId&&t.title===track.title);
 const title=lang==='fa'&&track.title==='Overview'?'مرور کلی':track.title;
 return same.length<2?title:title+(lang==='fa'?' — بخش ':' — part ')+(same.findIndex(x=>x.i===index)+1).toLocaleString(lang==='fa'?'fa-IR':'en')+(lang==='fa'?' از ':' of ')+same.length.toLocaleString(lang==='fa'?'fa-IR':'en');
}

export function trackSignature(tracks:{title:string;chapterId?:string|null;url?:string;text:string}[]){const text=JSON.stringify(tracks.map(t=>[t.title,t.chapterId,t.url||t.text]));let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}

// What Listen may offer for the language and version being read. Until the narration status arrives, the book's own
// `audio` list (languages that have audio) decides, so the button does not flicker.
export interface AudioStatus{status:string;type?:string;tracks:{chapterId:string|null}[]}
export function audioFor(status:AudioStatus|null|undefined,pubAudio:string[]|undefined,language:string,type:string){
 if(!status)return{known:false,book:!!pubAudio?.includes(language),overview:false,chapters:new Set<string>()};
 // Old rows have no type and match any version. A first run still in progress has no tracks yet; a regeneration keeps the old ones.
 const mine=status.tracks.length>0&&(!status.type||status.type===type);
 return{known:true,book:mine,overview:mine&&status.tracks.some(t=>!t.chapterId),chapters:new Set(mine?status.tracks.flatMap(t=>t.chapterId?[t.chapterId]:[]):[])};
}
// Chapter and overview buttons: the book must have audio, and (once known) this chapter must have a track.
export const canListenTo=(a:ReturnType<typeof audioFor>,chapterId:string|null)=>a.book&&(!a.known||(chapterId?a.chapters.has(chapterId):a.overview));
