// What the study companion knows: the book, the chapter the reader has open (its summary as published) and the mode.
// Pure, so tests can read the prompt.
import{parseInline}from'./inline.ts';
export type Mode='explain'|'socratic'|'debate'|'quiz';
export const MODES:{id:Mode;en:string;fa:string;hintEn:string;hintFa:string}[]=[
 {id:'explain',en:'Explain',fa:'توضیح',hintEn:'Ask anything about this chapter',hintFa:'هر پرسشی دربارهٔ این فصل بپرسید'},
 {id:'socratic',en:'Socratic tutor',fa:'معلم سقراطی',hintEn:'It answers with questions that lead you there',hintFa:'با پرسش شما را به پاسخ می‌رساند'},
 {id:'debate',en:'Debate me',fa:'با من مناظره کن',hintEn:'State a view; it argues the other side',hintFa:'دیدگاهی بگویید؛ از طرف مقابل دفاع می‌کند'},
 {id:'quiz',en:'Quiz me',fa:'از من بپرس',hintEn:'It asks, you answer, it grades',hintFa:'می‌پرسد، پاسخ می‌دهید، ارزیابی می‌کند'},
];
const RULES:Record<Mode,string>={
 explain:'Answer the reader\'s questions about this chapter clearly and briefly. Start with the direct answer, then add what helps: an example, a link to another idea in the chapter, or a caveat.',
 socratic:'Teach Socratically. Do not give the answer outright. Ask one short question at a time that leads the reader toward it, respond to their answer, confirm what is right and gently correct what is not. Summarise the answer only once they reach it or ask you to.',
 debate:'Be a debate partner. Take the opposing side of whatever position the reader states and argue it as strongly and fairly as you can. Keep each turn short. After a few exchanges, name the crux of the disagreement and what evidence would settle it.',
 quiz:'Quiz the reader on this chapter. Ask one question at a time, mixing recall, applying an idea to a new case, and "what would change if…" questions. Wait for the answer, grade it briefly with a reason, then ask the next. Keep a running score.',
};
export interface ChapterContext{bookTitle:string;author:string;chapterTitle:string;lang:string;paragraphs:{heading?:string;text:string}[];takeaways?:string[]}
const plain=(t:string)=>parseInline(t).map(s=>s.text).join('');
export function chapterText(c:ChapterContext):string{
 return c.paragraphs.map(p=>(p.heading?'## '+p.heading+'\n':'')+plain(p.text)).join('\n\n');
}
export function systemPrompt(c:ChapterContext,mode:Mode):string{
 const fa=c.lang==='fa';
 return [
  `You are the study companion on Inkling, a site of book summaries. The reader has open a chapter of "${c.bookTitle}"${c.author?' by '+c.author:''}: "${c.chapterTitle}". The chapter's summary, as the reader sees it, is below.`,
  'Ground your answers in this summary. When you add something it does not say (the wider book, other thinkers, your own knowledge), say so plainly, and do not invent quotations or page numbers. If the reader asks about something unrelated to the book, help briefly and steer back.',
  RULES[mode],
  fa?'Reply in Persian (Farsi), in clear modern prose, unless the reader writes in another language. Use Persian digits.':'Reply in the language the reader writes in.',
  'Keep replies short enough to read in a side panel: a few short paragraphs or a brief list. Use **bold** sparingly for key terms. No headings, no tables.',
  c.takeaways?.length?'The book\'s key takeaways:\n'+c.takeaways.map(t=>'- '+plain(t)).join('\n'):'',
  '<chapter_summary>\n'+chapterText(c)+'\n</chapter_summary>',
 ].filter(Boolean).join('\n\n');
}
export const starters=(lang:string)=>lang==='fa'
 ?['ایدهٔ اصلی این فصل را ساده توضیح بده','یک مثال از زندگی روزمره بزن','منتقدان چه ایرادی به این دیدگاه می‌گیرند؟','این فصل چه ربطی به زندگی من دارد؟']
 :['Explain the main idea simply','Give me an everyday example','What would critics say about this?','How does this apply to my life?'];
