// Pictures come in smaller sizes for slow and metered connections: the server makes WebP copies at a few widths.
export const sized=<T extends string|null|undefined>(url:T,w:number):T=>(url&&url.startsWith('/api/library/')?url+(url.includes('?')?'&':'?')+'w='+w:url) as T;
export const srcSet=(url:string)=>url.startsWith('/api/library/')?[480,800,1280,1600].map(w=>sized(url,w)+' '+w+'w').join(', '):undefined;
