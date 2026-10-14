import type { Blueprint, Opening } from "./entities/blueprint";
import type {
  CadEntity,
  CadPlan,
  CadRegion,
  CadRole,
} from "./entities/cad-plan";
import { cadEntityBounds, cadBounds } from "./cad-operations";
import { cadNeuralSignature } from "./neural-plan";
import {
  fixtureKind,
  blockRole,
  isDoorArc,
  type FixtureKind,
} from "./cad-evidence";
import { convexHull, detectFloorSurfaces } from "./cad-floor-mask";
import {
  contains,
  direction,
  distance,
  dot,
  floorFaces,
  lineDistance,
  mergeLines,
  orientedBox,
  plus,
  project,
  reconstructWalls,
  registerPlan,
  sub,
  type PlanLine,
  type Point2,
} from "./cad-topology";

const PX = 60;
type SymbolGroup = { role: CadRole; entities: CadEntity[]; points: Point2[] };
const midpoint = (l: PlanLine): Point2 => [
  (l.a[0] + l.b[0]) / 2,
  (l.a[1] + l.b[1]) / 2,
];
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

function pointsOf(e: CadEntity, units: number): Point2[] {
  if (e.kind === "path")
    return e.points.flatMap((x, i) =>
      i % 2 ? [] : [[x * units, e.points[i + 1] * units] as Point2],
    );
  if (e.kind === "circle")
    return Array.from(
      { length: 16 },
      (_, i) =>
        [
          (e.x + Math.cos((i * Math.PI) / 8) * e.radius) * units,
          (e.y + Math.sin((i * Math.PI) / 8) * e.radius) * units,
        ] as Point2,
    );
  return [[e.x * units, e.y * units]];
}
function linesOf(entities: CadEntity[], units: number): PlanLine[] {
  return entities.flatMap((e) => {
    if (e.kind !== "path") return [];
    const p = pointsOf(e, units);
    if (e.closed) p.push(p[0]);
    return p
      .slice(1)
      .map((b, i) => ({ a: p[i], b, thickness: 0, source: e.id }))
      .filter((l) => distance(l.a, l.b) > 0.025);
  });
}
function inRegion(e: CadEntity, r: CadRegion, margin = 0.02) {
  const b = cadEntityBounds(e),
    x = (b.minX + b.maxX) / 2,
    y = (b.minY + b.maxY) / 2;
  return (
    x >= r.minX - margin &&
    x <= r.maxX + margin &&
    y >= r.minY - margin &&
    y <= r.maxY + margin
  );
}

/** Explicit finished-floor labels take precedence over the project's default storey height. */
export function floorElevations(entities: CadEntity[]): number[] {
  const votes = new Map<number, number>();
  for (const e of entities) {
    if (e.kind !== "text") continue;
    const match = normalize(e.value)
      .replace(/\+\s*-/g, "")
      .match(/N\.?P\.?T\.?\s*[:=]?\s*([+-]?\s*\d+(?:[.,]\d+)?)/);
    if (!match) continue;
    const value = Number(match[1].replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(value) && Math.abs(value) < 1000)
      votes.set(value, (votes.get(value) ?? 0) + 1);
  }
  return [...votes].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

/** Keep source blocks when compact. For exploded symbols, cluster touching strokes within the same semantic role. */
export function symbols(
  entities: CadEntity[],
  role: CadRole,
  units: number,
): SymbolGroup[] {
  const groups: CadEntity[][] = [];
  const blocks = new Map<string, CadEntity[]>();
  for (const e of entities)
    if (e.group && e.kind !== "text") {
      const list = blocks.get(e.group) ?? [];
      list.push(e);
      blocks.set(e.group, list);
    }
  const grouped = new Set<string>();
  for (const [id, items] of blocks) {
    const b = cadBounds(items);
    if (Math.max(b.maxX - b.minX, b.maxY - b.minY) * units <= 8) {
      groups.push(items);
      grouped.add(id);
    }
  }
  const rows = entities
    .filter((e) => e.kind !== "text" && !grouped.has(e.group ?? ""))
    .map((e) => ({ e, b: cadEntityBounds(e) }))
    .sort((a, b) => a.b.minX - b.b.minX);
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const tolerance = 0.018 / units;
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i].b,
        b = rows[j].b;
      if (b.minX > a.maxX + tolerance) break;
      if (b.minY > a.maxY + tolerance || b.maxY < a.minY - tolerance) continue;
      parent[find(j)] = find(i);
    }
  const indexed = new Map<number, CadEntity[]>();
  rows.forEach(({ e }, i) => {
    const key = find(i);
    if (!indexed.has(key)) indexed.set(key, []);
    indexed.get(key)!.push(e);
  });
  groups.push(...indexed.values());
  return groups.map((items) => ({
    role,
    entities: items,
    points: items.flatMap((e) => pointsOf(e, units)),
  }));
}

