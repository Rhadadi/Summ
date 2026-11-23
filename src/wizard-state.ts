import type{ArtResult,Summary,SummaryParagraph}from'./types';
import type{ChapterChoice,Proposal,Source}from'./new-book';

export type WizardVoice='none'|'offline'|'elevenlabs';
export interface SavedWizardState{
 version:1;fileName:string;step:number;proposal:Proposal;chapters:ChapterChoice[];
 chapterEdits:Record<string,SummaryParagraph[]>;
 wants:{details:boolean;reception:boolean;background:boolean;overview:boolean};
 voices:Record<string,WizardVoice>;visibility:'public'|'unlisted';slide:'art'|'cover'|'none';
 fit:'fill'|'whole';artPick:ArtResult|null;coverChoice:'zip'|'saved'|'none';
 singleChapterConfirmed:boolean;stagedId:string|null;stagedRev:string|null;
}
export const chapterEditKey=(versionId:string,chapterId:string)=>versionId+'::'+chapterId;
export function withChapterParagraphs(source:Source,versionId:string,chapterId:string,paragraphs:SummaryParagraph[]):Source{
 return{...source,versions:source.versions.map(v=>{
  if(v.id!==versionId)return v;
  const old=v.report.chapters[chapterId];
  const summary:Summary=old?{...old,paragraphs}:{paragraphs,review:[],processed_blocks:0,total_blocks:0,language:v.language,mode:'ai',checked:false,model:'manual'};
  return{...v,report:{...v.report,chapters:{...v.report.chapters,[chapterId]:summary}}};
 })};
}
export function applyChapterEdits(source:Source,edits:SavedWizardState['chapterEdits']):Source{
 let result=source;
 for(const[key,paragraphs]of Object.entries(edits)){
  const at=key.indexOf('::');if(at<0)continue;
  result=withChapterParagraphs(result,key.slice(0,at),key.slice(at+2),paragraphs);
 }
 return result;
}
