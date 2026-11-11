import type{Book,ImportedSummaries,ImportedSummary,SummaryImage}from './types.ts';
import type JSZip from 'jszip';

const MAX_MARKDOWN=2*1024*1024;
const MAX_IMAGES=48*1024*1024;
const MAX_IMAGE_COUNT=200;
const markdownFile=/\.(md|markdown)$/i;
const imageTypes:Record<string,string>={
 png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml',
};
function imageType(path:string){
 const extension=path.match(/\.([a-z]+)$/i)?.[1].toLowerCase();
 return extension&&Object.hasOwn(imageTypes,extension)?imageTypes[extension]:'';
}

export function detectSummaryLanguage(markdown:string,fallback='en'){
 const prose=markdown.slice(0,24000).replace(/https?:\/\/\S+|!\[[^\]]*\]\([^\n]*?\)/gi,'');
 const arabic=prose.match(/\p{Script=Arabic}/gu)?.length??0;
 const latin=prose.match(/\p{Script=Latin}/gu)?.length??0;
 if(arabic>=5&&arabic*2>=latin)return fallback==='ar'&&!/[پچژگ]/.test(prose)?'ar':'fa';
 if(latin>=20&&latin>arabic*4&&['en','fa','ar'].includes(fallback))return 'en';
 return fallback;
}

export function importedSummaryVersions(saved:ImportedSummaries|ImportedSummary|undefined):ImportedSummaries|null{
 if(!saved)return null;
 if('versions' in saved)return saved;
 const language=detectSummaryLanguage(saved.markdown);
 return{latestLanguage:language,versions:{[language]:saved}};
}

export function summaryPrompt(book:Pick<Book,'title'|'author'|'chapters'>,language:string,persian=false){
 const source=book.title+(book.author&&book.author!=='Author not supplied'?' by '+book.author:'');
 const contents=book.chapters.map((chapter,index)=>`${index+1}. ${chapter.title.replace(/\s+/g,' ').trim()}`).join('\n');
 const chapterExample=persian?'### فصل ۱ — عنوان فارسی فصل':'### Chapter 1 — Chapter title';
 const sectionExample=persian?'خلاصهٔ فصل‌ها':'Section-by-section summary';
 return `Read the document I attach and create a detailed, source-grounded study guide for ${source}. Write the guide in ${language}.

Use ${language} for all prose, section headings, chapter titles, captions, alt text, and table headings. Translate the original chapter titles. Keep the source order and write a separate summary for every substantive chapter. Do not include a parallel translation in another language.

Return the complete guide as Markdown, with no preamble or surrounding code fence. Use this structure:
- # [Document title]
- ## Overview: Explain the central argument, story, or purpose, and how the document is organized.
- ## Key takeaways: List the most important ideas and why they matter.
- ## ${sectionExample}: Use a numbered Markdown heading for every chapter, for example ${chapterExample}. Explain the main claims or events, reasoning, evidence, important examples, and qualifications. For fiction, track changes in characters, relationships, and themes. For research, cover methods, results, and limitations.
- ## Key concepts and connections: Define important terms and explain how ideas connect across the document.
- ## Evidence and limitations: Distinguish the author's claims from your interpretation. Note gaps, uncertainty, and sections you could not read.
- ## Figures and tables: Include significant figures with descriptive alt text and a caption when you can supply the actual image. Use Markdown image syntax, such as ![Description](images/figure-1.png). Keep images alongside the Markdown in their referenced folders and package them together as a ZIP if you can provide files. If you cannot supply an image, describe the original figure and cite its page. Reproduce important tabular findings as Markdown tables when useful.

Add page or section references beside key claims and examples. If page numbers are unavailable, use the section title translated into the output language. Preserve names, dates, numbers, units, and uncertainty. Use only the attached document, flag anything you cannot verify, and do not invent quotes, references, or image links.

Contents from the uploaded source, for checking chapter order and coverage:
${contents}`;
}

const chapterGroup=/^(?:chapter[ -]by[ -]chapter|section[ -]by[ -]section|(?:chapter|section) summaries|(?:خلاصه|مرور|چکیده).*فصل|فصل(?:[‌\s-]*ها|\s+به\s+فصل))/iu;
const chapterLabel=/^(?:(?:chapter|section|part)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five)\b|(?:فصل|بخش)\s+(?:[\d۰-۹٠-٩]+|[\p{Script=Arabic}]+)|[\d۰-۹٠-٩]+\s*[.،:–—-]\s*)/iu;

export function importedChapterHeadings(headings:{level:number;title:string}[]){
 let groupLevel=0,chapterLevel=0;
 const indexes:number[]=[];
 for(const [index,{level,title}] of headings.entries()){
  if(groupLevel&&level<=groupLevel){groupLevel=0;chapterLevel=0;}
  if(chapterGroup.test(title)){groupLevel=level;chapterLevel=0;continue;}
  if(groupLevel){
   chapterLevel||=level;
   if(level===chapterLevel)indexes.push(index);
  }else if(chapterLabel.test(title))indexes.push(index);
 }
 return indexes;
}

