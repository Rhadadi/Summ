// Framing a book's background: a focal point (percent of the picture) and a zoom. Pure, so node tests can import it.
// CSS side: object-position x% y% pins that point of the picture to the same point of the frame, and scale() zooms around the
// same point, so the focus never moves while the zoom crops around it. A picture is never mirrored, in right-to-left pages too.
export interface Frame{x:number;y:number;zoom:number}
export interface Framed{frame?:Frame;framePhone?:Frame}
export const DEFAULT_FRAME:Frame={x:50,y:40,zoom:1};
export const ZOOM_MIN=1,ZOOM_MAX=3;
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,Number.isFinite(n)?n:lo));
export const clampFrame=(f:Frame):Frame=>({x:Math.round(clamp(f.x,0,100)*10)/10,y:Math.round(clamp(f.y,0,100)*10)/10,zoom:Math.round(clamp(f.zoom,ZOOM_MIN,ZOOM_MAX)*100)/100});
export const sameFrame=(a?:Frame|null,b?:Frame|null)=>!a&&!b||!!a&&!!b&&a.x===b.x&&a.y===b.y&&a.zoom===b.zoom;
// With no frame there are no variables and no class: today's rendering stays exactly as it is.
export function frameVars(b?:Framed|null):Record<string,string>|undefined{
 if(!b?.frame)return undefined;
 const f=clampFrame(b.frame),out:Record<string,string>={'--fx':f.x+'%','--fy':f.y+'%','--fz':String(f.zoom)};
 if(b.framePhone){const p=clampFrame(b.framePhone);out['--pfx']=p.x+'%';out['--pfy']=p.y+'%';out['--pfz']=String(p.zoom);}
 return out;
}
// Where a picture of natural size sits inside a box when shown whole (object-fit: contain): the box has letterbox bars.
export function shown(box:{w:number;h:number},nat:{w:number;h:number}){
 const k=Math.min(box.w/nat.w,box.h/nat.h),w=nat.w*k,h=nat.h*k;
 return{x:(box.w-w)/2,y:(box.h-h)/2,w,h};
}
// A pointer position inside the box (relative to its corner) becomes a focus in percent of the picture; the bars count as the nearest edge.
export function pointToFocus(px:number,py:number,box:{w:number;h:number},nat:{w:number;h:number}){
 const r=shown(box,nat);
 return{x:Math.round(clamp((px-r.x)/r.w*100,0,100)*10)/10,y:Math.round(clamp((py-r.y)/r.h*100,0,100)*10)/10};
}
export function focusToPoint(f:{x:number;y:number},box:{w:number;h:number},nat:{w:number;h:number}){
 const r=shown(box,nat);return{x:r.x+r.w*f.x/100,y:r.y+r.h*f.y/100};
}
export const nudge=(f:Frame,dx:number,dy:number,dz=0):Frame=>clampFrame({x:f.x+dx,y:f.y+dy,zoom:f.zoom+dz});
// The part of the picture (in its own pixels) that a frame of the given shape shows, for measuring the colour behind the text:
// first the "cover" crop pinned at the focus, then the zoom around that same point.
export function frameCrop(nat:{w:number;h:number},box:{w:number;h:number},f:Frame){
 const k=Math.max(box.w/nat.w,box.h/nat.h),cw=box.w/k,ch=box.h/k,cx=(nat.w-cw)*f.x/100,cy=(nat.h-ch)*f.y/100,z=f.zoom;
 return{sx:cx+cw*(f.x/100)*(1-1/z),sy:cy+ch*(f.y/100)*(1-1/z),sw:cw/z,sh:ch/z};
}
