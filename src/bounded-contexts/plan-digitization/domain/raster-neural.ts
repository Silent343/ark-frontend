import type { Blueprint, FloorSlab, Room } from "./entities/blueprint";
import type { NeuralPlanResult } from "./neural-plan";
import { refineRasterWalls, type RasterPixels } from "./raster-wall-refinement";
import {
  SPACE_CLASSES,
  SPACE_LABELS,
  extractNeuralSpaces,
  validNeuralSpaces,
  type NeuralSpace,
} from "./neural-spaces";
import { validNeuralModel, SPACE_MODEL_IDS, type NeuralInstance } from "./neural-contract";
import {
  extractNeuralInstances,
  associateNeuralOpening,
  fuseNeuralInstances,
} from "./neural-instances";
import {fuseRasterWalls} from './raster-detail-geometry';
import {bridgeRasterOpenings,recoverRasterWindowHosts} from './raster-opening-hosts';
import {refineRasterFloor} from './raster-floor-refinement';
import { mergeLines, signedArea, contains, type Point2 } from "./cad-topology";
import { buildPlanarGraph } from "./canonical/planar-graph";
import { polygonProblem } from "./canonical/polygon-validation";
import type { FixtureKind } from "./cad-evidence";
import {validSymbols,symbolGeometry,overlapsSymbol,type SymbolProposal} from './symbol-detection';

export interface RasterNeuralProposal {
  symbols?: SymbolProposal;
  version: 1;
  model: NeuralPlanResult["model"];
  sourceSize: { width: number; height: number };
  overlay: string;
  elapsedMs: number;
  counts: number[];
  walls: Array<{ start: Point2; end: Point2; thickness: number }>;
  instances: NeuralInstance[];
  spaces?: NeuralSpace[];
  sourceRegion?: { x: number; y: number; width: number; height: number };
  focusModelId?: string;
}

/** The caller must establish that both proposals belong to the same prepared
 * canvas. Dimensions alone are not evidence of source identity. */
export function preserveReviewedSymbols(
  next: RasterNeuralProposal,
  previous: RasterNeuralProposal | null,
  samePreparedSource: boolean,
): RasterNeuralProposal {
  if (!samePreparedSource || next.symbols || !previous?.symbols ||
    next.sourceSize.width !== previous.sourceSize.width ||
    next.sourceSize.height !== previous.sourceSize.height) return next;
  return { ...next, symbols: previous.symbols };
}

export function validRasterNeural(
  candidate: unknown,
): candidate is RasterNeuralProposal {
  if (!candidate || typeof candidate !== "object") return false;
  const p = candidate as RasterNeuralProposal,
    size = p.sourceSize;
  if (
    p.version !== 1 ||
    !p.model ||
    !validNeuralModel(p.model) ||
    !size ||
    ![size.width, size.height].every(
      (n) => Number.isInteger(n) && n > 0 && n <= 6000,
    ) ||
    typeof p.overlay !== "string" ||
    p.overlay.length > 1_500_000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.overlay) ||
    !Number.isFinite(p.elapsedMs) ||
    p.elapsedMs < 0 ||
    p.elapsedMs > 150_000 ||
    !Array.isArray(p.counts) ||
    p.counts.length !== p.model.classes.length ||
    p.counts.some((n) => !Number.isInteger(n) || n < 0 || n > 262144) ||
    !Array.isArray(p.walls) ||
    p.walls.length > 1000 ||
    !Array.isArray(p.instances) ||
    p.instances.length > 2000 ||
    !validNeuralSpaces(p.spaces, size.width, size.height) || !validSymbols(p.symbols,size) ||
    (p.spaces !== undefined && !SPACE_MODEL_IDS.includes(p.model.id)) ||
    (p.focusModelId !== undefined && p.focusModelId !== 'cubicasa-multitask-v1')
  )
    return false;
  if (p.sourceRegion !== undefined) {
    const r = p.sourceRegion;
    if (
      !r || ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width <= 0 ||
      r.height <= 0 ||
      r.x + r.width > size.width ||
      r.y + r.height > size.height
    )
      return false;
  }
  const point = (v: unknown): v is Point2 =>
    Array.isArray(v) &&
    v.length === 2 &&
    v.every(Number.isFinite) &&
    v[0] >= 0 &&
    v[1] >= 0 &&
    v[0] <= size.width &&
    v[1] <= size.height;
  const ids = new Set<string>();
  return (
    p.walls.every(
      (w) =>
        w &&
        point(w.start) &&
        point(w.end) &&
        Number.isFinite(w.thickness) &&
        w.thickness > 0 &&
        w.thickness <= Math.max(size.width, size.height),
    ) &&
    p.instances.every((i) => {
      if (
        !i ||
        typeof i.id !== "string" ||
        i.id.length > 100 ||
        ids.has(i.id) ||
        !p.model.classes.includes(i.kind) ||
        ["wall", "background"].includes(i.kind) ||
        !Number.isFinite(i.score) ||
        i.score < 0 ||
        i.score > 1 ||
        !Array.isArray(i.polygon) ||
        i.polygon.length < 3 ||
        i.polygon.length > 256 ||
        !i.polygon.every(point)
      )
        return false;
      ids.add(i.id);
      return true;
    })
  );
}

