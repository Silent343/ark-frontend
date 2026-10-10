import {
  contains,
  distance,
  signedArea,
  type PlanLine,
  type Point2,
} from "./cad-topology";

type Label = { point: Point2; name: string; void: boolean; room: boolean };
export interface DetectedFloor {
  polygon: Point2[];
  holes: Point2[][];
}

/** Convex symbols seal door swings for room connectivity only; their boxes never become 3D furniture. */
export function convexHull(points: Point2[]): Point2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Point2, b: Point2, c: Point2) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (items: Point2[]) => {
    const out: Point2[] = [];
    for (const p of items) {
      while (out.length > 1 && cross(out.at(-2)!, out.at(-1)!, p) <= 0)
        out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

function simplify(points: Point2[], tolerance: number): Point2[] {
  if (points.length <= 3) return points;
  const start = points[0],
    end = points.at(-1)!,
    dx = end[0] - start[0],
    dy = end[1] - start[1],
    d2 = dx * dx + dy * dy;
  let index = 0,
    maximum = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    const t = d2
      ? Math.max(
          0,
          Math.min(
            1,
            ((points[i][0] - start[0]) * dx + (points[i][1] - start[1]) * dy) /
              d2,
          ),
        )
      : 0;
    const d = distance(points[i], [start[0] + t * dx, start[1] + t * dy]);
    if (d > maximum) {
      index = i;
      maximum = d;
    }
  }
  return maximum > tolerance
    ? [
        ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(index), tolerance),
      ]
    : [start, end];
}

