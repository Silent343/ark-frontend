import { contains, signedArea } from "../cad-topology";
import type { PlanarTopology, Point2 } from "./types";

export interface GraphSegment {
  start: Point2;
  end: Point2;
  wallId: string;
}
const cross = (a: Point2, b: Point2) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
const pointAt = (s: GraphSegment, t: number): Point2 => [
  s.start[0] + (s.end[0] - s.start[0]) * t,
  s.start[1] + (s.end[1] - s.start[1]) * t,
];

/** DCEL construction, exact intersections plus bounded snap rounding. No speculative gap closure. */
export function buildPlanarGraph(
  input: GraphSegment[],
  snapTolerance = 0.001,
): PlanarTopology {
  if (
    !Number.isFinite(snapTolerance) ||
    snapTolerance <= 0 ||
    snapTolerance > 0.05
  )
    throw new Error("Invalid topology tolerance.");
  for (const s of input)
    if (![...s.start, ...s.end].every(Number.isFinite))
      throw new Error("Non-finite topology input.");
  const lines = extendCornerEndpoints(input.filter(
    (s) => Math.hypot(...sub(s.end, s.start)) > snapTolerance,
  ));
  const splits = lines.map(() => [0, 1]);
  const bounds = lines
    .map((s, i) => ({
      i,
      minX: Math.min(s.start[0], s.end[0]),
      maxX: Math.max(s.start[0], s.end[0]),
      minY: Math.min(s.start[1], s.end[1]),
      maxY: Math.max(s.start[1], s.end[1]),
    }))
    .sort((a, b) => a.minX - b.minX);
  let comparisons = 0;
  for (let a = 0; a < bounds.length; a++) {
    const p = bounds[a];
    for (
      let b = a + 1;
      b < bounds.length && bounds[b].minX <= p.maxX + snapTolerance;
      b++
    ) {
      const q = bounds[b];
      if (q.minY > p.maxY + snapTolerance || q.maxY < p.minY - snapTolerance)
        continue;
      if (++comparisons > 2_000_000)
        throw new Error(
          "Topología demasiado compleja: delimita una planta más pequeña.",
        );
      const x = lines[p.i],
        y = lines[q.i],
        r = sub(x.end, x.start),
        s = sub(y.end, y.start),
        d = sub(y.start, x.start),
        determinant = cross(r, s);
      if (Math.abs(determinant) > 1e-12) {
        const t = cross(d, s) / determinant,
          u = cross(d, r) / determinant;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          splits[p.i].push(t);
          splits[q.i].push(u);
        }
      } else {
        // Split overlapping collinear segments before deduplicating their edges.
        const length2 = r[0] ** 2 + r[1] ** 2;
        if (Math.abs(cross(d, r)) / Math.sqrt(length2) > snapTolerance)
          continue;
        for (const pt of [y.start, y.end]) {
          const v = sub(pt, x.start),
            t = (v[0] * r[0] + v[1] * r[1]) / length2;
          if (t > 0 && t < 1) splits[p.i].push(t);
        }
        const lenY = s[0] ** 2 + s[1] ** 2;
        for (const pt of [x.start, x.end]) {
          const v = sub(pt, y.start),
            t = (v[0] * s[0] + v[1] * s[1]) / lenY;
          if (t > 0 && t < 1) splits[q.i].push(t);
        }
      }
    }
  }
  const graph: PlanarTopology = { nodes: [], halfEdges: [], faces: [] };
  const nodeIds = new Map<string, number>(),
    edges = new Map<string, number>(),
    outgoing = new Map<number, number[]>();
  const node = (pt: Point2) => {
    const x = Math.round(pt[0] / snapTolerance),
      y = Math.round(pt[1] / snapTolerance),
      key = `${x}:${y}`;
    let index = nodeIds.get(key);
    if (index === undefined) {
      index = graph.nodes.length;
      nodeIds.set(key, index);
      graph.nodes.push({
        id: `n${index}`,
        position: [x * snapTolerance, y * snapTolerance],
      });
    }
    return index;
  };
  for (let i = 0; i < lines.length; i++) {
    const ts = [...new Set(splits[i])].sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      const a = node(pointAt(lines[i], ts[j - 1])),
        b = node(pointAt(lines[i], ts[j]));
      if (a === b) continue;
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`,
        existing = edges.get(key);
      if (existing !== undefined) {
        for (const at of [existing, existing + 1])
          if (!graph.halfEdges[at].wallIds.includes(lines[i].wallId))
            graph.halfEdges[at].wallIds.push(lines[i].wallId);
        continue;
      }
      const e = graph.halfEdges.length;
      edges.set(key, e);
      graph.halfEdges.push(
        {
          id: `e${e}`,
          origin: `n${a}`,
          twin: `e${e + 1}`,
          next: "",
          previous: "",
          face: "",
          wallIds: [lines[i].wallId],
        },
        {
          id: `e${e + 1}`,
          origin: `n${b}`,
          twin: `e${e}`,
          next: "",
          previous: "",
          face: "",
          wallIds: [lines[i].wallId],
        },
      );
      outgoing.set(a, [...(outgoing.get(a) ?? []), e]);
      outgoing.set(b, [...(outgoing.get(b) ?? []), e + 1]);
    }
  }
  const indexOf = (id: string) => Number(id.slice(1));
  const destination = (e: number) => indexOf(graph.halfEdges[e ^ 1].origin);
  for (const [origin, list] of outgoing) {
    const p = graph.nodes[origin].position;
    list.sort((a, b) => {
      const x = sub(graph.nodes[destination(a)].position, p),
        y = sub(graph.nodes[destination(b)].position, p);
      return Math.atan2(x[1], x[0]) - Math.atan2(y[1], y[0]);
    });
  }
  for (let e = 0; e < graph.halfEdges.length; e++) {
    const list = outgoing.get(destination(e))!,
      at = list.indexOf(e ^ 1),
      next = list[(at - 1 + list.length) % list.length];
    graph.halfEdges[e].next = `e${next}`;
    graph.halfEdges[next].previous = `e${e}`;
  }
  const visited = new Set<number>(),
    cycles: Array<{ edges: number[]; polygon: Point2[]; area: number }> = [];
  for (let start = 0; start < graph.halfEdges.length; start++) {
    if (visited.has(start)) continue;
    const ring: number[] = [];
    let e = start;
    do {
      if (visited.has(e)) throw new Error("Invalid half-edge cycle.");
      visited.add(e);
      ring.push(e);
      e = indexOf(graph.halfEdges[e].next);
    } while (e !== start);
    const polygon = ring.map(
      (at) => graph.nodes[indexOf(graph.halfEdges[at].origin)].position,
    );
    cycles.push({ edges: ring, polygon, area: signedArea(polygon) });
  }
  const positives = cycles.filter(
    (c) =>
      c.area > snapTolerance ** 2 &&
      new Set(c.edges.map((e) => graph.halfEdges[e].origin)).size ===
        c.edges.length,
  );
  for (const c of positives) {
    const id = `f${graph.faces.length}`;
    graph.faces.push({
      id,
      boundary: `e${c.edges[0]}`,
      innerBoundaries: [],
      polygon: { outer: c.polygon, holes: [] },
      exterior: false,
    });
    c.edges.forEach((e) => (graph.halfEdges[e].face = id));
  }
  for (const c of cycles.filter((c) => !positives.includes(c))) {
    const parent =
      c.area < 0
        ? graph.faces
            .filter(
              (f) =>
                !f.exterior &&
                signedArea(f.polygon.outer) > -c.area + snapTolerance ** 2 &&
                contains(c.polygon[0], f.polygon.outer),
            )
            .sort(
              (a, b) =>
                signedArea(a.polygon.outer) - signedArea(b.polygon.outer),
            )[0]
        : undefined;
    if (parent) {
      parent.innerBoundaries.push(`e${c.edges[0]}`);
      parent.polygon.holes.push(c.polygon);
      c.edges.forEach((e) => (graph.halfEdges[e].face = parent.id));
    } else {
      const id = `f${graph.faces.length}`;
      graph.faces.push({
        id,
        boundary: `e${c.edges[0]}`,
        innerBoundaries: [],
        polygon: { outer: c.polygon, holes: [] },
        exterior: true,
      });
      c.edges.forEach((e) => (graph.halfEdges[e].face = id));
    }
  }
  return graph;
}

  function extendCornerEndpoints(segments: GraphSegment[], maxExtension = 0.18): GraphSegment[] {
    return segments.map((seg, i) => {
      const dx = seg.end[0] - seg.start[0], dy = seg.end[1] - seg.start[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return seg;
      const ux = dx / len, uy = dy / len;

      let start: Point2 = [seg.start[0], seg.start[1]];
      let end: Point2 = [seg.end[0], seg.end[1]];

      for (let j = 0; j < segments.length; j++) {
        if (i === j) continue;
        const other = segments[j];
        for (const pt of [other.start, other.end]) {
          const dStart = Math.hypot(pt[0] - start[0], pt[1] - start[1]);
          if (dStart > 1e-4 && dStart <= maxExtension) {
            start = [seg.start[0] - ux * Math.min(dStart, maxExtension), seg.start[1] - uy * Math.min(dStart, maxExtension)];
          }
          const dEnd = Math.hypot(pt[0] - end[0], pt[1] - end[1]);
          if (dEnd > 1e-4 && dEnd <= maxExtension) {
            end = [seg.end[0] + ux * Math.min(dEnd, maxExtension), seg.end[1] + uy * Math.min(dEnd, maxExtension)];
          }
        }
      }
      return { ...seg, start, end };
    });
  }