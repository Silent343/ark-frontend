import type {Blueprint} from './entities/blueprint';
/** Explicit user correction leaves the original neural evidence unchanged. */
export function reclassifyRasterOpening(plan:Blueprint,id:string,kind:'door'|'window',wallHeight:number):Blueprint {
 const current=plan.doors.find(o=>o.id===id)??plan.windows.find(o=>o.id===id);
 if(!current)throw new Error('Abertura no encontrada.');
 if(kind==='door'&&plan.doors.some(o=>o.id===id)||kind==='window'&&plan.windows.some(o=>o.id===id))return plan;
 const opening={...current,height:Math.min(kind==='door'?2.1:1.2,wallHeight-.1),sillHeight:kind==='window'?Math.min(.9,Math.max(0,wallHeight-1.3)):undefined};
 const doors=plan.doors.filter(o=>o.id!==id),windows=plan.windows.filter(o=>o.id!==id);
 (kind==='door'?doors:windows).push(opening);
 return {...plan,doors,windows,...(plan.review?{review:{...plan.review,warnings:[...new Set([...plan.review.warnings,'neural-opening-class-manually-corrected'])]}}:{})};
}
