// What Osareh is, what a reader can do here, and what happens to what they write. Short, in the reader's language.
import{AutoStoriesOutlined,EditNoteOutlined,HeadphonesOutlined,LockOutlined,MenuBookOutlined,DownloadDoneRounded}from'@mui/icons-material';
import type{ReactNode}from'react';

interface Part{icon:ReactNode;title:string;text:string}
const FA={
 lead:'عصاره خلاصه‌هایی کوتاه و خوش‌نوشت از کتاب‌های خواندنی فراهم می‌کند تا ایده‌های اصلی هر کتاب را در چند دقیقه بخوانید یا بشنوید، به زبان خودتان.',
 parts:[
  {icon:<MenuBookOutlined/>,title:'فصل به فصل، همراه با کتاب',text:'هر خلاصه کتاب را فصل به فصل دنبال می‌کند. ارجاع‌های صفحه نشان می‌دهند هر ایده کجای کتاب آمده است، تا اگر خواستید سراغ خودِ کتاب بروید. خلاصه جای کتاب را نمی‌گیرد؛ راهی است برای شناختنش.'},
  {icon:<HeadphonesOutlined/>,title:'بخوانید یا بشنوید',text:'بسیاری از خلاصه‌ها نسخهٔ صوتی دارند. کتاب‌ها را می‌توانید روی دستگاه خود نگه دارید تا بدون اینترنت هم خوانده و شنیده شوند.'},
  {icon:<EditNoteOutlined/>,title:'برای فهمیدن، نه فقط خواندن',text:'بخش‌هایی را که برایتان مهم است هایلایت کنید و در حاشیه‌شان بنویسید، ایدهٔ هر فصل را «به زبان خودتان» یادداشت کنید یا ضبط کنید، و با پرسش‌های پایان فصل فهم خود را بسنجید. همراه مطالعه (هوش مصنوعی) هم به پرسش‌هایتان دربارهٔ متن پاسخ می‌دهد.'},
  {icon:<LockOutlined/>,title:'یادداشت‌های شما مال خودتان است',text:'هایلایت‌ها، حاشیه‌ها و یادداشت‌ها اول روی دستگاه شما ذخیره می‌شوند و وقتی وارد حساب شوید، رمزگذاری‌شده در حساب شما نگه داشته می‌شوند تا روی دستگاه‌های دیگرتان هم باشند. کسی جز شما آن‌ها را نمی‌بیند و هر وقت بخواهید از «دفترچه» نسخه‌ای از همه‌شان دریافت می‌کنید.'},
  {icon:<DownloadDoneRounded/>,title:'کتابی را می‌خواهید؟',text:'اگر کتابی را دوست دارید که هنوز اینجا نیست، از «تنظیمات» درخواستش را بفرستید. با عضویت در خبرنامه هم از کتاب‌های تازه باخبر می‌شوید.'},
 ] as Part[],
 library:'رفتن به کتابخانه',notebook:'دفترچهٔ من',title:'دربارهٔ عصاره',tagline:'خلاصهٔ کتاب‌های خواندنی',
};
const EN={
 lead:'Osareh (Persian for “essence”) offers short, beautifully written summaries of books worth reading, so you can take in each book’s main ideas in minutes, reading or listening, in your own language.',
 parts:[
  {icon:<MenuBookOutlined/>,title:'Chapter by chapter, close to the book',text:'Each summary follows the book chapter by chapter. Page references show where every idea comes from, so you can go to the book itself. A summary does not replace the book; it is a way to get to know it.'},
  {icon:<HeadphonesOutlined/>,title:'Read or listen',text:'Many summaries have audio. Keep books on your device to read and listen without a connection.'},
  {icon:<EditNoteOutlined/>,title:'To understand, not only to read',text:'Highlight what matters to you and write in the margin, put each chapter’s idea “in your own words” (typed or spoken), and check yourself with the questions at the end of a chapter. The study companion (AI) answers your questions about the text.'},
  {icon:<LockOutlined/>,title:'Your notes are yours',text:'Highlights, comments and notes are saved on your device first and, when you sign in, kept encrypted in your account so they are on your other devices too. No one else sees them, and you can download a copy of all of them from the Notebook at any time.'},
  {icon:<DownloadDoneRounded/>,title:'Want a book?',text:'If a book you love is not here yet, request it from Settings. Join the newsletter to hear about new books.'},
 ] as Part[],
 library:'Go to the library',notebook:'My notebook',title:'About Osareh',tagline:'Summaries of books worth reading',
};

export default function AboutPage({lang,navigate}:{lang:string;navigate:(path:string)=>void}){
 const t=lang==='fa'?FA:EN;
 return <article className="about-page" dir={lang==='fa'?'rtl':'ltr'}>
  <header className="about-head"><div className="about-hero"><img src="/brand/osareh-gilded.svg" alt={lang==='fa'?'عصاره':'Osareh'}/><p>{t.tagline}</p></div><h1>{t.title}</h1><p>{t.lead}</p></header>
  <div className="about-parts">{t.parts.map(p=><section key={p.title} className="about-part">{p.icon}<div><h2>{p.title}</h2><p>{p.text}</p></div></section>)}</div>
  <div className="about-actions"><button className="about-go" onClick={()=>navigate('/library')}><AutoStoriesOutlined/>{t.library}</button><button className="text-link2" onClick={()=>navigate('/notebook')}>{t.notebook}</button></div>
 </article>;
}
