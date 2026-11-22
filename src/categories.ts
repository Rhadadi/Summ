// Book categories: a short fixed list, so a reader can open "Philosophy" and find every book on it. The editor picks a
// book's categories; until then they are guessed from its subject tags (catalogue subjects and the summary's themes,
// in English or Persian), so existing books are already sorted.
export interface Category{id:string;fa:string;en:string;words:string[]}
export const CATEGORIES:Category[]=[
 {id:'philosophy',fa:'فلسفه',en:'Philosophy',words:['philosoph','فلسف','ethic','moral','اخلاق','ontolog','هستی‌شناسی','metaphys','determinism','existential','meaning of life','معنای زندگی']},
 {id:'psychology',fa:'روان‌شناسی',en:'Psychology',words:['psycholog','روان','psychotherap','anxiety','اضطراب','emotion','عاطفی','conduct','attitude','mind','ذهن']},
 {id:'religion',fa:'دین و قرآن‌پژوهی',en:'Religion',words:['islam','اسلام','qur','قرآن','hermeneutic','scripture','bible','کتاب مقدس','کتاب‌مقدس','ادیان','دین','ritual','rituel','مناسک','doctrine','سیره','theolog','الهیات','religio','پیامبر']},
 {id:'history',fa:'تاریخ',en:'History',words:['history','histor','تاریخ','باستان','antiquity','امپراتوری','empire','مغازی']},
 {id:'science',fa:'علم',en:'Science',words:['quantum','کوانتوم','physics','فیزیک','science','علم','probability','احتمال','cosmolog','biolog','زیست']},
 {id:'relationships',fa:'عشق و رابطه',en:'Love & relationships',words:['love','عشق','relationship','رابطه','marriage','ازدواج','زناشویی','family','خانواده','interpersonal','شریک','couple']},
 {id:'health',fa:'سلامت و ورزش',en:'Health & sport',words:['training','تمرین','sport','ورزش','triathlon','سه‌گانه','fitness','health','سلامت','بازیابی','دوچرخه','running']},
];
export const categoryById=(id:string)=>CATEGORIES.find(c=>c.id===id);
export const categoryName=(c:Category,lang:string)=>lang==='fa'?c.fa:c.en;
/** Categories guessed from subject tags, in the list's order, at most three. */
export function inferCategories(tags:string[]=[]):string[]{
 const low=tags.map(t=>t.toLowerCase());
 return CATEGORIES.filter(c=>c.words.some(w=>low.some(t=>t.includes(w)))).map(c=>c.id).slice(0,3);
}
/** A book's categories: the editor's choice when there is one (even an empty one is not a choice: guess instead). */
export function bookCategories(b:{categories?:string[]|null;tags?:string[]}):string[]{
 const chosen=(b.categories||[]).filter(id=>categoryById(id));
 return chosen.length?chosen:inferCategories(b.tags);
}
/** Categories that hold at least one of these books, with how many, in the list's order. */
export function categoryCounts(books:{categories?:string[]|null;tags?:string[]}[]):{category:Category;count:number}[]{
 return CATEGORIES.map(category=>({category,count:books.filter(b=>bookCategories(b).includes(category.id)).length})).filter(x=>x.count>0);
}