/** Recognition coordinates remain pixels. No physical scale is asserted by this operation. */
export function rasterNeuralProposal(
  result: NeuralPlanResult,
  pixels?: RasterPixels,
): RasterNeuralProposal {
  const { width, height, content: c, sourceSize: size } = result;
  if(!validSymbols(result.symbols,size))throw new Error('Detecciones de mobiliario no válidas.');
  if (
    !validNeuralModel(result.model) ||
    width !== 512 ||
    height !== 512 ||
    !c ||
    ![c.x, c.y, c.width, c.height, size?.width, size?.height].every(
      Number.isFinite,
    ) ||
    c.x < 0 ||
    c.y < 0 ||
    c.width <= 0 ||
    c.height <= 0 ||
    c.x + c.width > width ||
    c.y + c.height > height ||
    size.width <= 0 ||
    size.height <= 0 ||
    size.width > 6000 ||
    size.height > 6000
  )
    throw new Error(
      "La respuesta neuronal no corresponde a una imagen válida.",
    );
  const mask = Uint8Array.from(atob(result.mask), (s) => s.charCodeAt(0));
  const scores = Uint8Array.from(atob(result.scores), (s) => s.charCodeAt(0));
  if (
    mask.length !== width * height ||
    scores.length !== mask.length ||
    mask.some((n) => n >= result.model.classes.length)
  )
    throw new Error("Máscara neuronal incompleta.");
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x < c.x || y < c.y || x >= c.x + c.width || y >= c.y + c.height) {
        mask[y * width + x] = 0;
        scores[y * width + x] = 0;
      }
    }
  const region = result.sourceRegion ?? { x: 0, y: 0, ...size };
  if (
    ![region.x, region.y, region.width, region.height].every(Number.isFinite) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > size.width ||
    region.y + region.height > size.height
  )
    throw new Error("Región de inferencia no válida.");
  const toSource = ([x, y]: Point2): Point2 => [
    Math.max(
      0,
      Math.min(size.width, region.x + ((x - c.x) * region.width) / c.width),
    ),
    Math.max(
      0,
      Math.min(size.height, region.y + ((y - c.y) * region.height) / c.height),
    ),
  ];
  let spaces: NeuralSpace[] | undefined;
  if (result.spaces) {
    if (
      !SPACE_MODEL_IDS.includes(result.model.id) ||
      result.spaces.classes.join(",") !== SPACE_CLASSES.join(",")
    )
      throw new Error("Categorías de espacios incompatibles.");
    const spaceMask = Uint8Array.from(atob(result.spaces.mask), (s) =>
        s.charCodeAt(0),
      ),
      spaceScores = Uint8Array.from(atob(result.spaces.scores), (s) =>
        s.charCodeAt(0),
      );
    if (spaceMask.length !== mask.length || spaceScores.length !== mask.length)
      throw new Error("Máscara de espacios incompleta.");
    const coverage=result.spaces.coverageScores?Uint8Array.from(atob(result.spaces.coverageScores),s=>s.charCodeAt(0)):spaceScores;
    if(coverage.length!==spaceMask.length)throw new Error('Soporte de suelo incompleto.');
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (
          x < c.x ||
          y < c.y ||
          x >= c.x + c.width ||
          y >= c.y + c.height ||
          // A door/window is a wall opening, not a hole through the floor.
          (mask[i] === 1 && scores[i] >= 140)
        )
          spaceMask[i] = 0;
      }
    spaces = extractNeuralSpaces(
      spaceMask,
      coverage,
      width,
      height,
      toSource,
    );
  }
  const proposal:RasterNeuralProposal = {
    version: 1,
    ...(result.symbols?{symbols:result.symbols}:{}),
    model: result.model,
    sourceSize: size,
    sourceRegion: region,
    ...(result.focusModelId?{focusModelId:result.focusModelId}:{}),
    overlay: result.overlay,
    elapsedMs: result.elapsedMs,
    counts: result.counts,
    walls: refineRasterWalls(mask, scores, width, c, size, pixels, region),
    ...(spaces ? { spaces } : {}),
    instances: extractNeuralInstances(
      mask,
      scores,
      width,
      height,
      result.model.classes,
      "tile-0",
      toSource,
      0.05,
    ),
  };
  if(result.details!==undefined){
    if(!Array.isArray(result.details)||result.details.length>4)throw new Error('Lecturas de detalle no válidas.');
    const details=result.details.map((tile,index)=>{
      const p=rasterNeuralProposal({...result,...tile,details:undefined,spaces:undefined,symbols:undefined},pixels);
      // Detail crops refine architecture, not a second unreviewed furniture pass.
      // Furnishing proposals keep their dedicated detector and review gate.
      return {...p,instances:p.instances.filter(i=>i.kind==='door'||i.kind==='window').map(i=>({...i,id:`detail-${index}-${i.id}`,tileIds:[`detail-${index}`]}))};
    });
    proposal.walls=fuseRasterWalls(proposal.walls,details.flatMap(p=>p.walls));
    proposal.instances=fuseNeuralInstances([...proposal.instances,...details.flatMap(p=>p.instances)]);
  }
  return proposal;
}

