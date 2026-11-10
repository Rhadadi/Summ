import type{PDFPageProxy,TextContent}from'pdfjs-dist/types/src/display/api';

// Shipping Safari lacks ReadableStream[Symbol.asyncIterator], including where
// Playwright WebKit already supports it. Avoid PDF.js's for-await implementation.
export async function pdfTextContent(page:PDFPageProxy):Promise<TextContent>{
 if(page.isPureXfa)return page.getTextContent();
 const reader=page.streamTextContent().getReader();
 const content:TextContent={items:[],styles:Object.create(null),lang:null};
 try{
  while(true){
   const{done,value}=await reader.read();
   if(done)break;
   const chunk=value as TextContent;
   content.lang??=chunk.lang;
   Object.assign(content.styles,chunk.styles);
   content.items.push(...chunk.items);
  }
  return content;
 }finally{reader.releaseLock();}
}
