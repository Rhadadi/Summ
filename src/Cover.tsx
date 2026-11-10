import type{Book}from'./types';

// A cover is the real image when we have one; otherwise a quiet typographic placeholder.
export default function Cover({book,url,className=''}:{book:Book;url?:string;className?:string}){
 if(url)return <div className={'cover has-image '+className} aria-hidden="true"><img src={url} alt=""/></div>;
 return <div className={'cover cover-'+book.color%4+' '+className} aria-hidden="true"><span dir="auto">{book.title}</span></div>;
}
