import type{HomeConfig,PubBook}from'./types.ts';

// The owner's order; books the config does not mention follow, in the order given (newest first).
export function homeOrder(books:PubBook[],config:HomeConfig|null){
 const order=(id:string)=>{const i=config?.slides.findIndex(s=>s.id===id)??-1;return i<0?1e6:i;};
 return [...books].sort((a,b)=>order(a.id)-order(b.id));
}
// The slideshow: unticked books leave it. Its index also picks each book's automatic painting, so this must not change.
export function homeBooks(books:PubBook[],config:HomeConfig|null){
 return homeOrder(books,config).filter(b=>!config?.slides.find(s=>s.id===b.id)?.hidden);
}
// The list under the slideshow: every published book, in the owner's order. Unticking a slide must not hide a book here.
export const wallBooks=homeOrder;
