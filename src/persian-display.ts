const authors:Record<string,string>={
 'Kieran Setiya':'کیران ستیا',
 'Yalom, Irvin D.':'اروین د. یالوم',
 'Irvin D. Yalom':'اروین د. یالوم',
 'Joe Friel':'جو فریل',
 'John Gottman':'جان گاتمن',
 'Stephen A. Mitchell':'استیون ای. میچل',
 'Holger Zellentin':'هولگر زلنتین',
};
const paintings:Record<string,string>={
 'Runners':'دوندگان',
 'French: Paolo et Francesca Paolo and Francesca':'پائولو و فرانچسکا',
 'Norwegian: Øye i øye Eye in Eye':'چشم در چشم',
 '„Tod und Leben”':'مرگ و زندگی',
 'Moses Smashing the Tablets of the Law':'موسی در حال شکستن لوح‌های قانون',
 'The Voyage of Life: Manhood':'سفر زندگی: مردانگی',
};
const artists:Record<string,string>={
 'Robert Delaunay':'روبر دلونه',
 'Pierre Claude François Delorme':'پیر کلود فرانسوا دولورم',
 'Edvard Munch':'ادوارد مونک',
 'Gustav Klimt':'گوستاو کلیمت',
 'Rembrandt':'رامبرانت',
 'Thomas Cole':'توماس کول',
};
export const displayAuthor=(name:string,lang?:string)=>lang==='fa'?(authors[name]||name):name;
/** A published book's author for this language: the editor's (or the server's) name in that script, else the original. */
export const authorFor=(b:{author:string;authorNames?:Record<string,string>},lang?:string)=>(lang&&b.authorNames?.[lang])||displayAuthor(b.author,lang);
export const displayPainting=(credit:{title?:string;artist?:string;year?:string},lang?:string)=>lang==='fa'
 ?[paintings[credit.title||'']||credit.title,artists[credit.artist||'']||credit.artist,credit.year?.replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d]).replace('from ','از ').replace(' until ',' تا ')].filter(Boolean).join(' · ')
 :[credit.title,credit.artist,credit.year].filter(Boolean).join(' · ');

const recommended:Record<string,[string,string]>={
 '80/20 Triathlon':['سه‌گانهٔ ۸۰/۲۰','مت فیتزجرالد و دیوید واردن'],
 'Training and Racing with a Power Meter':['تمرین و مسابقه با توان‌سنج','هانتر آلن'],
 'Swim Speed Secrets for Swimmers and Triathletes':['رازهای سرعت در شنا','شیلا تائورمینا'],
 'Mating in Captivity: Unlocking Erotic Intelligence':['جفت‌گیری در اسارت','استر پرل'],
 'The Seven Principles for Making Marriage Work':['هفت اصل برای موفقیت در زندگی زناشویی','جان گاتمن و نن سیلور'],
 'The Art of Loving':['هنر عشق‌ورزیدن','اریک فروم'],
 'Getting the Love You Want: A Guide for Couples':['عشقی که می‌خواهید','هارویل هندریکس'],
 'Nonviolent Communication: A Language of Life':['ارتباط بدون خشونت','مارشال روزنبرگ'],
 "Man's Search for Meaning":['انسان در جست‌وجوی معنا','ویکتور فرانکل'],
 'The Denial of Death':['انکار مرگ','ارنست بکر'],
 'When Breath Becomes Air':['وقتی نفس هوا می‌شود','پل کالانیتی'],
 'When Nietzsche Wept':['وقتی نیچه گریست','اروین د. یالوم'],
 'The Gift of Therapy':['موهبت درمان','اروین د. یالوم'],
};
export const relatedInPersian=(title:string)=>recommended[title]||recommended[Object.keys(recommended).find(k=>k.toLowerCase()===title.toLowerCase())||''];