function findOpening(
  group: SymbolGroup,
  walls: PlanLine[],
  supports: Point2[],
  units: number,
): { wall: PlanLine; center: Point2; width: number } | null {
  let best: {
    wall: PlanLine;
    center: Point2;
    width: number;
    score: number;
  } | null = null;
  // Existing plan gaps are strong evidence: their jambs specify orientation and exact opening width.
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i],
        b = walls[j];
      if (distance(a.a, a.b) < 0.1 || distance(b.a, b.b) < 0.1) continue;
      if (
        Math.abs(dot(direction(a), direction(b))) < 0.999 ||
        lineDistance(b.a, a) > Math.max(0.08, a.thickness * 0.35)
      )
        continue;
      const length = distance(a.a, a.b),
        positions = [project(b.a, a), project(b.b, a)].sort((x, y) => x - y);
      const start = positions[0] > length ? length : positions[1],
        end = positions[0] > length ? positions[0] : 0;
      const width = end - start;
      if (
        width < 0.35 ||
        width > 4 ||
        (positions[0] <= length && positions[1] >= 0)
      )
        continue;
      const p = group.points.map((v) => project(v, a)),
        low = Math.min(...p),
        high = Math.max(...p);
      const center = plus(a.a, direction(a), start + width / 2);
      const near = Math.min(...group.points.map((v) => distance(v, center)));
      if (
        low > start + 0.2 ||
        high < end - 0.2 ||
        near > Math.max(0.5, width * 0.7) ||
        high - low > width + 0.65
      )
        continue;
      const score = Math.abs(high - low - width) + near * 0.25;
      if (!best || score < best.score)
        best = {
          wall: {
            ...a,
            a: plus(a.a, direction(a), start),
            b: plus(a.a, direction(a), end),
            source: group.entities[0].id,
          },
          center,
          width,
          score,
        };
    }
  if (best) {
    walls.push(best.wall);
    return best;
  }
  // A jamb may end at a perpendicular wall or column instead of a second parallel wall.
  // Test symbol-oriented edges, requiring physical support at BOTH ends before creating a host.
  for (const stroke of linesOf(group.entities, units).filter(
    (l) => distance(l.a, l.b) > 0.4,
  )) {
    const u = direction(stroke),
      box = orientedBox(group.points, Math.atan2(u[1], u[0]));
    for (let i = 0; i < 4; i++) {
      const a = box.corners[i],
        b = box.corners[(i + 1) % 4],
        width = distance(a, b);
      if (width < 0.45 || width > 4) continue;
      const edge: PlanLine = {
        a,
        b,
        thickness: 0.15,
        source: group.entities[0].id,
      };
      const ends = [...supports, ...walls.flatMap((w) => [w.a, w.b])];
      const da = Math.min(...ends.map((p) => distance(p, a))),
        db = Math.min(...ends.map((p) => distance(p, b)));
      if (da > 0.3 || db > 0.3) continue;
      const host = walls.find(
        (w) =>
          Math.abs(dot(direction(w), direction(edge))) > 0.995 &&
          lineDistance(a, w) < 0.24 &&
          Math.min(
            distance(a, w.a),
            distance(a, w.b),
            distance(b, w.a),
            distance(b, w.b),
          ) < 0.4,
      );
      if (!host) continue;
      const score = da + db + lineDistance(a, host);
      if (!best || score < best.score) {
        const offset = sub(
          plus(host.a, direction(host), project(midpoint(edge), host)),
          midpoint(edge),
        );
        const bridge = {
          ...edge,
          a: plus(a, offset, 1),
          b: plus(b, offset, 1),
          thickness: host.thickness,
        };
        best = { wall: bridge, center: midpoint(bridge), width, score };
      }
    }
  }
  if (best) {
    walls.push(best.wall);
    return best;
  }
  // Windows can also be drawn across a continuous wall. Projection removes symbol offsets and swing arcs.
  for (const wall of walls) {
    if (distance(wall.a, wall.b) < 0.1) continue;
    const projections = group.points.map((v) => project(v, wall)),
      low = Math.min(...projections),
      high = Math.max(...projections),
      width = high - low;
    if (
      width < 0.45 ||
      width > 4 ||
      low < -0.06 ||
      high > distance(wall.a, wall.b) + 0.06
    )
      continue;
    const distances = group.points.map((v) => lineDistance(v, wall)),
      near = Math.min(...distances),
      far = Math.max(...distances);
    if (
      near > wall.thickness / 2 + 0.09 ||
      far > (group.role === "window" ? 0.5 : width + 0.15)
    )
      continue;
    const score = near + far * (group.role === "window" ? 1 : 0.15);
    if (!best || score < best.score)
      best = {
        wall,
        center: plus(wall.a, direction(wall), (low + high) / 2),
        width,
        score,
      };
  }
  return best;
}