/** Raster connectivity tolerates small drafting gaps; contours return to metric polygons with explicit voids. */
export function detectFloorSurfaces(
  lines: PlanLine[],
  blockers: Point2[][],
  labels: Label[],
) {
  if (!lines.length)
    return {
      surfaces: [] as DetectedFloor[],
      rooms: [] as Array<{ name: string; polygon: Point2[]; area: number }>,
    };
  const points = lines.flatMap((l) => [l.a, l.b]);
  const minX = Math.min(...points.map((p) => p[0])) - 1,
    minY = Math.min(...points.map((p) => p[1])) - 1;
  const maxX = Math.max(...points.map((p) => p[0])) + 1,
    maxY = Math.max(...points.map((p) => p[1])) + 1;
  const cell = Math.max(0.045, Math.max(maxX - minX, maxY - minY) / 900),
    width = Math.ceil((maxX - minX) / cell) + 1,
    height = Math.ceil((maxY - minY) / cell) + 1,
    size = width * height;
  const ink = new Uint8Array(size),
    component = new Int32Array(size),
    queue = new Int32Array(size);
  const ix = (x: number) =>
    Math.max(0, Math.min(width - 1, Math.floor((x - minX) / cell)));
  const iy = (y: number) =>
    Math.max(0, Math.min(height - 1, Math.floor((y - minY) / cell)));
  for (const l of lines) {
    const dx = l.b[0] - l.a[0],
      dy = l.b[1] - l.a[1],
      length2 = dx * dx + dy * dy,
      radius = Math.max(0.09, l.thickness / 2 + 0.04);
    for (
      let y = iy(Math.min(l.a[1], l.b[1]) - radius);
      y <= iy(Math.max(l.a[1], l.b[1]) + radius);
      y++
    )
      for (
        let x = ix(Math.min(l.a[0], l.b[0]) - radius);
        x <= ix(Math.max(l.a[0], l.b[0]) + radius);
        x++
      ) {
        const px = minX + (x + 0.5) * cell,
          py = minY + (y + 0.5) * cell,
          t = Math.max(
            0,
            Math.min(
              1,
              ((px - l.a[0]) * dx + (py - l.a[1]) * dy) / (length2 || 1),
            ),
          );
        if (Math.hypot(px - l.a[0] - t * dx, py - l.a[1] - t * dy) <= radius)
          ink[y * width + x] = 1;
      }
  }
  for (const polygon of blockers) {
    if (polygon.length < 3) continue;
    const xs = polygon.map((p) => p[0]),
      ys = polygon.map((p) => p[1]);
    for (let y = iy(Math.min(...ys)); y <= iy(Math.max(...ys)); y++)
      for (let x = ix(Math.min(...xs)); x <= ix(Math.max(...xs)); x++)
        if (
          contains([minX + (x + 0.5) * cell, minY + (y + 0.5) * cell], polygon)
        )
          ink[y * width + x] = 1;
  }
  const sizes = [0],
    componentBounds: Array<[number, number, number, number]> = [[0, 0, 0, 0]];
  let id = 0;
  for (let seed = 0; seed < size; seed++) {
    if (ink[seed] || component[seed]) continue;
    id++;
    let head = 0,
      tail = 1;
    queue[0] = seed;
    component[seed] = id;
    let left = width,
      right = 0,
      bottom = height,
      top = 0;
    while (head < tail) {
      const at = queue[head++],
        x = at % width,
        y = Math.floor(at / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y);
      for (const next of [
        x > 0 ? at - 1 : -1,
        x + 1 < width ? at + 1 : -1,
        y > 0 ? at - width : -1,
        y + 1 < height ? at + width : -1,
      ])
        if (next >= 0 && !ink[next] && !component[next]) {
          component[next] = id;
          queue[tail++] = next;
        }
    }
    sizes[id] = tail;
    componentBounds[id] = [left, bottom, right, top];
  }
  const names = new Map<number, Label[]>();
  for (const label of labels) {
    const x = ix(label.point[0]),
      y = iy(label.point[1]);
    let found = component[y * width + x];
    if (!found)
      for (let r = 1; r <= 4 && !found; r++)
        for (const [dx, dy] of [
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
        ])
          if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
            const n = component[(y + dy) * width + x + dx];
            if (n > 1) found = n;
          }
    if (!names.has(found)) names.set(found, []);
    names.get(found)!.push(label);
  }
  const valid = new Set<number>(),
    rooms: Array<{ name: string; polygon: Point2[]; area: number }> = [];
  for (let c = 2; c <= id; c++) {
    const area = sizes[c] * cell * cell,
      entries = names.get(c) ?? [];
    if (area < 0.65 || entries.some((e) => e.void)) continue;
    valid.add(c);
    const room = entries.find((e) => e.room);
    if (room) {
      const [x, y, right, top] = componentBounds[c];
      rooms.push({
        name: room.name,
        polygon: [
          [minX + x * cell, minY + y * cell],
          [minX + (right + 1) * cell, minY + y * cell],
          [minX + (right + 1) * cell, minY + (top + 1) * cell],
          [minX + x * cell, minY + (top + 1) * cell],
        ],
        area,
      });
    }
  }
  const mask = new Uint8Array(size);
  for (let at = 0; at < size; at++) if (valid.has(component[at])) mask[at] = 1;
  // Include the material directly under room boundaries, while preserving free cells in shafts and patios.
  const reach = Math.ceil(0.2 / cell);
  for (let at = 0; at < size; at++)
    if (ink[at]) {
      const x = at % width,
        y = Math.floor(at / width);
      outer: for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (
            nx >= 0 &&
            nx < width &&
            ny >= 0 &&
            ny < height &&
            valid.has(component[ny * width + nx])
          ) {
            mask[at] = 1;
            break outer;
          }
        }
    }
  const stride = width + 1,
    edges = new Map<number, number[]>();
  const edge = (a: number, b: number) => {
    if (!edges.has(a)) edges.set(a, []);
    edges.get(a)!.push(b);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y * width + x]) {
        const a = y * stride + x;
        if (!y || !mask[(y - 1) * width + x]) edge(a, a + 1);
        if (x + 1 === width || !mask[y * width + x + 1])
          edge(a + 1, a + stride + 1);
        if (y + 1 === height || !mask[(y + 1) * width + x])
          edge(a + stride + 1, a + stride);
        if (!x || !mask[y * width + x - 1]) edge(a + stride, a);
      }
  const loops: Point2[][] = [];
  for (const [start, next] of edges)
    while (next.length) {
      const loop: Point2[] = [];
      let at = start;
      for (let step = 0; step <= size; step++) {
        loop.push([
          minX + (at % stride) * cell,
          minY + Math.floor(at / stride) * cell,
        ]);
        const to = edges.get(at)?.pop();
        if (to === undefined) break;
        at = to;
        if (at === start) break;
      }
      if (loop.length > 3 && Math.abs(signedArea(loop)) > 0.5) {
        const half = Math.floor(loop.length / 2);
        loops.push([
          ...simplify(loop.slice(0, half + 1), cell * 1.4).slice(0, -1),
          ...simplify([...loop.slice(half), loop[0]], cell * 1.4).slice(0, -1),
        ]);
      }
    }
  const surfaces = loops
    .filter((p) => signedArea(p) > 0.5)
    .map((polygon) => ({
      polygon,
      holes: loops.filter(
        (p) => signedArea(p) < -0.5 && contains(p[0], polygon),
      ),
    }));
  return { surfaces, rooms };
}
