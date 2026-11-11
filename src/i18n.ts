// The words around a summary follow its language, so a Persian summary does not sit inside an English page.
const fa:Record<string,string>={
 'Study guide':'راهنمای مطالعه','Start reading':'شروع خواندن','Continue reading':'ادامهٔ خواندن','Listen':'گوش دادن','What’s it about?':'درباره‌ی چیست؟',
 'Read the overview and key takeaways':'مرور کلی و نکته‌های کلیدی را بخوانید','Chapters':'فصل‌ها','Reception':'بازتاب کتاب','Library':'کتابخانه',
 'Overview and key takeaways':'مرور کلی و نکته‌های کلیدی','Overview':'مرور کلی','Summary':'خلاصه','Original':'متن اصلی','Next':'بعدی','Previous':'قبلی',
 'Mark this chapter as read':'این فصل را خوانده‌ام','Marked as read ✓':'خوانده‌شده ✓','AI summary':'خلاصهٔ هوش مصنوعی','Contents':'فهرست','Section':'بخش',
 'Published':'سال انتشار','Publisher':'ناشر','Open Library readers':'خوانندگان Open Library','What readers praise':'نقاط قوت از نگاه خوانندگان','Where it is faulted':'نقدها و ضعف‌ها',
 'In their words':'به زبان منتقدان و خوانندگان','Read more:':'بیشتر بخوانید:','Draft · not yet approved for readers':'پیش‌نویس · هنوز تأیید نشده',
 'More sections: front matter, index':'بخش‌های بیشتر: پیش‌گفتار و نمایه','Show':'نمایش','Hide':'پنهان کردن','front matter, notes and index':'پیش‌گفتار، یادداشت‌ها و نمایه',
 'Looking the book up…':'در حال جست‌وجوی کتاب…','No public record was found for this book.':'اطلاعات عمومی برای این کتاب پیدا نشد.','Summary version':'نسخهٔ خلاصه',
 'ratings':'رأی','chapter':'فصل','chapters':'فصل','key chapters':'فصل کلیدی','pages':'صفحه','min of summaries':'دقیقه خلاصه','min':'دقیقه','by':'نوشتهٔ',
 'Who it is for':'این کتاب برای چه کسانی است','About the author':'دربارهٔ نویسنده','If you liked this':'اگر این کتاب را دوست داشتید','What the critics said':'منتقدان چه گفتند','What readers said':'خوانندگان چه گفتند','Read the review':'خواندن نقد','Praised':'ستایش','Mixed':'دوگانه','Critical':'انتقادی','What others say':'دیگران چه می‌گویند','Find it on':'این کتاب در','From Wikipedia':'از ویکی‌پدیا','Chapter':'فصل','of':'از','Back to the book':'بازگشت به کتاب','Save':'ذخیره','Options':'گزینه‌ها','Close':'بستن','Publisher description via Google Books':'معرفی ناشر از Google Books',
};
export const rtl=(lang?:string)=>lang==='fa'||lang==='ar';
export const tr=(lang:string|undefined,text:string)=>lang==='fa'?fa[text]??text:text;
export const num=(lang:string|undefined,n:number)=>n.toLocaleString(lang==='fa'?'fa-IR':undefined);
