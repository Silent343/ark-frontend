import type {Point2,PlanLine} from './cad-topology';
import type {NeuralInstance} from './neural-contract';
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