const fixtureKinds = new Set<FixtureKind>([
  "chair",
  "table",
  "bed",
  "sofa",
  "toilet",
  "sink",
  "cabinet",
  "equipment",
  "plant",
  "vehicle",
  "bench",
  "bathtub",
  "fireplace",
  "chimney",
]);
const heights: Record<string, number> = {
  toilet: 0.78,
  sink: 0.85,
  cabinet: 0.9,
  bench: 0.45,
  bathtub: 0.6,
  chimney: 2.4,
  fireplace: 1.1,
};

/** Only calibrated source pixels enter the shared 2D/3D model; no CAD object is fabricated. */
export function applyRasterNeural(
  base: Blueprint,
  proposal: RasterNeuralProposal,
  levelId: string,
  wallHeight: number,
): Blueprint {
  if (!validRasterNeural(proposal))
    throw new Error("Propuesta neuronal no válida.");
  const ratio = base.calibration?.metersPerUnit;
  if (
    !ratio ||
    !Number.isFinite(ratio) ||
    ratio <= 0 ||
    !base.levels.some((l) => l.id === levelId)
  )
    throw new Error(
      "Indica una medida conocida antes de convertir las detecciones a 3D.",
    );
  if (!Number.isFinite(wallHeight) || wallHeight < 1 || wallHeight > 20)
    throw new Error("Altura no válida.");
  const metric = (p: Point2): Point2 => [p[0] * ratio, p[1] * ratio];
  const mergedLines = mergeLines(
    proposal.walls.map((w, i) => ({
      a: metric(w.start),
      b: metric(w.end),
      thickness: w.thickness * ratio,
      source: `neural-image-wall-${i}`,
    })),
    0.04,
    0.02,
  );
  const bridged=bridgeRasterOpenings(mergedLines,proposal.instances,ratio);
  const recovered=recoverRasterWindowHosts(bridged.lines,proposal.instances,ratio);
  const lines=recovered.lines,openingGaps=new Map([...bridged.gaps,...recovered.gaps]);
  const walls = lines.map((w, i) => ({
    id: `neural-image-wall-${i}`,
    levelId,
    start: w.a.map((v) => v / ratio) as Point2,
    end: w.b.map((v) => v / ratio) as Point2,
    thickness: Math.max(0.06, Math.min(0.8, w.thickness)) / ratio,
    height: wallHeight,
  }));
  const doors: Blueprint["doors"] = [],
    windows: Blueprint["windows"] = [],
    fixtures: NonNullable<Blueprint["fixtures"]> = [];
  let unhosted = 0,openingConflicts=0;
  for (const instance of [...proposal.instances].sort((a,b)=>b.score-a.score)) {
    if (instance.kind === "door" || instance.kind === "window") {
      let corrected = associateNeuralOpening(
        instance,
        walls.map((w) => ({
          a: w.start,
          b: w.end,
          thickness: w.thickness * ratio,
        })),
        ratio,
      );
      const recoveredIndex=lines.findIndex(l=>l.source===`window-jambs-${instance.id}`);
      const recoveredGap=recovered.gaps.get(instance.id);
      if(recoveredIndex>=0&&recoveredGap)corrected={...corrected,hostStatus:'hosted',hostWallIndex:recoveredIndex,center:recoveredGap.center,widthM:recoveredGap.widthM};
      if (
        corrected.hostStatus !== "hosted" ||
        !corrected.center ||
        corrected.hostWallIndex === undefined
      ) {
        unhosted++;
        continue;
      }
      const jambGap=openingGaps.get(instance.id);
      const center=jambGap?.center??corrected.center;
      const opening = {
        id: instance.id,
        levelId,
        wallId: walls[corrected.hostWallIndex].id,
        x: center[0],
        y: center[1],
        width: (jambGap?.widthM??corrected.widthM!) / ratio,
        rotation:
          (Math.atan2(
            lines[corrected.hostWallIndex].b[1] -
              lines[corrected.hostWallIndex].a[1],
            lines[corrected.hostWallIndex].b[0] -
              lines[corrected.hostWallIndex].a[0],
          ) *
            180) /
          Math.PI,
        height: Math.min(
          instance.kind === "door" ? 2.1 : 1.2,
          wallHeight - 0.1,
        ),
        ...(instance.kind === "window"
          ? { sillHeight: Math.min(0.9, Math.max(0, wallHeight - 1.3)) }
          : {}),
      };
      const list=instance.kind==='door'?doors:windows;
      const overlap=(old:Blueprint['doors'][number])=>old.wallId===opening.wallId&&((old.width+opening.width)/2-Math.hypot(old.x-opening.x,old.y-opening.y))>Math.min(old.width,opening.width)*.6;
      if((instance.kind==='door'?windows:doors).some(overlap)){openingConflicts++;continue;}
      if(!list.some(overlap))list.push(opening);
    } else if (fixtureKinds.has(instance.kind as FixtureKind) && !overlapsSymbol(instance.polygon,proposal.symbols)) {
      const xs = instance.polygon.map((p) => p[0]),
        ys = instance.polygon.map((p) => p[1]);
      const width = Math.max(...xs) - Math.min(...xs),
        depth = Math.max(...ys) - Math.min(...ys);
      if (width <= 0 || depth <= 0) continue;
      fixtures.push({
        id: instance.id,
        levelId,
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
        width,
        depth,
        height: heights[instance.kind] ?? 0.85,
        name: `${instance.kind} · detección IA`,
        kind: instance.kind as FixtureKind,
        evidence: "neural-mask",
        rotation: 0,
      });
    }
  }
  const topology = buildPlanarGraph(
    walls.map((w) => ({
      start: metric(w.start),
      end: metric(w.end),
      wallId: w.id,
    })),
    0.02,
  );
  const slabs: FloorSlab[] = [],
    rooms: Room[] = [];
  let floorOcclusions=0,floorsSnapped=0;
  const semanticSpaces=(proposal.spaces??[]).filter(s=>!polygonProblem({outer:s.polygon,holes:s.holes})).map(space=>{
    const refined=refineRasterFloor(space.polygon,space.holes,walls,ratio,proposal.symbols);
    floorOcclusions+=refined.occlusions;if(refined.snapped)floorsSnapped++;
    return {...space,polygon:refined.polygon,holes:refined.holes};
  });
  for (const face of topology.faces.filter(
    (f) => !f.exterior,
  )) {
    const polygon = face.polygon.outer.map(
        (p) => p.map((v) => v / ratio) as Point2,
      ),
      holes = face.polygon.holes.map((h) =>
        h.map((p) => p.map((v) => v / ratio) as Point2),
      );
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]);
    const width = Math.max(...xs) - Math.min(...xs),
      height = Math.max(...ys) - Math.min(...ys);
    if (width * height * ratio ** 2 < 0.5) continue;
    // A usable semantic space elsewhere must not disable every closed-wall floor.
    // Avoid overlapping finishes; never manufacture a full-sheet slab or roof.
    let interior=0,covered=0;
    for(let x=0;x<8;x++)for(let y=0;y<8;y++){
      const p:Point2=[Math.min(...xs)+(x+.5)*width/8,Math.min(...ys)+(y+.5)*height/8];
      if(!contains(p,polygon)||holes.some(h=>contains(p,h)))continue;
      interior++;if(semanticSpaces.some(s=>contains(p,s.polygon)&&!s.holes.some(h=>contains(p,h))))covered++;
    }
    if(covered||!interior||polygonProblem({outer:polygon,holes}))continue;
    rooms.push({
        id: `neural-image-room-${rooms.length}`,
        levelId,
        name: `Recinto cerrado ${rooms.length + 1} · IA`,
        x: Math.min(...xs),
        y: Math.min(...ys),
        width,
        height,
        area: (Math.abs(signedArea(polygon))-holes.reduce((n,h)=>n+Math.abs(signedArea(h)),0)) * ratio ** 2,
        polygon,holes,
      });
  }
  const invalidSpaces=(proposal.spaces?.length??0)-semanticSpaces.length;
  for (const space of semanticSpaces) {
    const polygon = space.polygon,
      holes = space.holes;
    if(polygonProblem({outer:polygon,holes})) continue;
    const area =
      (Math.abs(signedArea(polygon)) -
        holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0)) *
      ratio ** 2;
    if (area < 0.5) continue;
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]);
    const name = SPACE_LABELS[space.kind];
    rooms.push({
      id: `neural-image-${space.id}`,
      levelId,
      name,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      area,
      polygon,
      holes,
    });
    // A predicted space is not a structural slab or an automatic roof.
  }
  const detectedSymbols=symbolGeometry(proposal.symbols,levelId,wallHeight);
  return {
    ...base,
    walls,
    doors,
    windows,
    fixtures:[...fixtures,...detectedSymbols.fixtures],
    slabs,
    rooms,
    columns: [],
    stairs: detectedSymbols.stairs,
    roofs: [],
    review: {
      sourceName: "",
      page: 1,
      method: "neural-image-v1",
      status: "draft",
      reviewedIds: [],
      text: [],
      warnings: [
        "neural-image-proposal",
        "heights-assumed",
        ...(proposal.symbols ? ['neural-symbols-review-required','neural-symbol-dimensions-assumed'] : []),
        ...(proposal.spaces
          ? ["neural-space-boundaries-provisional"]
          : ["neural-spaces-unavailable"]),
        ...(unhosted ? [`neural-unhosted:${unhosted}`] : []),
        ...(recovered.gaps.size ? [`neural-window-jamb-hosts-provisional:${recovered.gaps.size}`] : []),
        ...(invalidSpaces ? [`neural-invalid-spaces:${invalidSpaces}`] : []),
        ...(floorOcclusions ? [`neural-floor-object-occlusions:${floorOcclusions}`] : []),
        ...(floorsSnapped ? [`neural-floor-wall-alignment:${floorsSnapped}`] : []),
        ...(openingConflicts ? [`neural-opening-type-conflicts:${openingConflicts}`] : []),
      ],
    },
  };
}
