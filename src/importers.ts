import JSZip from 'jszip';
import{chaptersFromText}from './core.ts';import type{Block,Book,Chapter}from './types';
import{pdfTextContent}from './pdf-text.ts';
import{cleanPages}from './pdf-clean.ts';import type{RawParagraph}from './pdf-clean.ts';
const MAX=12*1024*1024;
async function digest(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function textBook(text:string,title:string,author='',format='TEXT'):Promise<Book>{
 if(!text.trim())throw Error('No readable source text was found.');if(text.length>MAX)throw Error('Please split sources larger than 12 MB of extracted text.');
 const id=crypto.randomUUID();return{id,title:title.trim()||'Untitled source',author:author.trim()||'Author not supplied',format,category:'text',chapters:chaptersFromText(text,id),warnings:[],addedAt:Date.now(),lastRead:0,chapterIndex:0,completed:[],color:Math.floor(Math.random()*4),hash:await digest(new TextEncoder().encode(text).buffer as ArrayBuffer)};
}
const xml=(s:string)=>new DOMParser().parseFromString(s,'application/xml');
const els=(d:Document|Element,n:string)=>Array.from(d.getElementsByTagName('*')).filter(e=>e.localName===n);
function path(base:string,relative:string){const u=new URL(relative,'https://epub.invalid/'+base);if(u.origin!=='https://epub.invalid')throw Error('External EPUB resources are unsupported.');return decodeURIComponent(u.pathname.slice(1));}
function htmlText(d:Document){
 d.querySelectorAll('script,style,nav,header,footer,iframe,svg,noscript').forEach(e=>e.remove());
 const root=d.querySelector('article,main')||d.body||d.documentElement;
 const p=Array.from(root.querySelectorAll('h1,h2,h3,p,li,blockquote,pre,td,th')).filter(e=>!e.parentElement?.closest('p,li,blockquote,pre,td,th'));
 return p.length?p.map(e=>(/^h[123]$/i.test(e.tagName)?'# ':'')+(e.textContent||'').trim()).join('\n\n'):root.textContent||'';
}
export async function importFile(file:File,notify:(s:string)=>void):Promise<Book>{
 if(file.size>50*1024*1024)throw Error('Files up to 50 MB are supported.');
 const ext=file.name.split('.').pop()?.toLowerCase()||'';if(!['pdf','epub','txt','md','html','htm','vtt','srt'].includes(ext))throw Error('Choose a PDF, EPUB, text, HTML, Markdown, SRT, or VTT file.');
 const bytes=await file.arrayBuffer();const name=file.name.replace(/\.[^.]+$/,'');
 if(ext==='pdf')return pdfBook(bytes,name,notify);if(ext==='epub')return epubBook(bytes,name,notify);
 let text=new TextDecoder().decode(bytes);if(['html','htm'].includes(ext))text=htmlText(new DOMParser().parseFromString(text,'text/html'));
 const b=await textBook(text,name,'',['html','htm'].includes(ext)?'HTML':'TEXT');
 if(['vtt','srt'].includes(ext)){b.category='video';b.format='TRANSCRIPT';b.warnings.push('Transcript text only. Visual content has not been reviewed. Timestamp lines remain as supplied.');}
 return b;
}
// Covers come from the file itself: an EPUB's declared cover image, or the first PDF page that is not blank.
export async function extractCover(file:Blob,name:string):Promise<Blob|undefined>{
 const ext=name.split('.').pop()?.toLowerCase();
 try{
  if(ext==='epub'){
   const z=await JSZip.loadAsync(await file.arrayBuffer());const root=els(xml(await z.file('META-INF/container.xml')?.async('text')||'<x/>'),'rootfile')[0]?.getAttribute('full-path');
   const opf=root&&xml(await z.file(root)?.async('text')||'<x/>');if(!root||!opf)return;
   const items=els(opf,'item');const metaId=els(opf,'meta').find(m=>m.getAttribute('name')==='cover')?.getAttribute('content');
   const item=items.find(i=>i.getAttribute('properties')?.split(/\s+/).includes('cover-image'))||items.find(i=>i.getAttribute('id')===metaId);
   const href=item?.getAttribute('href');const entry=href&&z.file(path(root,href));
   if(!entry||!/^image\//.test(item!.getAttribute('media-type')||''))return;
   return new Blob([await entry.async('arraybuffer')],{type:item!.getAttribute('media-type')!});
  }
  if(ext!=='pdf'||typeof document==='undefined')return;
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const worker=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
  const task=pdfjs.getDocument({data:await file.arrayBuffer()});const pdf=await task.promise;
  try{
   // Publisher PDFs often open with blank or text-only pages; pick the most image-like of the first few.
   let best:{ink:number;canvas:HTMLCanvasElement}|undefined;
   for(let p=1;p<=Math.min(6,pdf.numPages);p++){
    const page=await pdf.getPage(p);const base=page.getViewport({scale:1});const viewport=page.getViewport({scale:700/base.width});
    const canvas=document.createElement('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);const context=canvas.getContext('2d')!;
    await page.render({canvasContext:context,canvas,viewport}).promise;
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let ink=0,seen=0;
    for(let i=0;i<pixels.length;i+=4*97){seen++;if(pixels[i]+pixels[i+1]+pixels[i+2]<690)ink++;}
    if(!best||ink/seen>best.ink)best={ink:ink/seen,canvas};
   }
   if(best&&best.ink>.12){const chosen=best.canvas;return await new Promise<Blob|undefined>(resolve=>chosen.toBlob(blob=>resolve(blob||undefined),'image/jpeg',.86));}
  }finally{await task.destroy();}
 }catch(e){console.warn('Summ could not extract a cover',e);}
}
async function epubBook(bytes:ArrayBuffer,name:string,notify:(s:string)=>void):Promise<Book>{
 const z=await JSZip.loadAsync(bytes);if(Object.keys(z.files).length>3000)throw Error('This EPUB contains too many files.');
 if(z.file('META-INF/encryption.xml'))throw Error('This EPUB declares encrypted resources. Please provide a DRM-free edition.');
 const container=await z.file('META-INF/container.xml')?.async('text');if(!container)throw Error('Not a valid EPUB.');
 const root=els(xml(container),'rootfile')[0]?.getAttribute('full-path');
 const content=root?await z.file(root)?.async('text'):undefined;if(!root||!content)throw Error('EPUB reading order not found.');
 const opf=xml(content);const title=els(opf,'title')[0]?.textContent?.trim()||name;const author=els(opf,'creator')[0]?.textContent?.trim()||'';
 const manifest=new Map(els(opf,'item').map(i=>[i.getAttribute('id'),i]));const spine=els(opf,'itemref').filter(i=>i.getAttribute('linear')!=='no');
 const titles=new Map<string,string>();const nav=els(opf,'item').find(i=>i.getAttribute('properties')?.split(/\s+/).includes('nav'));
 if(nav?.getAttribute('href')){
  const navpath=path(root,nav.getAttribute('href')!);const source=await z.file(navpath)?.async('text');
  if(source){const d=xml(source);const toc=els(d,'nav').find(n=>(n.getAttribute('epub:type')||n.getAttributeNS('http://www.idpf.org/2007/ops','type'))==='toc')||d.documentElement;
   for(const a of els(toc,'a')){const href=a.getAttribute('href');if(href){const p=path(navpath,href);if(!titles.has(p))titles.set(p,a.textContent?.trim()||'');}}
  }
 }
 const chapters:Chapter[]=[];let total=0;let tables=false;
 for(let i=0;i<spine.length;i++){
  notify('Reading EPUB section '+(i+1)+' of '+spine.length+'…');const item=manifest.get(spine[i].getAttribute('idref'));const href=item?.getAttribute('href');if(!href)continue;
  const p=path(root,href);const entry=z.file(p);if(!entry)throw Error('The EPUB is missing '+p);
  const size=(entry as unknown as{_data?:{uncompressedSize?:number}})._data?.uncompressedSize;if(size&&size>MAX)throw Error('An EPUB section is too large.');
  const source=await entry.async('text');total+=source.length;if(total>MAX)throw Error('The EPUB exceeds the extracted-text limit.');
  const d=new DOMParser().parseFromString(source,'text/html');tables ||=!!d.querySelector('table');
  const heading=titles.get(p)||d.querySelector('h1,h2,title')?.textContent?.trim()||'Section '+(i+1);
  const blocks=chaptersFromText(htmlText(d),'epub-'+i).flatMap(c=>c.blocks).map((b,j)=>({...b,id:'epub-'+i+'-b'+j,location:heading+' · Paragraph '+(j+1)}));
  if(blocks.length)chapters.push({id:'epub-c'+i,title:heading,blocks});
 }
 if(!chapters.length)throw Error('No readable EPUB text was found.');
 const b=await textBook('EPUB source',title,author,'EPUB');b.chapters=chapters;b.category='book';b.hash=await digest(bytes);b.importVersion=2;
 b.warnings.push('Contents follow the EPUB reading order. Footnotes may appear in separate sections. Review contents before generating summaries.');
 if(tables)b.warnings.push('Tables were imported as text; check numeric relationships against the original layout.');
 return b;
}
async function pdfBook(bytes:ArrayBuffer,name:string,notify:(s:string)=>void):Promise<Book>{
 // PDF.js's modern build targets Chrome/Firefox. Safari needs the polyfilled
 // build in both contexts; a compatible main module alone cannot fix a worker.
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const worker=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
 const task=pdfjs.getDocument({data:bytes.slice(0)});const pdf=await task.promise;
 try{
  if(pdf.numPages>2000)throw Error('Please split PDFs longer than 2,000 pages.');
  const raw:RawParagraph[][]=[];const empty:number[]=[];let total=0;
  for(let p=1;p<=pdf.numPages;p++){
   notify('Reading PDF page '+p+' of '+pdf.numPages+'…');const page=await pdf.getPage(p);const tc=await pdfTextContent(page);
   // Track each paragraph's average glyph height so footnotes can be told apart from body text.
   let paragraph='',weight=0,chars=0;let prevY:number|undefined;let prevH=12;const paragraphs:RawParagraph[]=[];
   const flush=()=>{if(paragraph.trim())paragraphs.push({text:paragraph.trim(),size:chars?weight/chars:prevH});paragraph='';weight=0;chars=0;};
   for(const item of tc.items){if(!('str'in item))continue;const y=item.transform[5],gap=prevY===undefined?0:Math.abs(y-prevY);
    if(gap>prevH*1.7&&paragraph.trim())flush();
    else if(gap>2&&paragraph&&!paragraph.endsWith(' '))paragraph+=' ';
    const h=Math.max(item.height||12,4);paragraph+=item.str+(item.hasEOL?'\n':' ');weight+=h*item.str.length;chars+=item.str.length;prevY=y;prevH=Math.max(h,8);
   }flush();const joined=paragraphs.map(x=>x.text).join('\n');total+=joined.length;if(total>MAX)throw Error('This PDF exceeds the extracted-text limit.');if(joined.length<30)empty.push(p);
   raw.push(paragraphs);page.cleanup();
  }
  const pages=cleanPages(raw);
  if(pages.every(p=>!p.length))throw Error('No text layer was found. OCR is needed; import a searchable PDF.');
  const boundaries:{title:string;page:number}[]=[];
  for(const item of await pdf.getOutline()||[]){
   try{const dest=typeof item.dest==='string'?await pdf.getDestination(item.dest):item.dest;if(!dest)continue;const p=typeof dest[0]==='number'?dest[0]+1:await pdf.getPageIndex(dest[0])+1;if(p>=1&&p<=pdf.numPages&&!boundaries.some(b=>b.page===p))boundaries.push({title:item.title,page:p});}catch{}
  }
  boundaries.sort((a,b)=>a.page-b.page);const inferred=!boundaries.length;
  if(inferred)for(let i=0;i<pages.length;i++){const first=pages[i][0]?.text.split('\n').slice(0,3).join(' ').trim();if(first&&/^(?:chapter|part|فصل|بخش)\s+[\p{L}\d]+/iu.test(first)&&first.length<180)boundaries.push({title:first,page:i+1});}
  if(!boundaries.length)boundaries.push({title:'Full document',page:1});else if(boundaries[0].page>1)boundaries.unshift({title:'Front matter',page:1});
  const chapters=boundaries.map((x,i)=>({id:'pdf-c'+i,title:x.title,blocks:pages.slice(x.page-1,(boundaries[i+1]?.page||pdf.numPages+1)-1).flat()})).filter(c=>c.blocks.length);
  const md=await pdf.getMetadata().catch(()=>null);const info=md?.info as{Title?:string;Author?:string}|undefined;
  const b=await textBook('PDF source',info?.Title||name,info?.Author||'','PDF');b.chapters=chapters;b.category='book';b.hash=await digest(bytes);b.importVersion=2;
  b.warnings.push('Page references use PDF file pages. Check complex columns, tables, formulas, and footnotes against the original.');
  if(inferred)b.warnings.push('Suggested outline: no usable PDF chapter bookmarks were found. Edit the contents if necessary.');
  if(empty.length)b.warnings.push(empty.length+' page(s) had little or no readable text: '+empty.slice(0,20).join(', ')+(empty.length>20?'…':'')+'. These may be blank or need OCR.');
  return b;
 }finally{await task.destroy();}
}
