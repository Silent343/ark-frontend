import type { Point2 } from "./cad-topology";
import { signedArea, contains } from "./cad-topology";
import {polygonProblem} from './canonical/polygon-validation';

export const SPACE_CLASSES = [
  "background",
  "outdoor",
  "wall",
  "kitchen",
  "living",
  "bedroom",
  "bathroom",
  "entry",
  "railing",
  "storage",
  "garage",
  "undefined",
] as const;
export const SPACE_LABELS: Record<string, string> = {
  outdoor: "Exterior",
  kitchen: "Cocina",
  living: "Sala / comedor",
  bedroom: "Dormitorio",
  bathroom: "Baño",
  entry: "Circulación",
  storage: "Almacén",
  garage: "Garaje",
  undefined: "Espacio sin clasificar",
};
export interface NeuralSpace {
  id: string;
  kind: string;
  polygon: Point2[];
  holes: Point2[][];
  score: number;
}

/** Sub-threshold islands of another floor category are semantic uncertainty,
 * not holes through the floor. Never relabel background, walls or railings. */
export function stabilizeFloorClasses(mask:Uint8Array,scores:Uint8Array,width:number,height:number){
  const output=mask.slice(),seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);
  const floor=(i:number)=>![0,2,8].includes(mask[i])&&scores[i]>=140;
  for(let seed=0;seed<mask.length;seed++){
    if(seen[seed]||!floor(seed))continue;
    const label=mask[seed],neighbors=new Map<number,number>();let head=0,tail=1,closed=true;queue[0]=seed;seen[seed]=1;
    while(head<tail){
      const at=queue[head++],x=at%width,y=Math.floor(at/width);
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nx=x+dx,ny=y+dy,i=ny*width+nx;
        if(nx<0||ny<0||nx>=width||ny>=height||!floor(i)){closed=false;continue;}
        if(mask[i]!==label){neighbors.set(mask[i],(neighbors.get(mask[i])??0)+1);continue;}
        if(!seen[i]){seen[i]=1;queue[tail++]=i;}
      }
    }
    if(tail>=64||!closed||!neighbors.size)continue;
    const dominant=[...neighbors].sort((a,b)=>b[1]-a[1])[0][0];
    for(let i=0;i<tail;i++)output[queue[i]]=dominant;
  }
  return output;
}

function simplifyPath(points: Point2[], tolerance: number): Point2[] {
  if (points.length < 3) return points;
  const a = points[0],
    b = points.at(-1)!;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  let max = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = length
      ? Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length
      : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  return max > tolerance
    ? [
        ...simplifyPath(points.slice(0, index + 1), tolerance).slice(0, -1),
        ...simplifyPath(points.slice(index), tolerance),
      ]
    : [a, b];
}

function splitPinches(points:Point2[]):Point2[][] {
  const seen=new Map<string,number>();
  for(let i=0;i<points.length;i++){
    const key=points[i].join(',');const at=seen.get(key);
    if(at!==undefined){const inner=points.slice(at,i),outer=[...points.slice(0,at),...points.slice(i)];return [...(inner.length>=3?splitPinches(inner):[]),...(outer.length>=3?splitPinches(outer):[])];}
    seen.set(key,i);
  }
  return [points];
}
function simplifyRing(loop:Point2[],tolerance:number,anchors=new Set<string>()):Point2[] {
  let far=1;
  for(let i=2;i<loop.length;i++)if(Math.hypot(loop[i][0]-loop[0][0],loop[i][1]-loop[0][1])>Math.hypot(loop[far][0]-loop[0][0],loop[far][1]-loop[0][1]))far=i;
  const fixed=loop.flatMap((p,i)=>anchors.has(p.join(','))?[i]:[]);
  if(fixed.length<2){fixed.push(0,far);fixed.sort((a,b)=>a-b);}
  for(let t=tolerance;t>=.01;t/=2){
    const candidate=[...new Set(fixed)].flatMap((start,i,all)=>{
      const end=all[(i+1)%all.length];
      const part=end>start?loop.slice(start,end+1):[...loop.slice(start),...loop.slice(0,end+1)];
      return simplifyPath(part,t).slice(0,-1);
    });
    if(candidate.length>=3&&!polygonProblem({outer:candidate,holes:[]}))return candidate;
  }
  return loop;
}

/** Pixel-cell boundary tracing, not a bounding rectangle or convex hull.
 * Open-plan concavities and interior exclusions survive conversion to 3D. */
