import assert from'node:assert/strict';
import test from'node:test';
import'./pdf-node-loader.ts';

function samplePdf(){
 const stream=(text:string)=>'<< /Length '+text.length+' >>\nstream\n'+text+'\nendstream';
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  stream('BT /F1 12 Tf 72 720 Td (Chapter 1) Tj 0 -30 Td (A small finding, with a qualification.) Tj ET'),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
  stream('BT /F1 12 Tf 72 720 Td (Chapter 2) Tj 0 -30 Td (A final limitation remains.) Tj ET')
 ];
 let pdf='%PDF-1.4\n';const offsets=[0];
 objects.forEach((object,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
 const xref=pdf.length;
 pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
 return new TextEncoder().encode(pdf+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
}

test('PDF import retains every page without Safari-missing collection and stream iteration APIs',async()=>{
 // Browser geometry is present in Safari; provide it for the Node test as well.
 const{DOMMatrix,ImageData,Path2D}=await import('@napi-rs/canvas');
 Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
 const streamIterator=Object.getOwnPropertyDescriptor(ReadableStream.prototype,Symbol.asyncIterator);
 Object.defineProperty(ReadableStream.prototype,Symbol.asyncIterator,{value:undefined,writable:true,configurable:true});
 const descriptors=new Map<PropertyKey,PropertyDescriptor|undefined>();
 for(const key of ['getOrInsert','getOrInsertComputed']){
  descriptors.set(key,Object.getOwnPropertyDescriptor(Map.prototype,key));
  Object.defineProperty(Map.prototype,key,{value:undefined,writable:true,configurable:true});
 }
 try{
  const{importFile}=await import('../src/importers.ts');const updates:string[]=[];
  const book=await importFile(new File([samplePdf()],'Compatibility sample.pdf'),message=>updates.push(message));
  assert.equal(book.format,'PDF');assert.equal(book.title,'Compatibility sample');
  assert.equal(book.chapters.length,2);
  const blocks=book.chapters.flatMap(chapter=>chapter.blocks);
  assert.deepEqual([...new Set(blocks.map(block=>block.page))],[1,2]);
  assert.ok(blocks.some(block=>block.text==='A small finding, with a qualification.'));
  assert.ok(blocks.some(block=>block.text==='A final limitation remains.'));
  assert.ok(updates.includes('Reading PDF page 2 of 2…'));
 }finally{
  if(streamIterator)Object.defineProperty(ReadableStream.prototype,Symbol.asyncIterator,streamIterator);else Reflect.deleteProperty(ReadableStream.prototype,Symbol.asyncIterator);
  for(const[key,descriptor]of descriptors){if(descriptor)Object.defineProperty(Map.prototype,key,descriptor);else Reflect.deleteProperty(Map.prototype,key);}
 }
});
