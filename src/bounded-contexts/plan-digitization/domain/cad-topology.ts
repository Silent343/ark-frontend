/** Metric geometry used by CAD reconstruction. Tolerances are metres, independent of drawing units. */
export type Point2 = [number, number];
export interface PlanLine {
  a: Point2;
  b: Point2;
  thickness: number;
  source: string;
  sourceIds?: string[];
  paired?: boolean;
}
export const distance = (a: Point2, b: Point2) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
export const dot = (a: Point2, b: Point2) => a[0] * b[0] + a[1] * b[1];
export const sub = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
export const plus = (a: Point2, u: Point2, t: number): Point2 => [
  a[0] + u[0] * t,
  a[1] + u[1] * t,
];
export function direction(line: PlanLine): Point2 {
  const d = sub(line.b, line.a),
    n = Math.hypot(...d);
  return [d[0] / n, d[1] / n];
}
export function project(point: Point2, line: PlanLine) {
  return dot(sub(point, line.a), direction(line));
}
export function lineDistance(point: Point2, line: PlanLine) {
  const u = direction(line),
    d = sub(point, line.a);
  return Math.abs(d[0] * u[1] - d[1] * u[0]);
}
export function signedArea(p: Point2[]) {
  return (
    p.reduce((sum, a, i) => {
      const b = p[(i + 1) % p.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0) / 2
  );
}
export function contains(p: Point2, polygon: Point2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

/** Collinear duplicate ink and fragmented lines describe one physical edge. */
export function mergeLines(
  input: PlanLine[],
  gap = 0.025,
  offset = 0.006,
): PlanLine[] {
  const lines = input
    .filter((l) => distance(l.a, l.b) > 0.04)
    .map((l) => ({ ...l, a: [...l.a] as Point2, b: [...l.b] as Point2 }));
  const result: PlanLine[] = [];
  for (const current of lines.sort(
    (a, b) => distance(b.a, b.b) - distance(a.a, a.b),
  )) {
    let merged = false;
    for (const line of result) {
      if (
        Math.abs(dot(direction(line), direction(current))) < 0.99995 ||
        lineDistance(current.a, line) > offset ||
        Math.abs(line.thickness - current.thickness) > 0.035
      )
        continue;
      const u = direction(line),
        length = distance(line.a, line.b),
        p = [project(current.a, line), project(current.b, line)].sort(
          (a, b) => a - b,
        );
      if (p[1] < -gap || p[0] > length + gap) continue;
      line.b = plus(line.a, u, Math.max(length, p[1]));
      line.a = plus(line.a, u, Math.min(0, p[0]));
      line.sourceIds = [
        ...new Set([
          ...(line.sourceIds ?? [line.source]),
          ...(current.sourceIds ?? [current.source]),
        ]),
      ].slice(0, 500);
      merged = true;
      break;
    }
    if (!merged) result.push(current);
  }
  return result;
}

function subtractIntervals(
  start: number,
  end: number,
  used: Array<[number, number]>,
): Array<[number, number]> {
  let parts: Array<[number, number]> = [[start, end]];
  for (const [a, b] of used)
    parts = parts.flatMap(([x, y]) =>
      b <= x || a >= y
        ? [[x, y] as [number, number]]
        : ([
            [x, Math.min(y, a)],
            [Math.max(x, b), y],
          ].filter(([p, q]) => q - p > 0.01) as Array<[number, number]>),
    );
  return parts;
}

/** Pair parallel faces into a wall centreline with measured thickness, consuming each face once. */
export function reconstructWalls(input: PlanLine[]): PlanLine[] {
  const lines = mergeLines(input);
  const candidates: Array<{
    i: number;
    j: number;
    start: number;
    end: number;
    thickness: number;
  }> = [];
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i],
        b = lines[j],
        thickness = lineDistance(b.a, a);
      if (
        thickness < 0.075 ||
        thickness > 0.45 ||
        Math.abs(dot(direction(a), direction(b))) < 0.9997
      )
        continue;
      const p = [project(b.a, a), project(b.b, a)].sort((x, y) => x - y);
      const start = Math.max(0, p[0]),
        end = Math.min(distance(a.a, a.b), p[1]);
      if (end - start > Math.max(0.23, thickness * 1.4))
        candidates.push({ i, j, start, end, thickness });
    }
  candidates.sort(
    (a, b) => (b.end - b.start) / b.thickness - (a.end - a.start) / a.thickness,
  );
  const used = lines.map(() => [] as Array<[number, number]>),
    walls: PlanLine[] = [];
  for (const c of candidates) {
    const a = lines[c.i],
      b = lines[c.j],
      u = direction(a),
      v = direction(b);
    const bInA = used[c.j].map(
      ([x, y]) =>
        [project(plus(b.a, v, x), a), project(plus(b.a, v, y), a)].sort(
          (p, q) => p - q,
        ) as [number, number],
    );
    const parts = subtractIntervals(c.start, c.end, [...used[c.i], ...bInA]);
    const normal: Point2 = [-u[1], u[0]],
      shift = dot(sub(b.a, a.a), normal) / 2;
    for (const [start, end] of parts) {
      if (end - start < 0.18) continue;
      const p = plus(a.a, u, start),
        q = plus(a.a, u, end);
      walls.push({
        a: plus(p, normal, shift),
        b: plus(q, normal, shift),
        thickness: c.thickness,
        source: a.source,
        sourceIds: [
          ...new Set([
            ...(a.sourceIds ?? [a.source]),
            ...(b.sourceIds ?? [b.source]),
          ]),
        ].slice(0, 500),
        paired: true,
      });
      used[c.i].push([start, end]);
      used[c.j].push(
        [project(p, b), project(q, b)].sort((x, y) => x - y) as [
          number,
          number,
        ],
      );
    }
  }
  // Long isolated centreline walls remain possible; short jamb caps are already represented by wall thickness.
  lines.forEach((line, i) => {
    for (const [start, end] of subtractIntervals(
      0,
      distance(line.a, line.b),
      used[i],
    )) {
      if (end - start < 0.45) continue;
      const u = direction(line),
        a = plus(line.a, u, start),
        b = plus(line.a, u, end);
      if (
        walls.some(
          (w) =>
            Math.abs(dot(direction(w), u)) > 0.999 &&
            lineDistance(a, w) < w.thickness * 0.6 &&
            project(a, w) >= -0.12 &&
            project(b, w) <= distance(w.a, w.b) + 0.12,
        )
      )
        continue;
      walls.push({ ...line, a, b, thickness: 0.12, paired: false });
    }
  });
  return joinCorners(mergeLines(walls, 0.07, 0.018));
}

function intersection(
  a: PlanLine,
  b: PlanLine,
): { p: Point2; t: number; u: number } | null {
  const r = sub(a.b, a.a),
    s = sub(b.b, b.a),
    q = sub(b.a, a.a),
    cross = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(cross) < 1e-8) return null;
  const t = (q[0] * s[1] - q[1] * s[0]) / cross,
    u = (q[0] * r[1] - q[1] * r[0]) / cross;
  return { p: plus(a.a, r, t), t, u };
}

