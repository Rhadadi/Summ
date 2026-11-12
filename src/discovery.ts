import type{PubBook}from'./types';
export function normalizeSearch(value:string){return value.normalize('NFKC').toLocaleLowerCase().replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[\u200c\u200d\s]+/g,' ').trim();}
export function matchesBook(book:PubBook,query:string){const words=normalizeSearch(query).split(' ').filter(Boolean);const haystack=normalizeSearch([book.title,...Object.values(book.titles||{}),book.author].join(' '));return words.every(w=>haystack.includes(w));}
export const publicTitle=(book:PubBook,lang:string)=>book.titles?.[lang]||book.title;
