import{registerHooks}from'node:module';

// Vite's ?url imports emit an asset URL. Supply the equivalent file URL in Node
// so regression tests exercise the real importer and its selected PDF.js build.
registerHooks({resolve(specifier,context,nextResolve){
 if(specifier.startsWith('pdfjs-dist/')&&specifier.endsWith('?url')){
  const asset=nextResolve(specifier.slice(0,-4),context);
  return{url:'data:text/javascript,'+encodeURIComponent('export default '+JSON.stringify(asset.url)),shortCircuit:true};
 }
 return nextResolve(specifier,context);
}});
