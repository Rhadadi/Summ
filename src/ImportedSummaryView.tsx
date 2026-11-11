import{memo,useEffect,useMemo,useRef,useState}from 'react';
import Markdown,{defaultUrlTransform}from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type{Element,Root,RootContent}from 'hast';
import type{ImportedSummary}from './types';
import{exportedImagePath,importedChapterHeadings,summaryImagePath}from './summary-import';

const plugins=[remarkGfm];
const linkedImage=/^https:\/\//i;
const embeddedImage=/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i;
const arabicScript=/\p{Script=Arabic}/u;
const persianHeadings=new Map([
 ['overview','نمای کلی'],['key takeaways','نکته‌های کلیدی'],['section-by-section summary','خلاصهٔ فصل‌ها'],
 ['chapter-by-chapter summary','خلاصهٔ فصل‌ها'],['key concepts and connections','مفاهیم و ارتباط‌ها'],
 ['evidence and limitations','شواهد و محدودیت‌ها'],['figures and tables','شکل‌ها و جدول‌ها'],
]);

function textContent(node:RootContent):string{
 if(node.type==='text')return node.value;
 return node.type==='element'&&node.tagName!=='pre'?node.children.map(textContent).join(''):'';
}

function hasImage(node:RootContent):boolean{
 return node.type==='element'&&(node.tagName==='img'||node.children.some(hasImage));
}

function element(tagName:string,children:Element['children']):Element{
 return{type:'element',tagName,properties:{},children};
}

function persianChapterTitle(title:string,index:number){
 const number=title.match(/^(?:(?:chapter|section|part|فصل|بخش)\s+)?(\d+)/i)?.[1];
 const label='فصل '+(number?Number(number):index+1).toLocaleString('fa',{useGrouping:false});
 if(!arabicScript.test(title))return label;
 if(/^(?:chapter|section|part)\s/i.test(title))return label+' — '+title.slice(title.search(arabicScript));
 return title.replace(/^(?:(?:فصل|بخش)\s+)?\d+/,prefix=>prefix.replace(/\d/g,digit=>Number(digit).toLocaleString('fa')));
}

function summaryOutline(persian:boolean){
 return(tree:Root)=>{
  const headings=tree.children.flatMap((node,position)=>node.type==='element'&&/^h[1-6]$/.test(node.tagName)?[{node,position,level:Number(node.tagName[1]),title:textContent(node).trim()}]:[]);
  const chapters=importedChapterHeadings(headings);
  for(const [chapterIndex,index] of chapters.entries()){
   const {node,title}=headings[index];
   node.properties.dataSummaryChapter='true';
   if(!persian)continue;
   const translated=persianChapterTitle(title,chapterIndex);
   if(translated!==title)node.children=[{type:'text',value:translated}];
  }
  if(!persian)return;
  for(const {node,title} of headings){
   const translated=persianHeadings.get(title.toLowerCase());
   if(translated)node.children=[{type:'text',value:translated}];
  }
  // Leave figures visible even when a chapter's prose is only available in English.
  for(const [chapterIndex,index] of [...chapters.entries()].reverse()){
   const {position,level}=headings[index];
   const nextChapter=headings[chapters[chapterIndex+1]]?.position??tree.children.length;
   const nextSection=headings.slice(index+1).find(heading=>heading.level<=level)?.position??tree.children.length;
   const end=Math.min(nextChapter,nextSection);
   const body=tree.children.slice(position+1,end);
   const prose=body.map(textContent).join(' ');
   if(arabicScript.test(prose)||!/[a-z]{3}/i.test(prose))continue;
   const figures=body.filter(hasImage);
   const untranslated=body.filter((node):node is Element['children'][number]=>
    node.type!=='doctype'&&!hasImage(node));
   const details=element('details',[
    element('summary',[{type:'text',value:'متن فارسی این فصل وارد نشده است. نمایش متن انگلیسی'}]),
    {...element('div',untranslated),properties:{dir:'ltr',lang:'en'}},
   ]);
   tree.children.splice(position+1,end-position-1,details,...figures);
  }
 };
}

