import type { FloorSlab } from "../domain/entities/blueprint";
import { contains, signedArea, type Point2 } from "../domain/cad-topology";

/** Extract bounded colored floor regions; never infer furniture, height or use from a color. */
export function detectColoredSpaces(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  levelId: string,
): FloorSlab[] {
  if (
    width * height > 2_000_000 ||
    pixels.length !== width * height * 4 ||
    width < 1 ||
    height < 1
  )
    return [];
  const step = 2,
    w = Math.ceil(width / step),
    h = Math.ceil(height / step),
    size = w * h;
  const visited = new Uint8Array(size),
    queue = new Int32Array(size),
    results: FloorSlab[] = [];
  const rgb = (at: number) => {
    const p =
      (Math.min(height - 1, Math.floor(at / w) * step) * width +
        Math.min(width - 1, (at % w) * step)) *
      4;
    return [pixels[p], pixels[p + 1], pixels[p + 2]];
  };
  const colored = (c: number[]) =>
    Math.max(...c) - Math.min(...c) > 12 &&
    Math.min(...c) > 75 &&
    c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 < 245;
  for (let seed = 0; seed < size; seed++) {
    if (visited[seed]) continue;
    visited[seed] = 1;
    const color = rgb(seed);
    if (!colored(color)) continue;
    let head = 0,
      tail = 1,
      touches = false;
    queue[0] = seed;
    while (head < tail) {
      const at = queue[head++],
        x = at % w,
        y = Math.floor(at / w);
      if (!x || !y || x === w - 1 || y === h - 1) touches = true;
      for (const n of [
        x > 0 ? at - 1 : -1,
        x < w - 1 ? at + 1 : -1,
        y > 0 ? at - w : -1,
        y < h - 1 ? at + w : -1,
      ]) {
        if (n < 0 || visited[n]) continue;
        const c = rgb(n);
        if (!colored(c) || c.some((v, i) => Math.abs(v - color[i]) > 24))
          continue;
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    if (touches || tail < size * 0.004 || tail > size * 0.7) continue;
    const mask = new Set(queue.subarray(0, tail)),
      stride = w + 1,
      edges = new Map<number, number[]>();
    const edge = (a: number, b: number) => {
      const es = edges.get(a) ?? [];
      es.push(b);
      edges.set(a, es);
    };
    for (const at of mask) {
      const x = at % w,
        y = Math.floor(at / w),
        a = y * stride + x;
      if (!mask.has(at - w)) edge(a, a + 1);
      if (x === w - 1 || !mask.has(at + 1)) edge(a + 1, a + stride + 1);
      if (!mask.has(at + w)) edge(a + stride + 1, a + stride);
      if (x === 0 || !mask.has(at - 1)) edge(a + stride, a);
    }
    const loops: Point2[][] = [];
    for (const [start, next] of edges)
      while (next.length) {
        const loop: Point2[] = [];
        let at = start;
        for (let count = 0; count <= size; count++) {
          loop.push([(at % stride) * step, Math.floor(at / stride) * step]);
          const to = edges.get(at)?.pop();
          if (to === undefined) break;
          at = to;
          if (at === start) break;
        }
        if (at === start && loop.length > 3) {
          const corners = loop.filter((p, i) => {
            const a = loop[(i + loop.length - 1) % loop.length],
              b = loop[(i + 1) % loop.length];
            return (
              (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0])
            );
          });
          if (corners.length >= 3 && corners.length <= 10000)
            loops.push(corners);
        }
      }
    const polygon = loops
      .filter((p) => signedArea(p) > 0)
      .sort((a, b) => signedArea(b) - signedArea(a))[0];
    if (!polygon) continue;
    // Small islands are symbol ink, not floor voids. Only retain substantial holes for review.
    const holes = loops
      .filter((p) => signedArea(p) < -width * height * 0.004)
      .slice(0, 200);
    results.push({
      id: `color-floor-${results.length + 1}`,
      levelId,
      name: "Superficie por color · revisar",
      polygon,
      holes,
      thickness: 0.12,
    });
    if (results.length >= 80) break;
  }
  return results.filter(
    (floor, index) =>
      !results.some(
        (other, j) =>
          j !== index &&
          Math.abs(signedArea(other.polygon)) >
            Math.abs(signedArea(floor.polygon)) &&
          floor.polygon.every((point) => contains(point, other.polygon)),
      ),
  );
}
