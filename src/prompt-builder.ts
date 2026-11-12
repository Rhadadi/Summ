import type{Book}from'./types.ts';

// The prompt a person pastes into another AI. Every choice in the import wizard changes the text.
// Nothing here sets a length: the material decides how long a summary needs to be.
export interface SummaryType{id:string;label:string;hint:string;instruction:string}
export const summaryTypes:SummaryType[]=[
 {id:'glance',label:'At a glance',hint:'The idea of each chapter in a few sentences',instruction:'the single most important idea of the chapter, in a few sentences, with the one example that best carries it'},
 {id:'overview',label:'Overview',hint:'A short, readable account of each chapter',instruction:'the main argument or events, the key examples and why the chapter matters, in a few paragraphs'},
 {id:'detailed',label:'Detailed',hint:'The argument, evidence and examples, in full',instruction:'the main claims or events in order, the reasoning, the evidence, the examples and stories that carry it, and the author\'s qualifications, at the length the chapter needs'},
 {id:'comprehensive',label:'Comprehensive',hint:'Close to a condensed chapter',instruction:'every substantive point in the order the author makes it, with the supporting evidence, definitions, examples, case histories, objections and conclusions, so a reader could skip the chapter; do not economize'},
 {id:'academic',label:'Academic',hint:'Thesis, method, evidence, critique',instruction:'the thesis, the method or mode of argument, the evidence used, how it relates to the scholarship the text mentions, and its limitations, in precise scholarly language'},
 {id:'study',label:'Study guide',hint:'Key terms and review questions',instruction:'a summary, then the key terms with one-line definitions, then review questions that test understanding'},
 {id:'practical',label:'Practical takeaways',hint:'What to do with the ideas',instruction:'the ideas a reader can apply, written as concrete lessons, each with the reason and the example the author gives for it'},
 {id:'simple',label:'Plain language',hint:'Easy to read, no jargon',instruction:'the chapter explained in simple, everyday words, as if to a curious newcomer, with any necessary term explained the first time it appears'},
];
const clean=(t:string)=>t.replace(/\s+/g,' ').trim();
// A chapter titled only "1" reads as "Chapter 1" wherever the app lists chapters.
export const chapterLabel=(t:string)=>{const c=clean(t).replace(/^\d+[.)\s]+(?=\S)/,'');return /^\d+$/.test(c)?'Chapter '+c:c;};
export const audiences=[{id:'general',label:'General reader'},{id:'student',label:'Student'},{id:'expert',label:'Expert in the field'}];
export const tones=[{id:'neutral',label:'Neutral'},{id:'engaging',label:'Engaging'},{id:'formal',label:'Formal'}];
export interface PromptOptions{
 // "ai": the other AI finds the real chapters itself; "list": it follows the chapters ticked in the app.
 chapterMode:'ai'|'list';chapters:number[];types:string[];languages:{code:string;name:string}[];audience:string;tone:string;
 pageRefs:boolean;overview:boolean;takeaways:boolean;glossary:boolean;concepts:boolean;evidence:boolean;figures:boolean;quotes:boolean;notes:string;
}
export const defaultOptions=(language:{code:string;name:string}):PromptOptions=>({chapterMode:'ai',chapters:[],types:['detailed'],languages:[language],audience:'general',tone:'neutral',pageRefs:true,overview:true,takeaways:true,glossary:false,concepts:true,evidence:true,figures:true,quotes:false,notes:''});
const named=(t:string)=>t&&t===t.toUpperCase()&&/\p{Lu}/u.test(t)?t.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu,(_,a,b)=>a+b.toUpperCase()):t;
// The book's own chapter numbers would clash with the numbers we ask the answer to use.
const plain=(t:string)=>{const c=clean(t).replace(/^\d+[.)\s]+(?=\S)/,'');return /^\d+$/.test(c)?'Chapter '+c:c;};
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
 out.push(o.chapterMode==='ai'
  ?`CHAPTERS — First identify the book's real chapters from its table of contents and chapter openings; do not rely on any automatic outline. Cover every substantive chapter in order, plus a substantive introduction or conclusion if present. Do not treat title pages, acknowledgments, notes, references, or an index as chapters. If the PDF is incomplete or a chapter cannot be read, identify the gap instead of guessing. Number the chapters 1, 2, 3 … in reading order.\nWrite each chapter heading with its first and last page: "## 3. Chapter title (pp. 45–78)". Use the book's printed page numbers; if it has none, use PDF page numbers consistently and say so in the overview. On the line right under the heading write "Original title: …" with the chapter's title exactly as printed.`
  :`CHAPTERS TO COVER — summarize exactly these ${picked.length} chapter${picked.length===1?'':'s'}, in this order, and ignore every other part of the document. Keep the numbers shown; they are how I will match your answer to the book. If a listed title looks wrong, trust the book itself and keep the number.\n${list||'(none selected)'}\nWrite each chapter heading with its pages: "## 3. Chapter title (pp. 45–78)", and on the line under it "Original title: …".`);
 out.push(`SUMMARIES TO WRITE\n${combos.map(({l,t},i)=>`${i+1}. ${t.label} summary in ${l.name} — for each chapter: ${t.instruction}.`).join('\n')}`);
 out.push(`LENGTH — Do not shorten anything to fit a length. A chapter takes as many words as its argument, evidence and examples need; a rich chapter can run to thousands. If you reach your output limit, finish the chapter you are on, stop, and wait for me to say "continue"; then resume with the next chapter, without repeating earlier text or the delimiter line.`);
 out.push(`EACH CHAPTER — Explain the central idea, how the author develops it, and the examples or stories that make it memorable. Open with the chapter's most compelling question, scene or idea, and write in flowing paragraphs, not a list. Retell examples (case histories, stories, experiments) in your own words, with the names, details and turns that give them force. Preserve names, numbers, dates, uncertainty, objections and the limits of the author's claims. Do not invent quotations, examples, research findings or page references. Use only the attached document.`);
 out.push(o.quotes
  ?`QUOTATIONS — Prefer paraphrase, but where the author's own words carry the point, quote them verbatim in quotation marks (under 40 words, with the page). Set the best one or two in each chapter apart as a pull-quote on its own line: > “The quotation.” — Author, p. 123`
  :`QUOTATIONS — Prefer paraphrase to direct quotation.`);
 out.push(`LANGUAGE\nWrite every word of each summary in its stated language: the headings, chapter titles, labels, lists, captions, image alt text and table headings. ${langs.some(l=>l.code!=='en')?'Translate the original chapter titles into that language; do not leave them in the source language. ':''}Never put a translation of the same text in another language beside it. Keep proper names, numbers, dates and units exact${langs.some(l=>l.code==='fa'||l.code==='ar')?', and use Western digits (1, 2, 3) in chapter numbers and page references':''}.`);
 if(langs.some(l=>l.code==='fa'))out.push(`PERSIAN STYLE (فارسیِ فاخر و روان) — Write with the care of an accomplished Persian essayist: precise, warm and engaging, yet easy to read. Make it sound written in Persian, not translated from English. Prefer clear sentences and familiar words where they carry the meaning, and explain a necessary technical term when it first appears. Use standard نیم‌فاصله, Persian punctuation (« » ، ؛ ؟) and Persian digits in the prose; use Western digits only in chapter numbers and page references so the headings can be imported. Keep the author's qualifications and the emotional force of important stories. Avoid repeated stock phrases, mechanical "not X but Y" contrasts and a list-like rhythm; use a contrast only when the author's argument genuinely depends on it.`);
 const extras=[
  o.overview?'"Overview": two or three inviting paragraphs: what question the book asks, its central idea, how it proceeds, and who would benefit from reading it; include the author and publication details only if the document establishes them':'',
  o.takeaways?'"Key takeaways": four to six specific insights, each in a complete, readable sentence':'',
 ].filter(Boolean);
 const after=[
  o.concepts?'"Key concepts and connections": define the important terms and explain how ideas connect across the document':'',
  o.glossary?'"Key terms": a short glossary':'',
  o.evidence?'"Evidence and limitations": briefly distinguish the author\'s evidence from interpretation, state what the book does not establish, and mention any unreadable or missing pages':'',
  o.figures?'"Figures and tables": list the significant figures and tables with a caption and page':'',
 ].filter(Boolean);
 const head=(code:string)=>code==='fa'?'## 1. عنوان فارسی فصل (pp. 15–48)':'## 1. Chapter title in the output language (pp. 15–48)';
 const delimiters=combos.map(({l,t})=>`=== INKLING: type=${t.id}; language=${l.code} ===`).join('\n');
 const figures=o.figures
  ?`FILES — If you can create files, return ONE ZIP named inkling-summary.zip that holds:\n- summary.md: every summary in this single Markdown file\n- images/: every figure, chart, diagram, map, photograph and image-based table that matters, saved as PNG or JPEG\nPlace each image in the chapter it belongs to with Markdown image syntax on its own line, such as ![Description in the output language](images/figure-3.png), followed by a caption and its page. Keep images next to summary.md in the folders the links name. Reproduce important tables as Markdown tables in the chapter. If you cannot make files, return the Markdown alone and describe each figure in words with its page; never invent an image link.`
  :'FILES — Return Markdown only: no images and no ZIP. Reproduce important tables as Markdown tables.';
 out.push(`OUTPUT FORMAT — Markdown with no preamble and no surrounding code fence inside the file.\nStart each summary with this exact delimiter line, then its content:\n${delimiters}\n\nInside each summary use this structure, in this order:\n- "# " the document title, in the summary's language\n${extras.map(e=>'- '+e).join('\n')}${extras.length?'\n':''}- one heading per chapter, in the form "## <number>. <chapter title> (pp. <first>–<last>)" (for example "${head(langs[0].code)}"), then "Original title: …", then that chapter's summary; use "###" headings only for sub-topics inside a chapter. For fiction, track changes in characters, relationships and themes; for research, cover methods, results and limitations.${after.length?'\n- after the chapters, one "## " section each for:\n'+after.map(e=>'  - '+e).join('\n'):''}\n\n${figures}`);
 out.push(`ACCURACY\n${o.pageRefs?'Put a page reference in square brackets after each key claim, such as [p. 143] or [pp. 10–12]; where the document has no page numbers, use the section title in the output language instead. ':''}Preserve names, dates, numbers, units and uncertainty. Use only the attached document, flag anything you cannot verify, and do not invent quotes, references or image links. If part of the document cannot be read, say so in one line under that chapter instead of guessing.`);
 out.push(`BEFORE FINISHING — Check that the chapter count and order match the document, that every example is traceable to it${langs.some(l=>l.code==='fa')?', and that the Persian reads naturally aloud':''}.`);
 if(combos.length>1)out.push(`Write the summaries one after another, each under its own delimiter line.`);
 if(o.notes.trim())out.push('EXTRA INSTRUCTIONS FROM ME\n'+o.notes.trim());
 return out.join('\n\n');
}
