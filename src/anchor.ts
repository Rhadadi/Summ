// Where a highlight sits in a chapter: the passage itself plus a little text before and after it, so it can be found
// again after the page is rebuilt, on another device, or when the same words occur twice (as web annotations do).
export interface Anchor{quote:string;prefix:string;suffix:string}
const CONTEXT=32;

/** The occurrence of the passage whose surroundings match best; null when the passage is no longer there. */
export function locate(text:string,a:Anchor):{start:number;end:number}|null{
 if(!a.quote)return null;
 let best=-1,score=-1;
 for(let i=text.indexOf(a.quote);i>=0;i=text.indexOf(a.quote,i+1)){
  let s=0;
  for(let k=1;k<=a.prefix.length&&i-k>=0&&text[i-k]===a.prefix[a.prefix.length-k];k++)s++;
  const e=i+a.quote.length;
  for(let k=0;k<a.suffix.length&&e+k<text.length&&text[e+k]===a.suffix[k];k++)s++;
  if(s>score){score=s;best=i;}
 }
 return best<0?null:{start:best,end:best+a.quote.length};
}
/** The passage between two offsets, trimmed of surrounding spaces, with its context. */
export function anchorOf(text:string,start:number,end:number):{anchor:Anchor;start:number;end:number}|null{
 while(start<end&&/\s/.test(text[start]))start++;
 while(end>start&&/\s/.test(text[end-1]))end--;
 if(end<=start)return null;
 return{anchor:{quote:text.slice(start,end),prefix:text.slice(Math.max(0,start-CONTEXT),start),suffix:text.slice(end,end+CONTEXT)},start,end};
}

// ---- the page: the summary's own text, without headings, page chips or buttons
const TEXT='.r2-p p, .r2-quote';
const SKIP='.refs, h2, button, .mk-bubble';
export function summaryNodes(root:Element):Text[]{
 const out:Text[]=[];
 const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>{const el=n.parentElement;return el&&el.closest(TEXT)&&!el.closest(SKIP)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});
 for(let n=walk.nextNode();n;n=walk.nextNode())out.push(n as Text);
 return out;
}
const joined=(nodes:Text[])=>nodes.map(n=>n.data).join('');
function offsetOf(nodes:Text[],container:Node,offset:number):number{
 let sum=0;
 if(container.nodeType===Node.TEXT_NODE){for(const n of nodes){if(n===container)return sum+offset;sum+=n.length;}}
 const at=document.createRange();at.setStart(container,offset);at.collapse(true);
 sum=0;for(const n of nodes){if(at.comparePoint(n,n.length)<0)sum+=n.length;else break;}
 return sum;
}
/** A selection inside the summary as an anchor; null when it is outside the summary or empty. */
export function anchorFromRange(root:Element,range:Range):Anchor|null{
 if(!root.contains(range.commonAncestorContainer))return null;
 const nodes=summaryNodes(root);if(!nodes.length)return null;
 const inside=(c:Node)=>{const el=c.nodeType===Node.TEXT_NODE?c.parentElement:c as Element;return!!el?.closest(TEXT);};
 if(!inside(range.startContainer)&&!inside(range.endContainer))return null;
 const text=joined(nodes);
 return anchorOf(text,offsetOf(nodes,range.startContainer,range.startOffset),offsetOf(nodes,range.endContainer,range.endOffset))?.anchor||null;
}
/** The page range of an anchor, or null when its passage cannot be found. */
export function rangeOf(root:Element,a:Anchor,nodes=summaryNodes(root)):Range|null{
 const hit=locate(joined(nodes),a);if(!hit)return null;
 const r=document.createRange();let sum=0,started=false;
 for(const n of nodes){
  const end=sum+n.length;
  if(!started&&hit.start<end){r.setStart(n,hit.start-sum);started=true;}
  if(started&&hit.end<=end){r.setEnd(n,hit.end-sum);return r;}
  sum=end;
 }
 return null;
}
/** A passage known only by its words (copied text): its anchor in this chapter, if it is there. */
export function anchorForQuote(root:Element,quote:string):Anchor|null{
 const text=joined(summaryNodes(root)),i=text.indexOf(quote.trim());
 return i<0?null:anchorOf(text,i,i+quote.trim().length)?.anchor||null;
}
