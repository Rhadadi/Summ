import{Fragment}from'react';
import{parseInline}from'./inline.ts';
// A paragraph's text with its **bold** and *italic* shown; the markers themselves never reach the page.
export default function Inline({text}:{text:string}){
 if(!text.includes('*'))return <>{text}</>;
 return <>{parseInline(text).map((x,k)=>{const t=<Fragment key={k}>{x.text}</Fragment>;const i=x.i?<em key={k}>{t}</em>:t;return x.b?<strong key={k}>{i}</strong>:i;})}</>;
}