export function extractNeuralSpaces(
  mask: Uint8Array,
  scores: Uint8Array,
  width: number,
  height: number,
  toSource: (p: Point2) => Point2,
  diagnostics?: (value:unknown)=>void,
): NeuralSpace[] {
  if (
    mask.length !== width * height ||
    scores.length !== mask.length ||
    mask.some((n) => n >= SPACE_CLASSES.length)
  )
    throw new Error("Máscara de espacios no válida.");
  mask=stabilizeFloorClasses(mask,scores,width,height);
  const seen = new Uint8Array(mask.length),
    component = new Int32Array(mask.length),
    queue = new Int32Array(mask.length);
  const result: NeuralSpace[] = [];
  let componentId = 0;
  for (let seed = 0; seed < mask.length; seed++) {
    const label = mask[seed];
    if (seen[seed] || [0, 2, 8].includes(label) || scores[seed] < 140) continue;
    componentId++;
    let head = 0,
      tail = 1,
      sum = 0;
    queue[0] = seed;
    seen[seed] = 1;
    component[seed] = componentId;
    while (head < tail) {
      const at = queue[head++],
        x = at % width,
        y = Math.floor(at / width);
      sum += scores[at];
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          n = ny * width + nx;
        if (
          nx < 0 ||
          ny < 0 ||
          nx >= width ||
          ny >= height ||
          seen[n] ||
          mask[n] !== label ||
          scores[n] < 140
        )
          continue;
        seen[n] = 1;
        component[n] = componentId;
        queue[tail++] = n;
      }
    }
    if (tail < 64) continue;
    const edges: { a: number; b: number }[] = [],
      outgoing = new Map<number, number[]>();
    const node = (x: number, y: number) => y * (width + 1) + x;
    const add = (ax: number, ay: number, bx: number, by: number) => {
      const a = node(ax, ay),
        b = node(bx, by),
        index = edges.length;
      edges.push({ a, b });
      outgoing.set(a, [...(outgoing.get(a) ?? []), index]);
    };
    for (let i = 0; i < tail; i++) {
      const at = queue[i],
        x = at % width,
        y = Math.floor(at / width);
      if (!y || component[at - width] !== componentId) add(x, y, x + 1, y);
      if (x === width - 1 || component[at + 1] !== componentId)
        add(x + 1, y, x + 1, y + 1);
      if (y === height - 1 || component[at + width] !== componentId)
        add(x + 1, y + 1, x, y + 1);
      if (!x || component[at - 1] !== componentId) add(x, y + 1, x, y);
    }
    const used = new Uint8Array(edges.length),
      loops: Point2[][] = [];
    const point = (n: number): Point2 => [
      n % (width + 1),
      Math.floor(n / (width + 1)),
    ];
    for (let first = 0; first < edges.length; first++) {
      if (used[first]) continue;
      let index = first;
      const loop: Point2[] = [];
      let closed=false;
      for (let limit = 0; limit <= edges.length; limit++) {
        const edge = edges[index];
        used[index] = 1;
        loop.push(point(edge.a));
        if (edge.b === edges[first].a) {closed=true;break;}
        const choices = (outgoing.get(edge.b) ?? []).filter((n) => !used[n]);
        if (!choices.length) break;
        const a = point(edge.a),
          b = point(edge.b);
        choices.sort((i, j) => {
          const turn = (n: number) => {
            const c = point(edges[n].b);
            return Math.atan2(
              (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
              (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]),
            );
          };
          return turn(j) - turn(i);
        });
        index = choices[0];
      }
      if(closed&&loop.length>=4)loops.push(...splitPinches(loop));
    }
    // Separate zero-width pixel contacts by a subpixel bevel, not by deleting
    // exclusions or replacing a non-convex room with its bounding rectangle.
    const touches=new Map<string,number>();for(const loop of loops)for(const p of loop)touches.set(p.join(','),(touches.get(p.join(','))??0)+1);
    const anchors=new Set<string>();
    const safeLoops=loops.map(loop=>loop.flatMap((v,i)=>{
      if((touches.get(v.join(','))??0)<2)return [v];
      const a=loop[(i+loop.length-1)%loop.length],b=loop[(i+1)%loop.length];
      const points=[[v[0]+(a[0]-v[0])*.2,v[1]+(a[1]-v[1])*.2],[v[0]+(b[0]-v[0])*.2,v[1]+(b[1]-v[1])*.2]] as Point2[];
      for(const p of points)anchors.add(p.join(','));return points;
    }));
    for(const outer of safeLoops.filter(p=>signedArea(p)>0)){
      const holes=safeLoops.filter(p=>signedArea(p)<0&&contains(p[0],outer));
      if(holes.length>32){diagnostics?.({kind:SPACE_CLASSES[label],reason:'too-many-holes',holes:holes.length});continue;}
      for(const tolerance of [1,.5,.25,.1,.05,2,4,8]){
        const polygon=simplifyRing(outer,tolerance,anchors),exclusions=holes.map(h=>simplifyRing(h,tolerance,anchors));
        const problem=polygonProblem({outer:polygon,holes:exclusions});
        if(polygon.length>256||exclusions.some(h=>h.length>256)||problem){diagnostics?.({kind:SPACE_CLASSES[label],reason:problem,vertices:polygon.length,holes:exclusions.map(h=>h.length),tolerance});continue;}
        result.push({id:`space-${result.length}`,kind:SPACE_CLASSES[label],polygon:polygon.map(toSource),holes:exclusions.map(h=>h.map(toSource)),score:sum/tail/255});
        break;
      }
    }
    if (result.length > 100)
      throw new Error("Demasiados espacios propuestos. Recorta una planta.");
  }
  return result;
}

export function validNeuralSpaces(
  value: unknown,
  width: number,
  height: number,
): value is NeuralSpace[] | undefined {
  if (value === undefined) return true; // older saved evidence
  const ring = (v: unknown) =>
    Array.isArray(v) &&
    v.length >= 3 &&
    v.length <= 256 &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every(Number.isFinite) &&
        p[0] >= 0 &&
        p[1] >= 0 &&
        p[0] <= width &&
        p[1] <= height,
    ) &&
    Math.abs(signedArea(v)) > 0;
  const ids = new Set<string>();
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((s) => {
      if (
        !s ||
        typeof s.id !== "string" ||
        s.id.length > 100 ||
        ids.has(s.id) ||
        !Object.hasOwn(SPACE_LABELS, s.kind) ||
        !Number.isFinite(s.score) ||
        s.score < 0 ||
        s.score > 1 ||
        !ring(s.polygon) ||
        !Array.isArray(s.holes) ||
        s.holes.length > 32 ||
        !s.holes.every(ring)
      )
        return false;
      ids.add(s.id);
      return true;
    })
  );
}