/** Centreline endpoints meet at the shared corner instead of leaving doubled skins and cracks. */
export function joinCorners(input: PlanLine[]): PlanLine[] {
  const result = input.map((l) => ({
    ...l,
    a: [...l.a] as Point2,
    b: [...l.b] as Point2,
  }));
  for (let i = 0; i < result.length; i++)
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i],
        b = result[j],
        hit = intersection(a, b);
      if (!hit) continue;
      const la = distance(a.a, a.b),
        lb = distance(b.a, b.b),
        tolerance = Math.min(0.32, Math.max(a.thickness, b.thickness) + 0.08);
      if (la < 0.06 || lb < 0.06) continue;
      if (
        hit.t < -tolerance / la ||
        hit.t > 1 + tolerance / la ||
        hit.u < -tolerance / lb ||
        hit.u > 1 + tolerance / lb
      )
        continue;
      if (Math.abs(hit.t) * la < tolerance) a.a = hit.p;
      else if (Math.abs(1 - hit.t) * la < tolerance) a.b = hit.p;
      if (Math.abs(hit.u) * lb < tolerance) b.a = hit.p;
      else if (Math.abs(1 - hit.u) * lb < tolerance) b.b = hit.p;
    }
  return result.filter((l) => distance(l.a, l.b) > 0.06);
}

