export type Depth='glance'|'overview'|'detailed'|'close';
export interface Block{id:string;text:string;location:string;page?:number}
export interface Chapter{id:string;title:string;blocks:Block[]}
export interface Book{id:string;title:string;author:string;format:string;category:'book'|'article'|'video'|'text';chapters:Chapter[];warnings:string[];addedAt:number;lastRead:number;chapterIndex:number;completed:string[];color:number;hash:string;demo?:boolean;url?:string}
export interface Settings{depth:Depth;purpose:'understand'|'learn'|'academic'|'apply';language:string;review:'off'|'internal';apiUrl:string;token:string;fontSize:number;dark:boolean}
export interface SavedPassage{id:string;bookId:string;chapterId:string;blockId:string;title:string;chapterTitle:string;text:string;location:string;savedAt:number}
export interface SummaryParagraph{text:string;evidence_ids:string[]}
export interface Summary{paragraphs:SummaryParagraph[];review:SummaryParagraph[];processed_blocks:number;total_blocks:number;language:string;mode:'ai';checked:boolean}
