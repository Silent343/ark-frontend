import { contains, signedArea } from "../cad-topology";
import type { Point2, Polygon2D } from "./types";

/** Simple rings with strictly contained, disjoint holes; rejects ambiguous triangulation input. */
export function polygonProblem(polygon: Polygon2D): string | null {
  const rings = [polygon.outer, ...polygon.holes];
  let comparisons = 0;
  const segments: Array<{
    a: Point2;
    b: Point2;
    ring: number;
    at: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }> = [];
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    if (
      ring.length < 3 ||
      !ring.every((p) => p.length === 2 && p.every(Number.isFinite)) ||
      Math.abs(signedArea(ring)) < 1e-8
    )
      return "Contorno degenerado o no finito.";
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8)
        return "El contorno contiene aristas de longitud nula.";
      segments.push({
        a,
        b,
        ring: r,
        at: i,
        minX: Math.min(a[0], b[0]),
        maxX: Math.max(a[0], b[0]),
        minY: Math.min(a[1], b[1]),
        maxY: Math.max(a[1], b[1]),
      });
    }
  }
  segments.sort((a, b) => a.minX - b.minX);
  const cross = (a: Point2, b: Point2, c: Point2) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < segments.length; i++)
    for (
      let j = i + 1;
      j < segments.length && segments[j].minX <= segments[i].maxX + 1e-9;
      j++
    ) {
      const a = segments[i],
        b = segments[j];
      if (b.minY > a.maxY + 1e-9 || b.maxY < a.minY - 1e-9) continue;
      if (++comparisons > 2_000_000)
        return "Contorno demasiado complejo: delimita una región menor.";
      if (
        a.ring === b.ring &&
        (Math.abs(a.at - b.at) === 1 ||
          Math.abs(a.at - b.at) === rings[a.ring].length - 1)
      )
        continue;
      const p = cross(a.a, a.b, b.a),
        q = cross(a.a, a.b, b.b),
        r = cross(b.a, b.b, a.a),
        s = cross(b.a, b.b, a.b);
      if (p * q <= 1e-18 && r * s <= 1e-18)
        return "El contorno se cruza consigo mismo o sus huecos se intersectan.";
    }
  for (let i = 0; i < polygon.holes.length; i++) {
    const hole = polygon.holes[i];
    if (!contains(hole[0], polygon.outer))
      return "Hay un hueco fuera del contorno exterior.";
    if (polygon.holes.some((other, j) => j !== i && contains(hole[0], other)))
      return "Los huecos se superponen o están anidados.";
  }
  return null;
}