export default memo(function ImportedSummaryView({summary,language,expectedChapters}:{summary:ImportedSummary;language:string;expectedChapters:number}){
 const [assets,setAssets]=useState<{summary:ImportedSummary;urls:Map<string,string>;names:Map<string,string|null>}>();
 const [chapters,setChapters]=useState<HTMLHeadingElement[]>();
 const content=useRef<HTMLDivElement>(null);
 const persian=language==='fa';
 const outline=useMemo(()=>[()=>summaryOutline(persian)],[persian]);
 useEffect(()=>{
  const urls=new Map(summary.images.map(image=>[image.path,URL.createObjectURL(new Blob([image.data],{type:image.type}))]));
  const names=new Map<string,string|null>();
  for(const [path,url] of urls){const name=path.split('/').pop()!;names.set(name,names.has(name)?null:url);}
  setAssets({summary,urls,names});
  return()=>{for(const url of urls.values())URL.revokeObjectURL(url);};
 },[summary]);
 useEffect(()=>{setChapters(Array.from(content.current?.querySelectorAll<HTMLHeadingElement>('[data-summary-chapter]')??[]));},[summary,language]);

 return <article className="doc imported-summary" aria-label="Imported summary" lang={language} dir={persian||language==='ar'?'rtl':'ltr'}>
  <p className="doc-src">{persian?'خلاصهٔ واردشده · با متن اصلی مقایسه کنید':'Imported summary · Review against the original text'}</p>
  {persian&&chapters&&chapters.length<expectedChapters&&<p className="doc-src">تعداد عنوان‌های فصل در این خلاصه کمتر از تعداد فصل‌های منبع است. برای تکمیل فصل‌ها می‌توانید از دستور فارسی استفاده کنید.</p>}
  {!!chapters?.length&&<nav className="imported-chapters" aria-label={persian?'فصل‌ها':'Imported chapters'}>
   <strong>{persian?'فصل‌ها':'Chapters'}</strong>
   <ol>{chapters.map((heading,index)=><li key={index}><button type="button" onClick={()=>heading.scrollIntoView({block:'start'})}>{heading.textContent}</button></li>)}</ol>
  </nav>}
  <div ref={content}>
   <Markdown remarkPlugins={plugins} rehypePlugins={outline} skipHtml urlTransform={(url,attribute)=>{
    if(attribute==='src')return embeddedImage.test(url)||exportedImagePath.test(url)?url:defaultUrlTransform(url);
    return /^(?:#|https?:\/\/|mailto:)/i.test(url)?defaultUrlTransform(url):'';
   }} components={{
    img:({src,alt,title})=>{
     if(typeof src!=='string')return null;
     const path=summaryImagePath(summary.sourcePath,src);
     const attached=assets?.summary===summary?assets:undefined;
     const local=path&&(attached?.urls.get(path)||attached?.names.get(path.split('/').pop()!));
     const image=local||(linkedImage.test(src)||embeddedImage.test(src)?src:'');
     const unavailable=persian?'تصویر در دسترس نیست':'Image unavailable';
     return image?<img src={image} alt={alt??''} title={title} loading="lazy" decoding="async" referrerPolicy="no-referrer"/>:
      <span className="summary-missing-image">{alt?unavailable+': '+alt:unavailable}</span>;
    },
    a:({href,id,title,children,'aria-label':label})=>href?.startsWith('#')?<a href={href} id={id} title={title} aria-label={label} onClick={event=>{
     event.preventDefault();
     const target=document.getElementById(href.slice(1));
     if(target&&event.currentTarget.closest('article')?.contains(target))target.scrollIntoView();
    }}>{children}</a>:href?<a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,
    table:({children})=><div className="summary-table"><table>{children}</table></div>,
   }}>{summary.markdown}</Markdown>
  </div>
 </article>;
});
