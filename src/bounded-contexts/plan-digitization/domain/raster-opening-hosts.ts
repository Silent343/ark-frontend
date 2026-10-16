import type {Point2,PlanLine} from './cad-topology';
import type {NeuralInstance} from './neural-contract';
import {associateNeuralOpening} from './neural-instances';

/** A full-span window may have only perpendicular jamb walls, not two collinear
 * wall stubs. Recover its provisional host only from a learned elongated window
 * and two observed, compatible wall endpoints. Never from a blank perimeter. */
export function recoverRasterWindowHosts(input:PlanLine[],instances:NeuralInstance[],units:number){
 if(!Number.isFinite(units)||units<=0)throw new Error('Invalid window scale');
 const lines=[...input],gaps=new Map<string,{center:Point2;widthM:number}>();
 for(const item of instances.filter(i=>i.kind==='window'&&i.score>=.6).sort((a,b)=>b.score-a.score)){
  if(associateNeuralOpening(item,lines.map(l=>({a:l.a.map(v=>v/units) as Point2,b:l.b.map(v=>v/units) as Point2,thickness:l.thickness})),units).hostStatus==='hosted')continue;
  const p=item.polygon.map(([x,y])=>[x*units,y*units] as Point2),cx=p.reduce((s,q)=>s+q[0],0)/p.length,cy=p.reduce((s,q)=>s+q[1],0)/p.length;
  const xx=p.reduce((s,q)=>s+(q[0]-cx)**2,0),yy=p.reduce((s,q)=>s+(q[1]-cy)**2,0),xy=p.reduce((s,q)=>s+(q[0]-cx)*(q[1]-cy),0),angle=.5*Math.atan2(2*xy,xx-yy),u:Point2=[Math.cos(angle),Math.sin(angle)],n:Point2=[-u[1],u[0]];
  const along=(q:Point2)=>q[0]*u[0]+q[1]*u[1],across=(q:Point2)=>q[0]*n[0]+q[1]*n[1],values=p.map(along),sides=p.map(across),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo,depth=Math.max(...sides)-Math.min(...sides),plane=(Math.min(...sides)+Math.max(...sides))/2;
  if(span<.2||span>8||span<depth*4)continue;
  const margin=Math.min(.4,Math.max(.12,depth/2+units*4));
  const searchMargin=Math.min(2.5,Math.max(margin,span*.55));
  const windowEvidence=instances.filter(i=>i.kind==='window'&&i.score>=.6).flatMap(i=>i.polygon.map(([x,y])=>[x*units,y*units] as Point2));
  const anchors=lines.flatMap((l,index)=>{
   const dx=l.b[0]-l.a[0],dy=l.b[1]-l.a[1],length=Math.hypot(dx,dy);if(length<.15||Math.abs((dx*u[0]+dy*u[1])/length)>.25)return [];
   return [l.a,l.b].filter(q=>Math.abs(across(q)-plane)<=.4+depth/2&&along(q)>=lo-searchMargin&&along(q)<=hi+searchMargin&&windowEvidence.some(p=>Math.hypot(p[0]-q[0],p[1]-q[1])<=margin+l.thickness/2)).map(q=>({p:q,t:along(q),side:across(q),thickness:l.thickness,index}));
  });
  let best: {a:typeof anchors[number];b:typeof anchors[number];score:number}|undefined;
  for(const a of anchors)for(const b of anchors){
   const dx=b.p[0]-a.p[0],dy=b.p[1]-a.p[1],width=Math.hypot(dx,dy);
   if(a.index===b.index||b.t<=a.t||width<.2||width>8||Math.abs((dx*u[0]+dy*u[1])/width)<.98)continue;
   // Fit to the observed jamb connector, not to the noisy mask's PCA axis.
   // A few degrees of segmentation skew must not disqualify two aligned jambs.
   const project=(q:Point2)=>((q[0]-a.p[0])*dx+(q[1]-a.p[1])*dy)/width;
   const normal=(q:Point2)=>((q[0]-a.p[0])*dy-(q[1]-a.p[1])*dx)/width;
   const values=p.map(project),left=Math.min(...values),right=Math.max(...values),sides=p.map(normal);
   if(left < -margin||right>width+margin||Math.min(...sides)>.12||Math.max(...sides)<-.12)continue;
   const coverage=Math.max(0,Math.min(right,width)-Math.max(left,0))/width;if(coverage<.65)continue;
   const score=Math.abs(normal([cx,cy]))+Math.abs(width-(right-left));if(!best||score<best.score)best={a,b,score};
  }
  if(!best)continue;
  const {a,b}=best,start=a.p,end=b.p,width=Math.hypot(end[0]-start[0],end[1]-start[1]),clearWidth=width-(a.thickness+b.thickness)/2;
  if(clearWidth<.2)continue;
  lines.push({a:start,b:end,thickness:Math.max(.06,Math.min(.4,(a.thickness+b.thickness)/2)),source:`window-jambs-${item.id}`});
  const shift=(a.thickness-b.thickness)/4;
  gaps.set(item.id,{center:[((start[0]+end[0])/2+(end[0]-start[0])/width*shift)/units,((start[1]+end[1])/2+(end[1]-start[1])/width*shift)/units],widthM:clearWidth});
 }
 return {lines,gaps};
}
/** A learned opening may recover its jamb-to-jamb host, but an unobserved gap never closes. */
export function bridgeRasterOpenings(input:PlanLine[],instances:NeuralInstance[],units:number){
 const lines=input.map(l=>({...l,a:[...l.a] as Point2,b:[...l.b] as Point2}));
 const gaps=new Map<string,{center:Point2;widthM:number}>();
 for(const instance of [...instances].filter(i=>['door','window'].includes(i.kind)).sort((a,b)=>b.score-a.score)){
  const points=instance.polygon.map(p=>[p[0]*units,p[1]*units] as Point2);
  outer:for(let a=0;a<lines.length;a++)for(let b=a+1;b<lines.length;b++){
   const first=lines[a],second=lines[b],dx=first.b[0]-first.a[0],dy=first.b[1]-first.a[1],length=Math.hypot(dx,dy),ex=second.b[0]-second.a[0],ey=second.b[1]-second.a[1],other=Math.hypot(ex,ey);
   if(length<.05||other<.05||Math.abs((dx*ex+dy*ey)/(length*other))<.999)continue;
   const project=(p:Point2)=>((p[0]-first.a[0])*dx+(p[1]-first.a[1])*dy)/length;
   const across=(p:Point2)=>Math.abs((p[0]-first.a[0])*dy-(p[1]-first.a[1])*dx)/length;
   if(Math.max(across(second.a),across(second.b))>.05)continue;
   const ext=[project(second.a),project(second.b)].sort((x,y)=>x-y);
   const gap=ext[0]>length?[length,ext[0]]:ext[1]<0?[ext[1],0]:null;
   if(!gap||gap[1]-gap[0]<.02||gap[1]-gap[0]>2.5)continue;
   const spans=points.map(project),lo=Math.min(...spans),hi=Math.max(...spans),coverage=Math.max(0,Math.min(hi,gap[1])-Math.max(lo,gap[0]))/(gap[1]-gap[0]);
   if(coverage<.55||Math.min(...points.map(across))>Math.max(.15,first.thickness))continue;
   const start=Math.min(0,ext[0]),end=Math.max(length,ext[1]),position=(gap[0]+gap[1])/2;
   gaps.set(instance.id,{center:[(first.a[0]+position*dx/length)/units,(first.a[1]+position*dy/length)/units],widthM:gap[1]-gap[0]});
   lines[a]={...first,a:[first.a[0]+start*dx/length,first.a[1]+start*dy/length],b:[first.a[0]+end*dx/length,first.a[1]+end*dy/length]};lines.splice(b,1);break outer;
  }
 }
 return {lines,gaps};
}
