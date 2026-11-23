import type{ParsedBlock}from'./structured-import.ts';
import type{PubDoc,PubPara}from'./types.ts';

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
const publicEnglishProse=(value:string)=>{
 if(englishProse(value))return true;
 if(label.test(value))return false;
 const text=value.replace(/https?:\/\/\S+|\([^)]*\)/g,'');
 const words=text.match(/[A-Za-z]+/g)||[];
 const persian=(text.match(/\p{Script=Arabic}/gu)||[]).length;
 return words.length>=6&&words.join('').length>=30&&persian<words.join('').length/2;
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

// Publishing has a stricter threshold than importing a draft. Original titles, author names and short foreign terms
// are useful metadata; substantial English sentences in text a Persian reader sees need a Persian version.
export function persianPublicFieldProblems(doc:PubDoc):string[]{
 const persian=doc.versions.filter(v=>v.language==='fa');if(!persian.length)return[];
 const found:string[]=[];
 const untranslatedTitle=(value:string|undefined)=>!!value&&(value.match(/\p{Script=Latin}/gu)||[]).length>=4&&(value.match(/\p{Script=Arabic}/gu)||[]).length<3;
 if(untranslatedTitle(doc.title.fa))found.push('The public book title is still in English. Add its Persian translation.');
 for(const c of doc.chapters){if(!c.title.fa?.trim())found.push('A chapter needs a Persian title.');else if(untranslatedTitle(c.title.fa))found.push('Chapter “'+c.title.fa+'” needs a Persian title.');}
 const check=(where:string,value:string|undefined)=>{if(value&&publicEnglishProse(value))found.push(where+' is still in English. Translate it into Persian.');};
 const list=(where:string,items:PubPara[]|undefined)=>{for(const p of items||[]){check(where,p.heading);check(where,p.text);check(where+' image description',p.image?.alt);if(p.table)for(const row of p.table)for(const cell of row)check(where+' table',cell);}};
 if(!persian.some(v=>v.overview?.paragraphs.some(p=>p.text.trim())))check('The book description',doc.info?.description);
 for(const v of persian){
  list('The Persian overview',v.overview?.paragraphs);list('A Persian key idea',v.overview?.takeaways);
  for(const c of doc.chapters){const name=c.title.fa||Object.values(c.title)[0]||c.id;
   list('Chapter “'+name+'”',v.chapters[c.id]?.paragraphs);
   list('The review of chapter “'+name+'”',v.chapters[c.id]?.review);
  }
  for(const s of v.guide?.sections||[]){check('The Persian study guide',s.title);list('The Persian study guide',s.items);}
 }
 if(doc.review){
  const r=doc.review;
  for(const[where,value]of [['The reception verdict',r.verdict],['The reader audience',r.audience],['About the author',r.aboutAuthor],['The book’s influence',r.impact]] as const)check(where,value);
  for(const value of [...r.pros,...r.cons,...(r.themes||[]),...(r.similar||[]).map(s=>s.why)])check('The reception',value);
  for(const c of r.critics||[]){check('A critic summary',c.summary);check('A critic quote',c.translation||c.excerpt);}
  for(const reader of r.readers||[]){check('A reader summary',reader.summary);check('A reader quote',reader.translation||reader.excerpt);}
  for(const q of r.quotes)check('A reception quote',q.text);
 }
 return found.length>6?[...found.slice(0,6),'And '+(found.length-6)+' more Persian fields still contain English prose.']:found;
}
