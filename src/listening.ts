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