/** Recover bounded faces of the wall graph. The outside face is never used as a rectangular slab. */
export function floorFaces(lines: PlanLine[], minArea = 0.65): Point2[][] {
  const splits = lines.map(() => [0, 1]);
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const hit = intersection(lines[i], lines[j]);
      if (
        hit &&
        hit.t >= -0.001 &&
        hit.t <= 1.001 &&
        hit.u >= -0.001 &&
        hit.u <= 1.001
      ) {
        splits[i].push(Math.max(0, Math.min(1, hit.t)));
        splits[j].push(Math.max(0, Math.min(1, hit.u)));
      }
    }
  const points: Point2[] = [],
    ids = new Map<string, number>(),
    neighbors = new Map<number, Set<number>>();
  const node = (p: Point2) => {
    const key = `${Math.round(p[0] / 0.025)},${Math.round(p[1] / 0.025)}`;
    if (!ids.has(key)) {
      ids.set(key, points.length);
      points.push(p);
    }
    return ids.get(key)!;
  };
  lines.forEach((line, i) => {
    const ts = [...new Set(splits[i])].sort((a, b) => a - b),
      d = sub(line.b, line.a);
    for (let j = 0; j + 1 < ts.length; j++) {
      const a = node(plus(line.a, d, ts[j])),
        b = node(plus(line.a, d, ts[j + 1]));
      if (a === b) continue;
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
  });
  const ordered = new Map(
    [...neighbors].map(([id, set]) => [
      id,
      [...set].sort(
        (a, b) =>
          Math.atan2(
            points[a][1] - points[id][1],
            points[a][0] - points[id][0],
          ) -
          Math.atan2(
            points[b][1] - points[id][1],
            points[b][0] - points[id][0],
          ),
      ),
    ]),
  );
  const visited = new Set<string>(),
    faces: Point2[][] = [];
  for (const [start, edges] of ordered)
    for (const end of edges) {
      if (visited.has(`${start}:${end}`)) continue;
      let a = start,
        b = end;
      const face: Point2[] = [];
      let closed = false;
      for (let step = 0; step < points.length * 3; step++) {
        const key = `${a}:${b}`;
        if (visited.has(key)) {
          closed = a === start && b === end;
          break;
        }
        visited.add(key);
        face.push(points[a]);
        const next = ordered.get(b)!;
        const at = next.indexOf(a);
        a = b;
        b = next[(at - 1 + next.length) % next.length];
      }
      if (closed && face.length >= 3 && signedArea(face) > minArea)
        faces.push(face);
    }
  return faces;
}

/** Match repeated wall features across sheets; their paper-space bounding-box centres need not coincide. */
export function registerPlan(
  lines: PlanLine[],
  reference: PlanLine[],
  initial: Point2,
): { offset: Point2; matched: number } {
  const candidates = new Map<string, { offset: Point2; votes: number }>();
  for (const a of lines.filter((l) => distance(l.a, l.b) > 0.6))
    for (const b of reference) {
      if (
        Math.abs(distance(a.a, a.b) - distance(b.a, b.b)) > 0.025 ||
        Math.abs(dot(direction(a), direction(b))) < 0.9998
      )
        continue;
      const offset: Point2 = [
        (b.a[0] + b.b[0] - a.a[0] - a.b[0]) / 2,
        (b.a[1] + b.b[1] - a.a[1] - a.b[1]) / 2,
      ];
      if (distance(offset, initial) > 12) continue;
      const key = `${Math.round(offset[0] / 0.06)},${Math.round(offset[1] / 0.06)}`;
      const item = candidates.get(key);
      if (item) item.votes += distance(a.a, a.b);
      else candidates.set(key, { offset, votes: distance(a.a, a.b) });
    }
  const best = [...candidates.values()].sort((a, b) => b.votes - a.votes)[0];
  return best && best.votes > 5
    ? { offset: best.offset, matched: best.votes }
    : { offset: initial, matched: 0 };
}

/** Oriented footprint follows the dominant straight strokes rather than the sheet axes. */
export function orientedBox(points: Point2[], angle: number) {
  const u: Point2 = [Math.cos(angle), Math.sin(angle)],
    v: Point2 = [-u[1], u[0]];
  const xs = points.map((p) => dot(p, u)),
    ys = points.map((p) => dot(p, v));
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return {
    center: plus(plus([0, 0], u, (minX + maxX) / 2), v, (minY + maxY) / 2),
    width: maxX - minX,
    depth: maxY - minY,
    corners: [
      plus(plus([0, 0], u, minX), v, minY),
      plus(plus([0, 0], u, maxX), v, minY),
      plus(plus([0, 0], u, maxX), v, maxY),
      plus(plus([0, 0], u, minX), v, maxY),
    ] as Point2[],
  };
}
