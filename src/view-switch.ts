// Where "View as visitor" and "Back to editing" send an editor, so the switch keeps the book (and chapter) in view.
// Pure: no React, no storage. Routes are hash paths without the '#'.
interface PubRef{id:string;slug:string;visibility:string}
interface LocalRef{id:string;published?:{slug:string;visibility:string}|null}
export interface Ctx{published:PubRef[]|null;local:LocalRef[]}

export const editorTabs=['details','overview','chapters','guide','reception','audio'] as const;
export type EditorTab=typeof editorTabs[number];

// The visitor's page for an editor's route. Routes visitors can already open stay as they are.
export function visitorRoute(route:string,ctx:Ctx):string{
 const p=route.split('/'),area=p[1]||'';
 if(area==='edit'){
  const pub=ctx.published?.find(b=>b.id===p[2]);
  // A book that is not public has no page visitors can find.
  if(!pub||pub.visibility!=='public')return'/library';
  if(p[3]==='chapters'&&p[4])return'/b/'+pub.slug+'/read/c:'+p[4];
  return'/b/'+pub.slug;
 }
 if(area==='workspace')return'/library';
 if(area==='book'||area==='read'){
  const pub=ctx.local.find(b=>b.id===p[2])?.published;
  if(!pub||pub.visibility!=='public')return'/';
  return'/b/'+pub.slug+(area==='read'?'/read':'');
 }
 if(area==='saved'||area==='mailing')return'/';
 return route;
}
// Leaving visitor view: go back to where the editor was, but only if the visitor is still on the page the switch opened.
// If they moved on, stay where they are.
export const leaveVisitor=(current:string,mark:{from:string;to:string}|null):string|null=>mark&&current===mark.to&&mark.from!==current?mark.from:null;
// The reader's own hint for a chapter: /b/slug/read/c:<chapterId>.
export const chapterHint=(section:string):string|null=>section.startsWith('c:')&&section.length>2?section.slice(2):null;
// /edit/:id[/tab[/chapterId]]
export function editorTarget(parts:string[]):{tab:EditorTab;chapter:string}{
 const tab=(editorTabs as readonly string[]).includes(parts[3]||'')?parts[3] as EditorTab:'details';
 return{tab,chapter:tab==='chapters'?parts[4]||'':''};
}
export const editorRoute=(id:string,tab?:EditorTab,chapterId?:string)=>'/edit/'+id+(tab?'/'+tab+(chapterId?'/'+chapterId:''):'');
