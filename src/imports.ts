import type{Book,BookReport,ImportedVersion,Summary,SummaryImage,SummaryParagraph}from'./types.ts';
import type{Mapping,ParaIn,ParsedBlock}from'./structured-import.ts';
import{summaryImagePath}from'./summary-import.ts';
import{summaryTypes}from'./prompt-builder.ts';

export const versionLabel=(type:string)=>summaryTypes.find(t=>t.id===type)?.label||(type?type[0].toUpperCase()+type.slice(1):'Summary');
// Chapter summaries use the same shape as generated ones, so the reader, the player and publishing need no special case.
export interface Files{sourcePath:string;images:SummaryImage[]}
export function buildVersion(block:ParsedBlock,mapped:Mapping[],language:string,type:string,files:Files={sourcePath:'',images:[]}):ImportedVersion{
 const chapters:Record<string,Summary>={},titles:Record<string,string>={},used=new Map<string,SummaryImage>();
 const paragraph=(p:ParaIn):SummaryParagraph=>{
  const out:SummaryParagraph={...(p.heading?{heading:p.heading}:{}),text:p.text,evidence_ids:[],...(p.pages?.length?{pages:p.pages}:{})};
  if(p.table)out.table=p.table;
  if(p.quote)out.quote=true;
  if(p.image){
   const path=summaryImagePath(files.sourcePath,p.image.src),found=path?files.images.find(i=>i.path===path):undefined;
   if(found){used.set(found.path,found);out.image={path:found.path,alt:p.image.alt};}
  }
  return out;
 };
 for(const{chapterId,parsed}of mapped){
  chapters[chapterId]={paragraphs:parsed.paragraphs.map(paragraph),review:[],processed_blocks:0,total_blocks:0,language,mode:'ai',checked:false,model:'imported'};
  if(parsed.title)titles[chapterId]=parsed.title;
 }
 const now=Date.now();
 const report:BookReport={model:'imported',language,createdAt:now,updatedAt:now,parts:{},chapters};
 if(block.overview.length||block.takeaways.length)report.overview={paragraphs:block.overview.map(paragraph),takeaways:block.takeaways.map(paragraph),checked:false,language,model:'imported'};
 if(block.sections.length)report.guide={type:'imported',type_label:versionLabel(type),model:'imported',sections:block.sections.map((s,i)=>({kind:'imported-'+i,title:s.title,items:s.items.map(paragraph)}))};
 return{id:language+':'+type,language,type,label:versionLabel(type),createdAt:now,bookTitle:block.bookTitle,titles,report,...(used.size?{images:[...used.values()]}:{})};
}
export const versionsFor=(versions:ImportedVersion[],language:string)=>versions.filter(v=>v.language===language);
// Choose what to show: the person's own language and style first, then any import in that language, then the newest import.
export function pickVersion(versions:ImportedVersion[],language:string,type?:string){
 if(!versions.length)return undefined;
 return versions.find(v=>v.language===language&&v.type===type)||versions.find(v=>v.language===language)||[...versions].sort((a,b)=>b.createdAt-a.createdAt)[0];
}
export const bookReadyLanguages=(versions:ImportedVersion[])=>[...new Set(versions.map(v=>v.language))];
export const mainCoverage=(version:ImportedVersion,book:Pick<Book,'chapters'>)=>book.chapters.filter(c=>version.report.chapters[c.id]).length;
