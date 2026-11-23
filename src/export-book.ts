// A published summary as a file to keep: an EPUB for e-readers, or a clean printable page the browser saves as PDF.
// Pure apart from makeEpub (JSZip) and printBook (a new window); the HTML is built here so both read the same.
import{parseInline}from'./inline.ts';

export interface ExportPara{heading?:string;text:string;quote?:boolean;table?:string[][]}
export interface ExportSection{id:string;title:string;paragraphs:ExportPara[];takeaways?:string[]}
export interface ExportMeta{id:string;title:string;author:string;language:string;rtl:boolean;url:string;note:string}

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function inlineHtml(text:string):string{
 return parseInline(text).map(x=>{let t=esc(x.text);if(x.i)t='<em>'+t+'</em>';if(x.b)t='<strong>'+t+'</strong>';return t;}).join('');
}
export function sectionHtml(s:ExportSection):string{
 const out=['<h1>'+esc(s.title)+'</h1>'];
 if(s.takeaways?.length)out.push('<ul class="takeaways">'+s.takeaways.map(t=>'<li>'+inlineHtml(t)+'</li>').join('')+'</ul>');
 for(const p of s.paragraphs){
  if(p.heading)out.push('<h2>'+esc(p.heading)+'</h2>');
  if(p.table?.length)out.push('<table><thead><tr>'+p.table[0].map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+p.table.slice(1).map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>');
  else if(p.text)out.push(p.quote?'<blockquote>'+inlineHtml(p.text)+'</blockquote>':'<p>'+inlineHtml(p.text)+'</p>');
 }
 return out.join('\n');
}
const CSS=`body{font-family:serif;line-height:1.75;margin:0 5%}h1{font-size:1.6em;line-height:1.3;margin:1.2em 0 .8em}h2{font-size:1.15em;margin:1.6em 0 .4em}
p{margin:0 0 1em;text-align:start}blockquote{margin:1.2em 0;padding:0 1em;border-inline-start:3px solid #b8893b;font-style:italic}
ul.takeaways{padding-inline-start:1.2em}table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #ccc;padding:.3em .5em}
.title{text-align:center;margin-top:30%}.title h1{font-size:2em}.title p{color:#555}.note{font-size:.85em;color:#666;margin-top:3em}`;

const xhtml=(m:ExportMeta,title:string,body:string)=>`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${m.language}" lang="${m.language}" dir="${m.rtl?'rtl':'ltr'}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body></html>`;

/** The files of the EPUB, in order (mimetype first). Exposed for tests; makeEpub zips them. */
export function epubFiles(m:ExportMeta,sections:ExportSection[],cover?:{data:Uint8Array;type:string}):[string,string|Uint8Array][]{
 const modified=new Date().toISOString().replace(/\.\d+Z$/,'Z');
 const ext=cover?.type.includes('png')?'png':'jpg';
 const items=sections.map((s,i)=>({file:'s'+(i+1)+'.xhtml',id:'s'+(i+1),title:s.title,html:sectionHtml(s)}));
 const titlePage=xhtml(m,m.title,`<div class="title"><h1>${esc(m.title)}</h1>${m.author?'<p>'+esc(m.author)+'</p>':''}<p class="note">${esc(m.note)}<br/>${esc(m.url)}</p></div>`);
 const nav=xhtml(m,m.title,`<nav epub:type="toc" id="toc"><h1>${esc(m.title)}</h1><ol>${items.map(x=>`<li><a href="${x.file}">${esc(x.title)}</a></li>`).join('')}</ol></nav>`);
 const opf=`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${m.language}" dir="${m.rtl?'rtl':'ltr'}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:inkling:${esc(m.id)}</dc:identifier><dc:title>${esc(m.title)}</dc:title><dc:language>${m.language}</dc:language>
${m.author?'<dc:creator>'+esc(m.author)+'</dc:creator>':''}<dc:publisher>Inkling</dc:publisher><meta property="dcterms:modified">${modified}</meta>${cover?'<meta name="cover" content="cover-image"/>':''}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${cover?`<item id="cover-image" href="cover.${ext}" media-type="${cover.type}" properties="cover-image"/>`:''}
${items.map(x=>`<item id="${x.id}" href="${x.file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine${m.rtl?' page-progression-direction="rtl"':''}><itemref idref="title"/><itemref idref="nav" linear="no"/>${items.map(x=>`<itemref idref="${x.id}"/>`).join('')}</spine>
</package>`;
 return [
  ['mimetype','application/epub+zip'],
  ['META-INF/container.xml','<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
  ['OEBPS/content.opf',opf],['OEBPS/nav.xhtml',nav],['OEBPS/style.css',CSS],['OEBPS/title.xhtml',titlePage],
  ...(cover?[['OEBPS/cover.'+ext,cover.data] as [string,Uint8Array]]:[]),
  ...items.map(x=>['OEBPS/'+x.file,xhtml(m,x.title,x.html)] as [string,string]),
 ];
}
export async function makeEpub(m:ExportMeta,sections:ExportSection[],cover?:{data:Uint8Array;type:string}):Promise<Blob>{
 const{default:JSZip}=await import('jszip');
 const zip=new JSZip();
 for(const[name,data]of epubFiles(m,sections,cover))zip.file(name,data,name==='mimetype'?{compression:'STORE'}:undefined);
 return zip.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'});
}
export const fileName=(title:string,ext:string)=>(title.replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'book')+'.'+ext;
export function download(blob:Blob,name:string){
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
 setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
}
/** A printable page with the whole summary; the browser's print dialog saves it as PDF. */
export function printBook(m:ExportMeta,sections:ExportSection[],font:string){
 const w=window.open('','_blank');if(!w)return false;
 // the page's own fonts come along: its @font-face rules, with their addresses made absolute
 const faces:string[]=[];
 for(const sheet of Array.from(document.styleSheets)){let rules:CSSRuleList;try{rules=sheet.cssRules;}catch{continue;}
  for(const r of Array.from(rules))if(r instanceof CSSFontFaceRule)faces.push(r.cssText.replace(/url\(["']?([^"')]+)["']?\)/g,(_,u)=>'url("'+new URL(u,sheet.href||location.href).href+'")'));}
 w.document.write(`<!doctype html><html lang="${m.language}" dir="${m.rtl?'rtl':'ltr'}"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>${faces.join('\n')}${CSS}body{font-family:${font};max-width:720px;margin:0 auto;padding:24px;color:#1c1c1c}section{break-before:page}@page{margin:18mm}</style></head>
<body><div class="title"><h1>${esc(m.title)}</h1>${m.author?'<p>'+esc(m.author)+'</p>':''}<p class="note">${esc(m.note)}<br>${esc(m.url)}</p></div>
${sections.map(s=>'<section>'+sectionHtml(s)+'</section>').join('\n')}
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300));<\/script></body></html>`);
 w.document.close();return true;
}
