import type {Point2} from './cad-topology';
type Axis={start:Point2;end:Point2;thickness:number};
const length=(a:Axis)=>Math.hypot(a.end[0]-a.start[0],a.end[1]-a.start[1]);
function relation(a:Axis,b:Axis){
 const n=length(a),m=length(b),dx=(a.end[0]-a.start[0])/n,dy=(a.end[1]-a.start[1])/n;
 if(!n||!m||Math.abs((dx*(b.end[0]-b.start[0])+dy*(b.end[1]-b.start[1]))/m)<.999)return null;
 const across=(p:Point2)=>Math.abs((p[0]-a.start[0])*dy-(p[1]-a.start[1])*dx);
 if(Math.max(across(b.start),across(b.end))>Math.max(1,Math.min(a.thickness,b.thickness)*.35))return null;
 const [lo,hi]=[b.start,b.end].map(p=>(p[0]-a.start[0])*dx+(p[1]-a.start[1])*dy).sort((x,y)=>x-y);
 return {n,dx,dy,lo,hi};
}
/** Prefer finer supported observations; merge overlap, never an unobserved doorway gap. */
export function fuseRasterWalls(coarse:Axis[],detail:Axis[]):Axis[]{
 const kept=coarse.filter(a=>!detail.some(b=>{const r=relation(a,b);return r&&Math.max(0,Math.min(r.n,r.hi)-Math.max(0,r.lo))/r.n>.65;}));
 const output:Axis[]=[];
 for(const b of [...detail,...kept].filter(a=>length(a)>1).sort((a,b)=>length(b)-length(a))){
  const a=output.find(a=>{const r=relation(a,b);return r&&r.lo<=r.n&&r.hi>=0;});
  if(!a){output.push({...b,start:[...b.start],end:[...b.end]});continue;}
  const r=relation(a,b)!;const origin=[...a.start] as Point2;
  a.start=[origin[0]+Math.min(0,r.lo)*r.dx,origin[1]+Math.min(0,r.lo)*r.dy];
  a.end=[origin[0]+Math.max(r.n,r.hi)*r.dx,origin[1]+Math.max(r.n,r.hi)*r.dy];
 }
 if(output.length>1000)throw new Error('Demasiados tramos de muro. Delimita una planta.');
 return output;
}