/** Parallel, regularly spaced treads identify individual flights, including rotated switchbacks. */
export function stairFlights(entities: CadEntity[], units: number) {
  const lines = mergeLines(linesOf(entities, units), -0.03).filter((l) => {
    const n = distance(l.a, l.b);
    return n >= 0.65 && n <= 2.1;
  });
  const used = new Set<number>();
  const flights: Array<{
    center: Point2;
    corners: Point2[];
    width: number;
    length: number;
    angle: number;
    steps: number;
  }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const a = lines[i],
      u = direction(a),
      n: Point2 = [-u[1], u[0]],
      origin = midpoint(a);
    const neighbors = lines
      .map((l, index) => ({ l, index, pos: dot(sub(midpoint(l), origin), n) }))
      .filter(
        ({ l, index }) =>
          !used.has(index) &&
          Math.abs(dot(direction(l), u)) > 0.999 &&
          Math.abs(dot(sub(midpoint(l), origin), u)) < 0.12 &&
          Math.abs(distance(l.a, l.b) - distance(a.a, a.b)) < 0.22,
      )
      .sort((x, y) => x.pos - y.pos);
    let run: typeof neighbors = [];
    const finish = () => {
      if (run.length < 4) return;
      const gaps = run
          .slice(1)
          .map((p, index) => p.pos - run[index].pos)
          .sort((x, y) => x - y),
        tread = gaps[Math.floor(gaps.length / 2)];
      const angle = Math.atan2(u[1], u[0]),
        box = orientedBox(
          run.flatMap(({ l }) => [l.a, l.b]),
          angle,
        );
      if (box.depth < 0.6) return;
      flights.push({
        center: box.center,
        corners: orientedBox(
          [
            plus(box.corners[0], n, -tread / 2),
            plus(box.corners[2], n, tread / 2),
          ],
          angle,
        ).corners,
        width: box.width,
        length: box.depth + tread,
        angle: Math.atan2(n[1], n[0]),
        steps: run.length,
      });
      run.forEach(({ index }) => used.add(index));
    };
    for (const item of neighbors) {
      if (
        run.length &&
        (item.pos - run.at(-1)!.pos > 0.38 || item.pos - run.at(-1)!.pos < 0.13)
      ) {
        finish();
        run = [];
      }
      run.push(item);
    }
    finish();
  }
  return flights;
}

/** Import first, reconstruct after confirming units. Never extrude a whole large package at guessed scale. */
export function stageCadBlueprint(
  base: Blueprint,
  cad: CadPlan,
  height = 2.8,
): Blueprint {
  const staged = compileCadBlueprint(base, { ...cad, regions: [] }, height);
  return {
    ...staged,
    cad,
    levels: staged.levels.map((l) =>
      l.id === "level-1" ? { ...l, name: "Pendiente de escala y plantas" } : l,
    ),
    review: {
      ...staged.review!,
      warnings: ["cad-semantic-review", "cad-awaiting-units"],
    },
  };
}