export function summaryMarkdown(text:string){
 const trimmed=text.trim();
 const fenced=trimmed.match(/^(`{3,}|~{3,})(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n\1$/i);
 return fenced?fenced[2].trim():trimmed;
}

export const exportedImagePath=/^(?:sandbox:\/mnt\/data\/|attachment:)/i;
export function summaryImagePath(sourcePath:string,src:string):string|null{
 if(exportedImagePath.test(src)){
  sourcePath='';
  src=src.replace(exportedImagePath,'');
 }
 if(!src||/^[a-z][a-z\d+.-]*:|^\/\//i.test(src))return null;
 try{
  const path=decodeURIComponent(src.split(/[?#]/,1)[0]);
  if(!path||path.includes('\\'))return null;
  const parts=path.startsWith('/')?[]:sourcePath.split('/').slice(0,-1);
  for(const part of path.split('/')){
   if(part==='..'){if(!parts.length)return null;parts.pop();}
   else if(part&&part!=='.')parts.push(part);
  }
  return parts.join('/')||null;
 }catch{return null;}
}

export function validateImportedSummary(summary:ImportedSummary){
 if(!summary.markdown.trim())throw Error('Paste a summary or choose a Markdown file.');
 if(new Blob([summary.markdown]).size>MAX_MARKDOWN)throw Error('The Markdown summary must be 2 MB or smaller.');
 if(summary.images.length>MAX_IMAGE_COUNT||summary.images.reduce((total,image)=>total+image.data.byteLength,0)>MAX_IMAGES)throw Error('Use up to 200 images and 48 MB of image files.');
}

export async function attachSummaryImages(files:File[],existing:SummaryImage[],sourcePath:string){
 const folder=sourcePath.slice(0,sourcePath.lastIndexOf('/')+1);
 const images=new Map(existing.map(image=>[image.path,image]));
 const additions=new Map(files.map(file=>[folder+file.name,file]));
 if(additions.size!==files.length)throw Error('Use a ZIP to keep images with the same filename in separate folders.');
 let total=0;
 for(const [path,image] of images)if(!additions.has(path))total+=image.data.byteLength;
 for(const file of files){
  if(!imageType(file.name))throw Error('Choose PNG, JPEG, GIF, WebP, AVIF, or SVG images.');
  total+=file.size;
 }
 const count=new Set([...images.keys(),...additions.keys()]).size;
 if(count>MAX_IMAGE_COUNT||total>MAX_IMAGES)throw Error('Use up to 200 images and 48 MB of image files.');
 for(const [path,file] of additions)images.set(path,{path,type:imageType(path),data:await file.arrayBuffer()});
 return [...images.values()];
}

// Stop decompressing oversized files before they can allocate an unbounded buffer.
function readZipEntry(entry:JSZip.JSZipObject,limit:number):Promise<ArrayBuffer>{
 const stream=(entry as JSZip.JSZipObject&{internalStream(type:'uint8array'):JSZip.JSZipStreamHelper<Uint8Array>}).internalStream('uint8array');
 return new Promise((resolve,reject)=>{
  const chunks:Uint8Array[]=[];
  let size=0;
  stream.on('data',chunk=>{
   size+=chunk.length;
   if(size>limit){stream.pause();reject(Error('The ZIP exceeds the Markdown or image size limit.'));return;}
   chunks.push(chunk);
  }).on('error',reject).on('end',()=>{
   const bytes=new Uint8Array(size);
   let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   resolve(bytes.buffer);
  }).resume();
 });
}

export interface SummaryDocument{name:string;markdown:string}
// A ZIP may hold several summaries (one Markdown file per style or language); the images are shared.
export async function readSummaryFiles(file:File):Promise<{documents:SummaryDocument[];images:SummaryImage[]}>{
 if(markdownFile.test(file.name)){
  if(file.size>MAX_MARKDOWN)throw Error('The Markdown summary must be 2 MB or smaller.');
  return{documents:[{name:file.name,markdown:summaryMarkdown(await file.text())}],images:[]};
 }
 if(!/\.zip$/i.test(file.name))throw Error('Choose a Markdown (.md or .markdown) or ZIP file.');
 if(file.size>50*1024*1024)throw Error('The ZIP must be 50 MB or smaller.');
 const {default:Zip}=await import('jszip');
 const zip=await Zip.loadAsync(await file.arrayBuffer());
 const files=Object.values(zip.files).filter(entry=>!entry.dir&&!entry.name.startsWith('__MACOSX/'));
 const documents=files.filter(entry=>markdownFile.test(entry.name));
 if(!documents.length)throw Error('The ZIP has no Markdown summary in it.');
 if(documents.length>12)throw Error('The ZIP holds more than 12 Markdown files.');
 const assets=files.filter(entry=>imageType(entry.name));
 if(assets.length>MAX_IMAGE_COUNT)throw Error('The ZIP must contain 200 images or fewer.');
 const texts:SummaryDocument[]=[];let budget=MAX_MARKDOWN*2;
 for(const document of documents){
  const data=await readZipEntry(document,Math.min(MAX_MARKDOWN,budget));budget-=data.byteLength;
  texts.push({name:document.name,markdown:summaryMarkdown(new TextDecoder().decode(data))});
 }
 const images:SummaryImage[]=[];
 let remaining=MAX_IMAGES;
 for(const asset of assets){
  const data=await readZipEntry(asset,remaining);
  remaining-=data.byteLength;
  images.push({path:asset.name,type:imageType(asset.name),data});
 }
 return{documents:texts,images};
}
export async function readSummaryFile(file:File):Promise<ImportedSummary>{
 const{documents,images}=await readSummaryFiles(file);
 if(documents.length!==1)throw Error('The ZIP must contain exactly one Markdown summary.');
 return{markdown:documents[0].markdown,sourcePath:documents[0].name,images};
}
