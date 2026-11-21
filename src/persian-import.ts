import type{ParsedBlock}from'./structured-import.ts';

// Check prose after parsing, so original titles used solely to match source chapters stay available.
// A label such as "Original title: …" or "عنوان اصلی: …" is the book's own title in its own language, not English prose; and a
// few Latin words (names, terms, a reference) among Persian are normal. Only a paragraph that is mostly English counts.
const label=/^\s*(?:original title|source title|عنوان اصلی|عنوان انگلیسی)\s*[:：]/i;
const englishProse=(value:string)=>{
 if(label.test(value))return false;
 const text=value.replace(/https?:\/\/\S+|\([^)]*\)/g,'');
 const latin=(text.match(/\p{Script=Latin}/gu)||[]).length;
 const persian=(text.match(/\p{Script=Arabic}/gu)||[]).length;
 return latin>=60&&latin>persian*1.2;
};
// The share of English paragraphs that makes a summary "not Persian": one stray paragraph in a long book does not.
const TOLERATED=.1;
export function persianImportIssue(block:ParsedBlock):string|null{
 const prose=[block.bookTitle,...block.overview.flatMap(p=>[p.heading||'',p.text,p.image?.alt||'',...(p.table||[]).flat()]),
  ...block.takeaways.flatMap(p=>[p.heading||'',p.text]),
  ...block.sections.flatMap(s=>[s.title,...s.items.flatMap(p=>[p.heading||'',p.text,p.image?.alt||'',...(p.table||[]).flat()])]),
  ...block.chapters.flatMap(c=>[c.title,...c.paragraphs.flatMap(p=>[p.heading||'',p.text,p.image?.alt||'',...(p.table||[]).flat()])])].filter(x=>x.trim());
 const english=prose.filter(englishProse);
 if(english.length&&english.length/prose.length>=TOLERATED)return 'About '+english.length+' of '+prose.length+' paragraphs are still in English, for example “'+english[0].slice(0,70).trim()+'…”. Translate them into Persian and import again, or import it as it is. Original chapter titles may stay in English.';
 if(!prose.some(s=>(s.match(/\p{Script=Arabic}/gu)||[]).length>=8))return 'No Persian summary text was found. Add the Persian translation before importing.';
 return null;
}
