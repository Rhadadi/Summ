import type{ParsedBlock}from'./structured-import.ts';

// Check prose after parsing, so original titles used solely to match source chapters stay available.
const englishProse=(value:string)=>{
 const text=value.replace(/https?:\/\/\S+|\([^)]*\)/g,'');
 const latin=(text.match(/\p{Script=Latin}/gu)||[]).length;
 const persian=(text.match(/\p{Script=Arabic}/gu)||[]).length;
 return latin>=20&&latin>persian*1.2;
};
export function persianImportIssue(block:ParsedBlock):string|null{
 const prose=[block.bookTitle,...block.overview.flatMap(p=>[p.heading||'',p.text,p.image?.alt||'',...(p.table||[]).flat()]),
  ...block.takeaways.flatMap(p=>[p.heading||'',p.text]),
  ...block.sections.flatMap(s=>[s.title,...s.items.flatMap(p=>[p.heading||'',p.text,p.image?.alt||'',...(p.table||[]).flat()])]),
  ...block.chapters.flatMap(c=>[c.title,...c.paragraphs.flatMap(p=>[p.heading||'',p.text,p.image?.alt||'',...(p.table||[]).flat()])])];
 if(prose.some(englishProse))return 'This summary still has English or mixed prose. Translate every title, heading, paragraph, caption and table cell into natural Persian, then import it again. Original chapter titles used for matching may stay in English.';
 if(!prose.some(s=>(s.match(/\p{Script=Arabic}/gu)||[]).length>=8))return 'No Persian summary text was found. Add the Persian translation before importing.';
 return null;
}
