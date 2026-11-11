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
// A chapter titled only "1" reads as "Chapter 1" wherever the app lists chapters.
export const chapterLabel=(t:string)=>{const c=clean(t).replace(/^\d+[.)\s]+(?=\S)/,'');return /^\d+$/.test(c)?'Chapter '+c:c;};
export const audiences=[{id:'general',label:'General reader'},{id:'student',label:'Student'},{id:'expert',label:'Expert in the field'}];
export const tones=[{id:'neutral',label:'Neutral'},{id:'engaging',label:'Engaging'},{id:'formal',label:'Formal'}];
export interface PromptOptions{
 chapters:number[];types:string[];languages:{code:string;name:string}[];audience:string;tone:string;
 pageRefs:boolean;overview:boolean;takeaways:boolean;glossary:boolean;concepts:boolean;evidence:boolean;figures:boolean;quotes:boolean;notes:string;
}
export const defaultOptions=(language:{code:string;name:string}):PromptOptions=>({chapters:[],types:['detailed'],languages:[language],audience:'general',tone:'neutral',pageRefs:true,overview:true,takeaways:true,glossary:false,concepts:true,evidence:true,figures:true,quotes:false,notes:''});
const clean=(t:string)=>t.replace(/\s+/g,' ').trim();
// The book's own chapter numbers would clash with the numbers we ask the answer to use.
const plain=(t:string)=>{const c=clean(t).replace(/^\d+[.)\s]+(?=\S)/,'');return /^\d+$/.test(c)?'Chapter '+c:c;};
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
 out.push(`LANGUAGE\nWrite every word of each summary in its stated language: the headings, chapter titles, labels, lists, captions, image alt text and table headings. ${langs.some(l=>l.code!=='en')?'Translate the original chapter titles into that language; do not leave them in the source language. ':''}Never put a translation of the same text in another language beside it. Keep proper names, numbers, dates and units exact${langs.some(l=>l.code==='fa'||l.code==='ar')?', and use Western digits (1, 2, 3) in chapter numbers and page references':''}.`);
 const extras=[
  o.overview?'"Overview": the central argument, story or purpose, and how the document is organized':'',
  o.takeaways?'"Key takeaways": the most important ideas and why they matter':'',
 ].filter(Boolean);
 const after=[
  o.concepts?'"Key concepts and connections": define the important terms and explain how ideas connect across the document':'',
  o.glossary?'"Key terms": a short glossary':'',
  o.evidence?'"Evidence and limitations": separate the author\'s claims from your interpretation; note gaps, uncertainty and anything you could not read':'',
  o.figures?'"Figures and tables": list the significant figures and tables with a caption and page':'',
 ].filter(Boolean);
 const head=(code:string)=>code==='fa'?'## 1. عنوان فارسی فصل':'## 1. Chapter title in the output language';
 const delimiters=combos.map(({l,t})=>`=== INKLING: type=${t.id}; language=${l.code} ===`).join('\n');
 const figures=o.figures
  ?`FILES — If you can create files, return ONE ZIP named inkling-summary.zip that holds:\n- summary.md: every summary in this single Markdown file\n- images/: every figure, chart, diagram, map, photograph and image-based table that matters, saved as PNG or JPEG\nPlace each image in the chapter it belongs to with Markdown image syntax on its own line, such as ![Description in the output language](images/figure-3.png), followed by a caption and its page. Keep images next to summary.md in the folders the links name. Reproduce important tables as Markdown tables in the chapter. If you cannot make files, return the Markdown alone and describe each figure in words with its page; never invent an image link.`
  :'FILES — Return Markdown only: no images and no ZIP. Reproduce important tables as Markdown tables.';
 out.push(`OUTPUT FORMAT — Markdown with no preamble and no surrounding code fence inside the file.\nStart each summary with this exact delimiter line, then its content:\n${delimiters}\n\nInside each summary use this structure, in this order:\n- "# " the document title, in the summary's language\n${extras.map(e=>'- '+e).join('\n')}${extras.length?'\n':''}- one heading per chapter, in the form "## <number>. <chapter title>" using the number from my list (for example "${head(langs[0].code)}"), followed by that chapter's summary; use "###" headings only for sub-topics inside a chapter. For fiction, track changes in characters, relationships and themes; for research, cover methods, results and limitations.${after.length?'\n- after the chapters, one "## " section each for:\n'+after.map(e=>'  - '+e).join('\n'):''}\n\n${figures}`);
 out.push(`ACCURACY\n${o.pageRefs?'Put a page reference in square brackets after each key claim, such as [p. 143] or [pp. 10–12]; where the document has no page numbers, use the section title in the output language instead. ':''}${o.quotes?'You may quote short phrases (under 25 words) in quotation marks, each with its page. ':'Do not quote the text at length; put ideas in your own words. '}Preserve names, dates, numbers, units and uncertainty. Use only the attached document, flag anything you cannot verify, and do not invent quotes, references or image links. If part of the document cannot be read, say so in one line under that chapter instead of guessing.`);
 if(combos.length>1)out.push(`If the answer is too long for one message, finish the summary you are on, then stop; I will reply "continue" and you will resume with the next delimiter line.`);
 if(o.notes.trim())out.push('EXTRA INSTRUCTIONS FROM ME\n'+o.notes.trim());
 return out.join('\n\n');
}
export const labelFor=(typeId:string)=>summaryTypes.find(t=>t.id===typeId)?.label||typeId;
