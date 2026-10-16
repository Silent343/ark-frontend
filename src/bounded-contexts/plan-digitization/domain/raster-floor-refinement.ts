import {signedArea,type Point2} from './cad-topology';
import {polygonProblem} from './canonical/polygon-validation';
import type {SymbolProposal} from './symbol-detection';

type Wall={start:Point2;end:Point2;thickness:number};
function simplifyPath(points:Point2[],tolerance:number):Point2[]{
  if(points.length<3)return points;
  const a=points[0],b=points[points.length-1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  let distance=0,at=0;
  for(let i=1;i<points.length-1;i++){
    const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length**2)):0;
    const d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>distance){distance=d;at=i;}
  }
  return distance>tolerance?[...simplifyPath(points.slice(0,at+1),tolerance).slice(0,-1),...simplifyPath(points.slice(at),tolerance)]:[a,b];
}
function simplifyRing(ring:Point2[],tolerance:number){
  let far=1;for(let i=2;i<ring.length;i++)if(Math.hypot(ring[i][0]-ring[0][0],ring[i][1]-ring[0][1])>Math.hypot(ring[far][0]-ring[0][0],ring[far][1]-ring[0][1]))far=i;
  return [...simplifyPath(ring.slice(0,far+1),tolerance).slice(0,-1),...simplifyPath([...ring.slice(far),ring[0]],tolerance).slice(0,-1)];
}
/** Bounded source-space cleanup, not a new floor inferred from a bounding rectangle.
 * Only nearly parallel mask edges can snap to an observed wall face. Unknown holes
 * and stair voids stay holes; reviewed objects may explain segmentation occlusions. */
export function refineRasterFloor(polygon:Point2[],holes:Point2[][],walls:Wall[],ratio:number,symbols?:SymbolProposal){
  const tolerance=Math.min(10,.15/ratio);
  const snap=(ring:Point2[])=>ring.map((p,i):Point2=>{
    const adjacent=[ring[(i+ring.length-1)%ring.length],ring[(i+1)%ring.length]];
    const candidates=walls.flatMap(w=>{
      const dx=w.end[0]-w.start[0],dy=w.end[1]-w.start[1],length=Math.hypot(dx,dy);
      if(length<10)return [];
      const ux=dx/length,uy=dy/length,nx=-uy,ny=ux;
      // A one-cell raster stair-step is still evidence of a parallel edge.
      // Requiring long adjacent edges left the short teeth unaligned between
      // already snapped vertices, producing the serrated 3D floor boundary.
      if(!adjacent.some(q=>{const l=Math.hypot(q[0]-p[0],q[1]-p[1]);return l>1e-6&&Math.abs(((q[0]-p[0])*ux+(q[1]-p[1])*uy)/l)>.97;}))return [];
      const along=(p[0]-w.start[0])*ux+(p[1]-w.start[1])*uy;
      if(along < -tolerance||along>length+tolerance)return [];
      const normal=(p[0]-w.start[0])*nx+(p[1]-w.start[1])*ny;
      const delta=(normal>=0?1:-1)*w.thickness/2-normal;
      return Math.abs(delta)<=tolerance?[{nx,ny,delta}]:[];
    }).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta));
    const first=candidates[0];if(!first)return p;
    const second=candidates.find(c=>Math.abs(c.nx*first.nx+c.ny*first.ny)<.05);
    const next:Point2=[p[0]+first.nx*first.delta+(second?.nx??0)*(second?.delta??0),p[1]+first.ny*first.delta+(second?.ny??0)*(second?.delta??0)];
    return Math.hypot(next[0]-p[0],next[1]-p[1])<=tolerance?next:p;
  });
  // Discard only holes fully explained by a reviewed non-stair object, never
  // arbitrary small holes or shafts. Decisions remain reproducible from evidence.
  const objects=(symbols?.items??[]).filter(i=>i.status==='confirmed'&&i.kind!=='stair');
  const kept=holes.filter(h=>!objects.some(i=>h.every(([x,y])=>x>=i.box[0]&&x<=i.box[2]&&y>=i.box[1]&&y<=i.box[3])));
  const candidate=snap(polygon);
  const unique=candidate.filter((p,i)=>Math.hypot(p[0]-candidate[(i+candidate.length-1)%candidate.length][0],p[1]-candidate[(i+candidate.length-1)%candidate.length][1])>1e-6);
  const dedup=unique.filter((p,i)=>{
    const a=unique[(i+unique.length-1)%unique.length],b=unique[(i+1)%unique.length];
    const dx=p[0]-a[0],dy=p[1]-a[1],ex=b[0]-p[0],ey=b[1]-p[1];
    return Math.abs(dx*ey-dy*ex)>1e-6||dx*ex+dy*ey<0;
  });
  const area=Math.abs(signedArea(polygon)),change=Math.abs(Math.abs(signedArea(dedup))-area);
  const accepted=change<=Math.max(1,area*.08)&&!polygonProblem({outer:dedup,holes:kept});
  let clean=accepted?dedup:polygon;
  // Bound contour approximation in both source pixels and metres. Unknown holes
  // stay untouched, and topology/area checks may reject the approximation.
  for(const factor of [1,.5,.25]){
    const simplified=simplifyRing(clean,Math.min(4,.05/ratio)*factor);
    if(simplified.length<clean.length&&Math.abs(Math.abs(signedArea(simplified))-area)<=Math.max(1,area*.08)&&!polygonProblem({outer:simplified,holes:kept})){clean=simplified;break;}
  }
  return {polygon:clean,holes:kept,occlusions:holes.length-kept.length,snapped:accepted&&dedup.some((p,i)=>p[0]!==polygon[i]?.[0]||p[1]!==polygon[i]?.[1])};
}
