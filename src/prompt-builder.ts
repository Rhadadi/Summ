import type{Book}from'./types.ts';

// The prompt a person pastes into another AI. Every choice in the import wizard changes the text.
export interface SummaryType{id:string;label:string;hint:string;words:string;instruction:string}
export const summaryTypes:SummaryType[]=[
 {id:'glance',label:'At a glance',hint:'A few sentences per chapter',words:'40–80',instruction:'the single most important idea of the chapter, in two or three sentences'},
 {id:'overview',label:'Overview',hint:'One short paragraph per chapter',words:'120–200',instruction:'the main argument or events, the key examples, and why the chapter matters'},
 {id:'detailed',label:'Detailed',hint:'Several paragraphs per chapter',words:'350–550',instruction:'the main claims or events in order, the reasoning, the evidence and examples that carry it, and the author\'s qualifications'},
 {id:'comprehensive',label:'Comprehensive',hint:'Close to a condensed chapter',words:'700–1000',instruction:'every substantive point in the order the author makes it, with the supporting evidence, definitions, examples, objections and conclusions, so a reader could skip the chapter'},
 {id:'academic',label:'Academic',hint:'Thesis, method, evidence, critique',words:'400–650',instruction:'the thesis, the method or mode of argument, the evidence used, how it relates to existing scholarship the text mentions, and its limitations; use precise, scholarly language'},
 {id:'study',label:'Study guide',hint:'Key terms and review questions',words:'250–400',instruction:'a short summary, then a list of key terms with one-line definitions, then three to five review questions that test understanding'},
 {id:'practical',label:'Practical takeaways',hint:'What to do with the ideas',words:'200–350',instruction:'the ideas a reader can apply, written as concrete lessons, each with the reason the author gives for it'},
 {id:'simple',label:'Plain language',hint:'Easy to read, no jargon',words:'150–250',instruction:'the chapter explained in simple, everyday words, as if to a curious newcomer, with any necessary term explained the first time it appears'},
];
export const audiences=[{id:'general',label:'General reader'},{id:'student',label:'Student'},{id:'expert',label:'Expert in the field'}];
export const tones=[{id:'neutral',label:'Neutral'},{id:'engaging',label:'Engaging'},{id:'formal',label:'Formal'}];
export interface PromptOptions{
 chapters:number[];types:string[];languages:{code:string;name:string}[];audience:string;tone:string;
 pageRefs:boolean;overview:boolean;takeaways:boolean;glossary:boolean;quotes:boolean;notes:string;
}
export const defaultOptions=(language:{code:string;name:string}):PromptOptions=>({chapters:[],types:['detailed'],languages:[language],audience:'general',tone:'neutral',pageRefs:true,overview:true,takeaways:true,glossary:false,quotes:false,notes:''});
const clean=(t:string)=>t.replace(/\s+/g,' ').trim();
// The book's own chapter numbers would clash with the numbers we ask the answer to use.
const plain=(t:string)=>clean(t).replace(/^\d+[.)\s]+(?=\S)/,'');
const named=(t:string)=>t&&t===t.toUpperCase()&&/\p{Lu}/u.test(t)?t.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu,(_,a,b)=>a+b.toUpperCase()):t;
function pageSpan(chapter:Book['chapters'][number]){
 const pages=chapter.blocks.map(b=>b.page).filter((n):n is number=>!!n);
 return pages.length?(Math.min(...pages)===Math.max(...pages)?'p. '+pages[0]:'pp. '+Math.min(...pages)+'–'+Math.max(...pages)):'';
}
export function buildPrompt(book:Pick<Book,'title'|'author'|'chapters'>,o:PromptOptions):string{
 const author=book.author&&book.author!=='Author not supplied'?' by '+named(book.author):'';
 const types=summaryTypes.filter(t=>o.types.includes(t.id));
 const picked=[...o.chapters].sort((a,b)=>a-b).filter(i=>book.chapters[i]);
 const langs=o.languages.length?o.languages:[{code:'en',name:'English'}];
 const combos=langs.flatMap(l=>types.map(t=>({l,t})));
 const list=picked.map(i=>`${i+1}. ${plain(book.chapters[i].title)}${pageSpan(book.chapters[i])?' ('+pageSpan(book.chapters[i])+')':''}`).join('\n');
 const audience={general:'a curious general reader',student:'a student who must understand and remember the material',expert:'an expert in the field who wants precision rather than introductions'}[o.audience]||'a general reader';
 const tone={neutral:'a clear, neutral voice',engaging:'an engaging, vivid voice that makes the reader want to keep reading, without exaggerating',formal:'a formal, measured voice'}[o.tone]||'a clear voice';
 const out:string[]=[];
 out.push(`Read the document I attach and write ${combos.length>1?combos.length+' separate summaries':'a summary'} of ${clean(book.title)}${author}. Use only the attached document. Write for ${audience}, in ${tone}.`);
 out.push(`CHAPTERS TO COVER — summarize exactly these ${picked.length} chapter${picked.length===1?'':'s'}, in this order, and ignore every other part of the document. Keep the numbers shown; they are how I will match your answer to the book.\n${list||'(none selected)'}`);
 out.push(`SUMMARIES TO WRITE\n${combos.map(({l,t},i)=>`${i+1}. ${t.label} summary in ${l.name} — for each chapter write ${t.words} words: ${t.instruction}.`).join('\n')}`);
 out.push(`LANGUAGE\nWrite every word of each summary in its stated language: the headings, chapter titles, labels, lists and captions. ${langs.some(l=>l.code!=='en')?'Translate the original chapter titles into that language; do not leave them in the source language. ':''}Never put a translation of the same text in another language beside it. Keep proper names, numbers, dates and units exact${langs.some(l=>l.code==='fa'||l.code==='ar')?', and use Western digits (1, 2, 3) in chapter numbers and page references':''}.`);
 const extras=[
  o.overview?'a short "Overview" section before the chapters: the central argument, story or purpose and how the document is organized':'',
  o.takeaways?'a "Key takeaways" section: the most important ideas and why they matter':'',
  o.glossary?'a "Key terms" section after the chapters, defining the important terms':'',
 ].filter(Boolean);
 const head=(code:string)=>code==='fa'?'## ۱. عنوان فارسی فصل':'## 1. Chapter title in the output language';
 out.push(`OUTPUT FORMAT — return plain Markdown with no preamble and no surrounding code fence.\nStart each summary with this exact delimiter line, then its content:\n${combos.map(({l,t})=>`=== INKLING: type=${t.id}; language=${l.code} ===`).join('\n')}\n\nInside each summary use this structure:\n- "# " the document title, in the summary's language\n${extras.map(e=>'- '+e).join('\n')}${extras.length?'\n':''}- one heading per chapter, in the form "## <number>. <chapter title>" using the number from my list (for example "${head(langs[0].code).replace('۱','1')}"), followed by that chapter's summary; use "###" headings only for sub-topics inside a chapter`);
 out.push(`ACCURACY\n${o.pageRefs?'Put a page reference in square brackets after each key claim, such as [p. 143] or [pp. 10–12]; where the document has no page numbers, leave it out. ':''}${o.quotes?'You may quote short phrases (under 25 words) in quotation marks, each with its page. ':'Do not quote the text at length; put ideas in your own words. '}Distinguish what the author claims from your own interpretation. Do not invent facts, quotes or page numbers. If part of the document cannot be read, say so in one line under that chapter instead of guessing.`);
 if(combos.length>1)out.push(`If the answer is too long for one message, finish the summary you are on, then stop; I will reply "continue" and you will resume with the next delimiter line.`);
 if(o.notes.trim())out.push('EXTRA INSTRUCTIONS FROM ME\n'+o.notes.trim());
 return out.join('\n\n');
}
export const labelFor=(typeId:string)=>summaryTypes.find(t=>t.id===typeId)?.label||typeId;