/** One calibrated model is compiled from evidence shared by 2D and 3D. Source CAD entities remain untouched. */
export function compileCadBlueprint(
  base: Blueprint,
  cad: CadPlan,
  defaultHeight = 2.8,
): Blueprint {
  const units = cad.metersPerCadUnit,
    roles = new Map(cad.layers.map((l) => [l.name, l.role]));
  const roleOf = (e: CadEntity) =>
    e.group?.includes("dimension")
      ? "reference"
      : (e.role ?? roles.get(e.layer));
  const plans = cad.regions
    .filter((r) => r.enabled && (!r.viewType || r.viewType === "plan"))
    .map((region) => {
      const entities = cad.entities.filter((e) => inRegion(e, region));
      const raw = linesOf(
        entities.filter((e) => roleOf(e) === "wall"),
        units,
      );
      // Structural layers can contain both compact columns and long shear walls. Paired faces distinguish them from grid axes.
      const structural = reconstructWalls(
        linesOf(
          entities.filter((e) => roleOf(e) === "column"),
          units,
        ),
      ).filter((w) => w.paired && distance(w.a, w.b) > 1.3);
      const neural = cad.unitConfirmed
        ? cad.neural?.find(
            (a) =>
              a.regionId === region.id &&
              a.applied &&
              a.sourceSignature === cadNeuralSignature(cad, region) &&
              a.walls.length > 0,
          )
        : undefined;
      return {
        region,
        entities,
        raw,
        structural,
        neural,
        walls: neural
          ? neural.walls.map((w, i) => ({
              a: [w.a[0] * units, w.a[1] * units] as Point2,
              b: [w.b[0] * units, w.b[1] * units] as Point2,
              thickness: w.thickness,
              source: w.sourceIds?.[0] ?? `neural-${i}`,
              sourceIds: w.sourceIds ?? [],
              paired: false,
            }))
          : mergeLines([...reconstructWalls(raw), ...structural], 0.06, 0.025),
        center: [
          ((region.minX + region.maxX) * units) / 2,
          ((region.minY + region.maxY) * units) / 2,
        ] as Point2,
      };
    });
  const reference = [...plans].sort(
    (a, b) =>
      b.region.repeat - a.region.repeat || b.walls.length - a.walls.length,
  )[0];
  const next: Blueprint = {
    ...base,
    cad,
    sourceImage: undefined,
    sourceSize: undefined,
    sourceOffset: undefined,
    sheets: (base.sheets ?? []).filter(
      (s) => s.viewType && s.viewType !== "plan",
    ),
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    columns: [],
    stairs: [],
    roofs: [],
    services: [],
    routes: [],
    fixtures: [],
    slabs: [],
    floorDetails: [],
    levels: [],
    elementEvidence: {},
    width: 4000,
    height: 4000,
    scale: `${units} m / unidad CAD`,
    calibration: {
      metersPerUnit: 1 / PX,
      referencePoints: [
        [0, 0],
        [600, 0],
      ],
      referenceDistanceM: 10,
    },
    review: {
      sourceName: cad.sourceName,
      page: 1,
      method: "manual-tracing",
      status: "draft",
      reviewedIds: [],
      text: [],
      warnings: ["cad-semantic-review"],
    },
    reconstruction: {
      version: 6,
      pairedWalls: 0,
      sourceEdges: plans.reduce((n, p) => n + p.raw.length, 0),
      alignedPlans: 0,
      namedSpaces: 0,
      fixtureCount: 0,
      unresolvedSymbols: 0,
      inferredLayers: cad.layers.filter((l) => l.inferred).map((l) => l.name),
      unmatchedOpenings: 0,
      unregisteredRegions: [],
    },
  };
  if (!reference) {
    next.levels = [
      { id: "level-1", name: "Sin plantas asignadas", elevation: 0 },
    ];
    for (const sheet of next.sheets ?? []) {
      const level = base.levels.find((l) => l.id === sheet.levelId);
      if (level && !next.levels.some((l) => l.id === level.id))
        next.levels.push(level);
      next.width = Math.max(next.width, sheet.x + sheet.width);
      next.height = Math.max(next.height, sheet.y + sheet.height);
    }
    return next;
  }
  // Read NPT only during detection; user-edited region elevations always remain authoritative here.
  const levels = plans
    .flatMap((p) =>
      Array.from({ length: p.region.repeat }, (_, floor) => ({
        plan: p,
        floor,
        elevation:
          p.region.elevations?.[floor] ??
          p.region.elevation + floor * defaultHeight,
      })),
    )
    .sort((a, b) => a.elevation - b.elevation);
  for (const plan of plans) {
    const { region, entities } = plan;
    const registration =
      plan === reference
        ? { offset: [0, 0] as Point2, matched: Infinity }
        : registerPlan(
            plan.walls,
            reference.walls,
            sub(reference.center, plan.center),
          );
    // A manual correction is relative to the automatic registration, in metres.
    if (region.alignment) {
      registration.offset = [
        registration.offset[0] + region.alignment.x,
        registration.offset[1] + region.alignment.y,
      ];
    }
    if (registration.matched || region.alignment)
      next.reconstruction!.alignedPlans++;
    else next.reconstruction!.unregisteredRegions!.push(region.id);
    const toPlan = (p: Point2): Point2 => [
      2000 + (p[0] + registration.offset[0] - reference.center[0]) * PX,
      2000 - (p[1] + registration.offset[1] - reference.center[1]) * PX,
    ];
    const record = (
      id: string,
      sourceIds: string[],
      method: import("./entities/blueprint").ElementEvidence["method"],
      assumed: string[],
    ) => {
      next.elementEvidence![id] = {
        sourceName: cad.sourceName,
        regionId: region.id,
        sourceIds: [...new Set(sourceIds)].slice(0, 500),
        method,
        assumed,
      };
    };
    let walls = plan.walls.map((w, neuralIndex) => ({
      ...w,
      neuralIndex,
      a: [...w.a] as Point2,
      b: [...w.b] as Point2,
    }));
    // Column layers often contain long grid axes too. Only closed, compact structural contours become columns.
    const columnContours = floorFaces(
      linesOf(
        entities.filter((e) => roleOf(e) === "column"),
        units,
      ).filter((l) => distance(l.a, l.b) <= 1.6),
      0.025,
    );
    const columns = columnContours
      .map((points) => {
        const edge = points
          .map((a, i) => ({
            a,
            b: points[(i + 1) % points.length],
            thickness: 0,
            source: "column",
          }))
          .sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b))[0];
        const d = direction(edge),
          angle = Math.atan2(d[1], d[0]);
        return { ...orientedBox(points, angle), angle };
      })
      .filter(
        (c) =>
          Math.min(c.width, c.depth) >= 0.12 &&
          Math.max(c.width, c.depth) <= 1.3,
      );
    for (const wall of walls)
      for (const column of columns) {
        const reach = Math.hypot(column.width, column.depth) / 2 + 0.12;
        // Extend on the original axis: snapping to the column centre would rotate the wall and its openings.
        const projected = plus(
          wall.a,
          direction(wall),
          project(column.center, wall),
        );
        if (distance(wall.a, column.center) < reach) wall.a = projected;
        if (distance(wall.b, column.center) < reach) wall.b = projected;
      }
    walls = walls.filter((w) => distance(w.a, w.b) > 0.1);
    const proposals: Array<{
      group: SymbolGroup;
      match: NonNullable<ReturnType<typeof findOpening>>;
    }> = [];
    const openingGroups = (["window", "door"] as const).flatMap((role) =>
      symbols(
        entities.filter((e) => roleOf(e) === role),
        role,
        units,
      ),
    );
    // Mixed joinery layers contain both doors and windows. A door needs swing/block evidence.
    for (const group of openingGroups) {
      if (
        group.role === "door" &&
        group.entities.every((e) =>
          /puertas?.*ventanas?|doors?.*windows?/i.test(e.layer),
        ) &&
        !group.entities.some(
          (e) =>
            isDoorArc(e, units) ||
            (e.blockName && blockRole(e.blockName) === "door"),
        )
      ) {
        const box = orientedBox(group.points, 0);
        if (
          Math.max(box.width, box.depth) /
            Math.max(0.01, Math.min(box.width, box.depth)) >
          2.5
        )
          group.role = "window";
      }
    }
    for (const group of openingGroups) {
      const match = findOpening(
        group,
        walls,
        columns.flatMap((c) => c.corners),
        units,
      );
      if (
        match &&
        !proposals.some((p) => distance(p.match.center, match.center) < 0.12)
      )
        proposals.push({ group, match });
    }
    next.reconstruction!.unmatchedOpenings! +=
      openingGroups.length - proposals.length;
    const labels = entities.filter(
      (e): e is Extract<CadEntity, { kind: "text" }> => e.kind === "text",
    );
    const floorSurfaces = detectFloorSurfaces(
      [...plan.raw, ...plan.structural, ...proposals.map((p) => p.match.wall)],
      [
        ...columns.map((c) => c.corners),
        ...openingGroups
          .filter((g) => {
            const box = orientedBox(g.points, 0);
            return Math.max(box.width, box.depth) < 4.5;
          })
          .map((g) => convexHull(g.points)),
      ],
      labels.map((e) => ({
        point: [e.x * units, e.y * units],
        name: e.value,
        void: /VACIO|POZO|SHAFT|DUCTO|ASCENSOR/.test(normalize(e.value)),
        room: /DORMITORIO|RECAMARA|SALA|COCINA|COMEDOR|BA[ÑN]O|PASILLO|PALIER|LOCAL|LAVANDER|ESTACIONAMIENTO|CIRCULACION|DEPOSITO|AUDITORIO|OFICINA|ALMACEN|BEDROOM|LIVING|DINING|KITCHEN|BATHROOM|OFFICE/.test(
          normalize(e.value),
        ),
      })),
    );
    const flights = stairFlights(
      entities.filter((e) => roleOf(e) === "stair"),
      units,
    );
    const roofContours = floorFaces(
      linesOf(
        entities.filter((e) => roleOf(e) === "roof"),
        units,
      ),
    );
    const installations = (["electrical", "plumbing"] as const)
      .flatMap((role) =>
        symbols(
          entities.filter((e) => roleOf(e) === role),
          role,
          units,
        ),
      )
      .filter((g) => {
        const b = orientedBox(g.points, 0);
        return Math.max(b.width, b.depth) < 2;
      });
    const details = linesOf(
      entities.filter((e) => roleOf(e) === "furniture"),
      units,
    ).flatMap((l) => [...toPlan(l.a), ...toPlan(l.b)]);
    const furniture = symbols(
      entities.filter((e) => roleOf(e) === "furniture"),
      "furniture",
      units,
    );
    const seating = labels.some((e) =>
      /AUDITORIO|AUDITORIUM|BUTACAS/.test(normalize(e.value)),
    );
    const fixtures = furniture.flatMap((group) => {
      const name = group.entities.find((e) => e.blockName)?.blockName ?? "";
      let kind = fixtureKind(name);
      const edges = linesOf(group.entities, units).sort(
        (a, b) => distance(b.a, b.b) - distance(a.a, a.b),
      );
      const angle = edges[0]
        ? Math.atan2(
            edges[0].b[1] - edges[0].a[1],
            edges[0].b[0] - edges[0].a[0],
          )
        : 0;
      const box = orientedBox(group.points, angle);
      let evidence: "block" | "repeated-symbol" = "block";
      if (
        !kind &&
        seating &&
        furniture.length > 20 &&
        group.entities.length >= 4 &&
        Math.min(box.width, box.depth) >= 0.3 &&
        Math.max(box.width, box.depth) <= 0.95
      ) {
        kind = "chair";
        evidence = "repeated-symbol";
      }
      if (
        !kind ||
        Math.min(box.width, box.depth) < 0.15 ||
        Math.max(box.width, box.depth) > 8
      ) {
        next.reconstruction!.unresolvedSymbols!++;
        return [];
      }
      const heights: Record<FixtureKind, number> = {
        chair: 0.85,
        table: 0.75,
        bed: 0.55,
        sofa: 0.8,
        toilet: 0.7,
        sink: 0.85,
        cabinet: 0.9,
        equipment: 1.2,
        plant: 1.5,
        vehicle: 1.5,
        bench: 0.45,
        bathtub: 0.6,
        fireplace: 1.2,
        chimney: 2.8,
      };
      return [
        {
          ...box,
          angle,
          kind,
          name: name || "Butaca · propuesta por repetición",
          evidence,
          height: heights[kind],
          sourceIds: group.entities.map((e) => e.id).slice(0, 500),
        },
      ];
    });
    for (let floor = 0; floor < region.repeat; floor++) {
      const levelId = `${region.id}-${floor}`,
        entry = levels.findIndex((l) => l.plan === plan && l.floor === floor),
        elevation = levels[entry].elevation;
      const upper = levels[entry + 1];
      const measuredHeight =
        upper &&
        upper.elevation > elevation &&
        region.elevationSource &&
        upper.plan.region.elevationSource;
      const storeyRise =
        upper && upper.elevation > elevation
          ? upper.elevation - elevation
          : defaultHeight;
      const height = region.wallHeight ?? storeyRise;
      const heightSource =
        region.wallHeight !== undefined
          ? "manual"
          : measuredHeight
            ? "levels"
            : "assumed";
      const terrace = /TERRAZA|AZOTEA/.test(normalize(region.name));
      const floorNumber = Number(region.name.match(/\d+/)?.[0]);
      next.levels.push({
        id: levelId,
        name:
          region.repeat > 1 && floorNumber
            ? `Planta ${floorNumber + floor}`
            : region.name,
        elevation,
        height,
        heightSource,
      });
      const wallIds = new Map<PlanLine, string>(
        walls.map((w, i) => [w, `wall-${levelId}-${i}`]),
      );
      for (const wall of walls) {
        let wallHeight = terrace ? 1.2 : height;
        const notes = labels
          .flatMap((e) => {
            const text = normalize(e.value),
              match = text.match(
                /(?:PARAPETO|ROMPE\s?VISTA).*?(?:H\s*=\s*)?(\d+[.,]\d+)\s*M/,
              );
            return match
              ? [
                  {
                    point: [e.x * units, e.y * units] as Point2,
                    height: Number(match[1].replace(",", ".")),
                    id: e.id,
                  },
                ]
              : [];
          })
          .filter(
            (note) =>
              lineDistance(note.point, wall) < 2.5 &&
              project(note.point, wall) > -0.2 &&
              project(note.point, wall) < distance(wall.a, wall.b) + 0.2,
          )
          .sort(
            (a, b) => lineDistance(a.point, wall) - lineDistance(b.point, wall),
          );
        if (notes[0]) wallHeight = notes[0].height;
        next.walls.push({
          id: wallIds.get(wall)!,
          levelId,
          start: toPlan(wall.a),
          end: toPlan(wall.b),
          thickness: wall.thickness * PX,
          height: wallHeight,
        });
        record(
          wallIds.get(wall)!,
          [
            ...(wall.sourceIds ?? [wall.source]),
            ...(notes[0] ? [notes[0].id] : []),
          ],
          plan.neural
            ? "neural-mask"
            : wall.paired
              ? "paired-faces"
              : "cad-symbol",
          [
            ...(!wall.paired ? ["thickness"] : []),
            ...(!notes[0] && (terrace || heightSource !== "manual")
              ? ["height"]
              : []),
            "material",
          ],
        );
        if (wall.paired) next.reconstruction!.pairedWalls++;
      }
      const hosts = new Map(
        next.walls.filter((w) => w.levelId === levelId).map((w) => [w.id, w]),
      );
      for (const { group, match } of proposals) {
        const host = hosts.get(wallIds.get(match.wall)!);
        if (!host || host.height < 0.5) {
          next.reconstruction!.unmatchedOpenings!++;
          continue;
        }
        const availableHeight = host.height - 0.05;
        const sill =
          group.role === "door" ? 0 : Math.min(0.9, availableHeight / 2);
        const [x, y] = toPlan(match.center),
          u = direction(match.wall);
        const opening: Opening = {
          id: `${group.role}-${levelId}-${group.entities[0].id}`,
          levelId,
          wallId: wallIds.get(match.wall)!,
          x,
          y,
          width: match.width * PX,
          rotation: (-Math.atan2(u[1], u[0]) * 180) / Math.PI,
          height: Math.min(
            group.role === "door" ? 2.1 : 1.2,
            availableHeight - sill,
          ),
          sillHeight: sill,
        };
        (group.role === "door" ? next.doors : next.windows).push(opening);
        record(
          opening.id,
          group.entities.map((e) => e.id),
          "cad-symbol",
          [
            "height",
            ...(group.role === "window" ? ["sillHeight"] : []),
            "type",
            "material",
          ],
        );
      }
      // Only explicitly reviewed neural objects reach the model. Heights are never predicted from a plan mask.
      for (const item of plan.neural?.openings ?? []) {
        if (
          !item.approved ||
          item.hostStatus !== "hosted" ||
          !item.center ||
          !item.widthM ||
          !item.heightM
        )
          continue;
        const wall = walls.find((w) => w.neuralIndex === item.hostWallIndex);
        const wallId = wall && wallIds.get(wall),
          host = wallId && hosts.get(wallId);
        const sill = item.kind === "door" ? 0 : item.sillM;
        if (
          !wall ||
          !host ||
          sill === undefined ||
          item.heightM + sill > host.height - 0.01
        ) {
          next.reconstruction!.unmatchedOpenings!++;
          continue;
        }
        const center: Point2 = [item.center[0] * units, item.center[1] * units];
        const position = project(center, wall),
          length = distance(wall.a, wall.b);
        if (
          position - item.widthM / 2 < -0.02 ||
          position + item.widthM / 2 > length + 0.02 ||
          lineDistance(center, wall) > 0.05
        ) {
          next.reconstruction!.unmatchedOpenings!++;
          continue;
        }
        const [x, y] = toPlan(center),
          widthM = item.widthM;
        const duplicate = [...next.doors, ...next.windows].some(
          (o) =>
            o.levelId === levelId &&
            o.wallId === wallId &&
            Math.hypot(o.x - x, o.y - y) < (o.width + widthM * PX) / 2,
        );
        if (duplicate) continue; // Measured CAD joinery takes precedence over a duplicate mask proposal.
        const u = direction(wall),
          id = `neural-${item.kind}-${levelId}-${item.id}`;
        (item.kind === "door" ? next.doors : next.windows).push({
          id,
          levelId,
          wallId: host.id,
          x,
          y,
          width: item.widthM * PX,
          height: item.heightM,
          sillHeight: sill,
          rotation: (-Math.atan2(u[1], u[0]) * 180) / Math.PI,
        });
        record(id, [], "neural-mask", ["type", "material"]);
      }
      for (const [i, surface] of floorSurfaces.surfaces.entries()) {
        const stairHoles = flights
          .filter(
            (f) =>
              f.corners.every((p) => contains(p, surface.polygon)) &&
              !surface.holes.some(
                (h) =>
                  f.corners.some((p) => contains(p, h)) ||
                  h.some((p) => contains(p, f.corners)),
              ),
          )
          .map((f) => f.corners);
        next.slabs!.push({
          id: `slab-${levelId}-${i}`,
          levelId,
          name: "Losa del nivel",
          polygon: surface.polygon.map(toPlan),
          holes: [...surface.holes, ...stairHoles].map((h) => h.map(toPlan)),
          thickness: 0.18,
        });
        record(
          `slab-${levelId}-${i}`,
          plan.raw.flatMap((l) => l.sourceIds ?? [l.source]),
          "closed-contour",
          ["thickness", "material"],
        );
      }
      for (const [i, room] of floorSurfaces.rooms.entries()) {
        const points = room.polygon.map(toPlan),
          xs = points.map((p) => p[0]),
          ys = points.map((p) => p[1]);
        next.rooms.push({
          id: `space-${levelId}-${i}`,
          levelId,
          name: room.name,
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
          area: room.area,
        });
        next.reconstruction!.namedSpaces++;
      }
      for (const [i, box] of columns.entries()) {
        const [x, y] = toPlan(box.center);
        next.columns.push({
          id: `column-${levelId}-${i}`,
          levelId,
          x,
          y,
          size: box.width * PX,
          depth: box.depth * PX,
          rotation: (-box.angle * 180) / Math.PI,
          height: storeyRise,
        });
        record(
          `column-${levelId}-${i}`,
          entities.filter((e) => roleOf(e) === "column").map((e) => e.id),
          "closed-contour",
          ["height", "material"],
        );
      }
      for (const [i, polygon] of roofContours.entries()) {
        const points = polygon.map(toPlan),
          b = orientedBox(points, 0);
        next.roofs!.push({
          id: `roof-${levelId}-${i}`,
          levelId,
          name: "Cubierta CAD",
          x: b.center[0] - b.width / 2,
          y: b.center[1] - b.depth / 2,
          width: b.width,
          depth: b.depth,
          polygon: points,
          thickness: 0.16,
          elevation: height,
        });
        record(
          `roof-${levelId}-${i}`,
          entities.filter((e) => roleOf(e) === "roof").map((e) => e.id),
          "closed-contour",
          ["thickness", "elevation", "slope", "material"],
        );
      }
      for (const [i, group] of installations.entries()) {
        const [x, y] = toPlan(orientedBox(group.points, 0).center);
        next.services!.push({
          id: `service-${levelId}-${i}`,
          levelId,
          x,
          y,
          name:
            group.role === "electrical"
              ? "Símbolo eléctrico por revisar"
              : "Símbolo sanitario por revisar",
          kind: group.role === "electrical" ? "outlet" : "water",
        });
      }
      flights.forEach((flight, i) => {
        const partner = flights.findIndex(
          (other, j) =>
            j !== i &&
            distance(other.center, flight.center) < 3.8 &&
            Math.abs(Math.sin(other.angle - flight.angle)) < 0.15,
        );
        const paired = partner !== -1,
          second = paired && i > partner,
          [x, y] = toPlan(flight.center);
        next.stairs!.push({
          id: `stair-${levelId}-${i}`,
          levelId,
          x,
          y,
          radius: (flight.width * PX) / 2,
          type: "straight",
          length: flight.length * PX,
          rotation:
            (-(Math.PI / 2 + flight.angle + (second ? Math.PI : 0)) * 180) /
            Math.PI,
          rise: paired ? storeyRise / 2 : storeyRise,
          baseElevation: second ? storeyRise / 2 : 0,
          stepCount: flight.steps,
        });
        record(
          `stair-${levelId}-${i}`,
          entities.filter((e) => roleOf(e) === "stair").map((e) => e.id),
          "treads",
          [...(!measuredHeight ? ["rise"] : []), "type", "material"],
        );
      });
      for (const [i, item] of fixtures.entries()) {
        const [x, y] = toPlan(item.center);
        next.fixtures!.push({
          id: `fixture-${levelId}-${i}`,
          levelId,
          x,
          y,
          width: item.width * PX,
          depth: item.depth * PX,
          height: item.height,
          rotation: (-item.angle * 180) / Math.PI,
          kind: item.kind,
          name: item.name,
          evidence: item.evidence,
          sourceIds: item.sourceIds,
        });
        next.reconstruction!.fixtureCount!++;
        record(`fixture-${levelId}-${i}`, item.sourceIds, "cad-symbol", [
          "height",
          "type",
          "material",
        ]);
      }
      for (const item of plan.neural?.fixtures ?? []) {
        if (
          !item.approved ||
          !item.heightM ||
          ![
            "cabinet",
            "equipment",
            "toilet",
            "sink",
            "bench",
            "fireplace",
            "bathtub",
            "chimney",
          ].includes(item.kind)
        )
          continue;
        const points = item.polygon.map(
          ([x, y]) => [x * units, y * units] as Point2,
        );
        const edges = points.map((a, i) => ({
          a,
          b: points[(i + 1) % points.length],
          thickness: 0,
          source: item.id,
        }));
        const edge = edges.sort(
          (a, b) => distance(b.a, b.b) - distance(a.a, a.b),
        )[0];
        const angle = Math.atan2(edge.b[1] - edge.a[1], edge.b[0] - edge.a[0]),
          box = orientedBox(points, angle);
        if (
          Math.min(box.width, box.depth) < 0.1 ||
          Math.max(box.width, box.depth) > 8
        )
          continue;
        const [x, y] = toPlan(box.center),
          kind = item.kind as FixtureKind;
        if (
          next.fixtures!.some(
            (f) =>
              f.levelId === levelId &&
              f.kind === kind &&
              Math.hypot(f.x - x, f.y - y) <
                Math.min(f.width, f.depth, box.width * PX, box.depth * PX) *
                  0.5,
          )
        )
          continue;
        const id = `neural-fixture-${levelId}-${item.id}`;
        next.fixtures!.push({
          id,
          levelId,
          x,
          y,
          width: box.width * PX,
          depth: box.depth * PX,
          height: item.heightM,
          rotation: (-angle * 180) / Math.PI,
          kind,
          name: kind,
          evidence: "neural-mask",
          sourceIds: [],
        });
        next.reconstruction!.fixtureCount!++;
        record(id, [], "neural-mask", ["type", "material"]);
      }
      next.floorDetails!.push({ levelId, segments: details });
    }
  }
  next.levels.sort((a, b) => a.elevation - b.elevation);
  // Reference pages survive CAD rebuilding, including their source-level identity.
  for (const sheet of next.sheets ?? []) {
    if (!next.levels.some((l) => l.id === sheet.levelId)) {
      const level = base.levels.find((l) => l.id === sheet.levelId);
      if (level) next.levels.push(level);
    }
    next.width = Math.max(next.width, sheet.x + sheet.width);
    next.height = Math.max(next.height, sheet.y + sheet.height);
  }
  return next;
}
