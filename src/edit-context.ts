import{createContext}from'react';
import type{Drafting}from'./use-draft';
// What the lazily loaded editor needs from PublishedBook. Lives here, not in the editor, so the provider never has to wait for it.
export interface EditCtl{
 d:Drafting;lang:string;rtl:boolean;L:(t:string)=>string;
 save:()=>void;done:()=>void;toast:(m:string)=>void;openBookEditor:()=>void;
 // The saved text of a list, to mark the blocks that differ from it.
 saved:(scope:string)=>unknown;
}
export const EditContext=createContext<EditCtl|null>(null);
