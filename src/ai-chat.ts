// Streams one answer from the reader's chosen provider, straight from the browser with the reader's own key.
// Claude goes through Anthropic's SDK; ChatGPT and Gemini through their own HTTP APIs.
import Anthropic from'@anthropic-ai/sdk';
import type{Route}from'./ai-settings';
import type{Anchor}from'./anchor';
// a question about a passage keeps the passage, so the answer can be saved as a comment on it
export interface Turn{role:'user'|'assistant';text:string;quote?:string;anchor?:Anchor|null}
export class ChatError extends Error{constructor(message:string,public kind:'key'|'limit'|'network'|'refused'|'other'='other'){super(message);}}

export async function streamAnswer(r:Route,system:string,turns:Turn[],onText:(delta:string)=>void,signal:AbortSignal):Promise<string>{
 if(r.kind==='account')return account(system,turns,onText,signal);
 if(r.provider==='anthropic')return claude(r.key,r.model,system,turns,onText,signal);
 if(r.provider==='openai')return openai(r.key,r.model,system,turns,onText,signal);
 return gemini(r.key,r.model,system,turns,onText,signal);
}
// Through the Inkling server, which answers with the Gemini key saved in the reader's account (it never reaches the browser).
async function account(system:string,turns:Turn[],onText:(d:string)=>void,signal:AbortSignal){
 const r=await send('/api/companion/chat',{method:'POST',signal,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Summ-Request':'1'},body:JSON.stringify({system,turns:turns.map(t=>({role:t.role,text:t.text}))})});
 if(!r.ok){let detail='';try{const j=await r.json();detail=typeof j.detail==='string'?j.detail:'';}catch{/* not JSON */}
  throw new ChatError(detail||String(r.status),[401,412,422].includes(r.status)?'key':r.status===429?'limit':'other');}
 let out='';
 await events(r,d=>{let j:{text?:string;refused?:boolean;error?:string};try{j=JSON.parse(d);}catch{return;}
  if(j.text){out+=j.text;onText(j.text);}if(j.refused)throw new ChatError('refused','refused');if(j.error)throw new ChatError(j.error,'network');});
 return out;
}

async function claude(key:string,model:string,system:string,turns:Turn[],onText:(d:string)=>void,signal:AbortSignal):Promise<string>{
 // The key belongs to the reader and stays in their browser; it is sent to Anthropic only.
 const client=new Anthropic({apiKey:key,dangerouslyAllowBrowser:true});
 // Haiku has no server-side fallback; on Opus and Sonnet a declined answer is retried on a suitable model.
 const fallback=!model.startsWith('claude-haiku');
 try{
  const stream=client.beta.messages.stream({
   model,max_tokens:64000,
   // the chapter is the same on every turn: cached, follow-ups cost a fraction of the first question
   system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],
   messages:turns.map(t=>({role:t.role,content:t.text})),
   output_config:{effort:'medium'},
   ...(fallback?{betas:['server-side-fallback-2026-07-01'],fallbacks:'default' as const}:{}),
  },{signal});
  stream.on('text',onText);
  const final=await stream.finalMessage();
  if(final.stop_reason==='refusal')throw new ChatError('refused','refused');
  return final.content.map(b=>b.type==='text'?b.text:'').join('');
 }catch(e){
  if(e instanceof ChatError)throw e;
  if(e instanceof Anthropic.APIUserAbortError)throw e;
  if(e instanceof Anthropic.AuthenticationError||e instanceof Anthropic.PermissionDeniedError)throw new ChatError(e.message,'key');
  if(e instanceof Anthropic.RateLimitError)throw new ChatError(e.message,'limit');
  if(e instanceof Anthropic.APIConnectionError)throw new ChatError(e.message,'network');
  if(e instanceof Anthropic.APIError)throw new ChatError(e.message,'other');
  throw e;
 }
}

// Server-sent events: each "data:" line is one JSON chunk.
async function events(r:Response,each:(data:string)=>void){
 if(!r.body)return;
 const reader=r.body.getReader(),dec=new TextDecoder();let buf='';
 for(;;){const{value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});
  let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(line.startsWith('data:'))each(line.slice(5).trim());}}
}
async function failed(r:Response):Promise<never>{
 let detail='';try{const j=await r.json();detail=j.error?.message||j.error||'';}catch{/* not JSON */}
 throw new ChatError(String(detail||r.statusText||r.status),r.status===401||r.status===403||r.status===400&&/key/i.test(String(detail))?'key':r.status===429?'limit':'other');
}
async function send(url:string,init:RequestInit):Promise<Response>{
 try{return await fetch(url,init);}catch(e){if((e as Error).name==='AbortError')throw e;throw new ChatError((e as Error).message,'network');}
}
async function openai(key:string,model:string,system:string,turns:Turn[],onText:(d:string)=>void,signal:AbortSignal){
 const r=await send('https://api.openai.com/v1/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
  body:JSON.stringify({model,stream:true,messages:[{role:'system',content:system},...turns.map(t=>({role:t.role,content:t.text}))]})});
 if(!r.ok)await failed(r);
 let out='';
 await events(r,d=>{if(d==='[DONE]')return;try{const t=JSON.parse(d).choices?.[0]?.delta?.content;if(t){out+=t;onText(t);}}catch{/* partial line */}});
 return out;
}
async function gemini(key:string,model:string,system:string,turns:Turn[],onText:(d:string)=>void,signal:AbortSignal){
 const r=await send(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,{method:'POST',signal,headers:{'Content-Type':'application/json','x-goog-api-key':key},
  body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:turns.map(t=>({role:t.role==='assistant'?'model':'user',parts:[{text:t.text}]}))})});
 if(!r.ok)await failed(r);
 let out='';
 await events(r,d=>{try{const j=JSON.parse(d);const t=(j.candidates?.[0]?.content?.parts||[]).map((p:{text?:string})=>p.text||'').join('');if(t){out+=t;onText(t);}if(j.candidates?.[0]?.finishReason==='SAFETY')throw new ChatError('refused','refused');}catch(e){if(e instanceof ChatError)throw e;}});
 return out;
}
