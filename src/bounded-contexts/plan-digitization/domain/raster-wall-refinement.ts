import { vectorizeNeuralWalls } from "./neural-plan";
import type { Point2, PlanLine } from "./cad-topology";

export interface RasterPixels {
  width: number;
  height: number;
  gray: Uint8Array;
}
type WallAxis = { start: Point2; end: Point2; thickness: number };

/** Fit source-image strokes only inside learned wall support. Dark text/furniture
 * elsewhere cannot become a wall. Blank gaps are never globally closed. */
export function refineRasterWalls(
  mask: Uint8Array,
  scores: Uint8Array,
  modelWidth: number,
  content: { x: number; y: number; width: number; height: number },
  sourceSize: { width: number; height: number },
  pixels?: RasterPixels,
  region = { x: 0, y: 0, ...sourceSize },
): WallAxis[] {
  const supported = new Uint8Array(mask.length);
  for (let y = 0; y < modelWidth; y++)
    for (let x = 0; x < modelWidth; x++) {
      const i = y * modelWidth + x;
      if (mask[i]!==1 || scores[i] < 140) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (
            x + dx >= content.x &&
            y + dy >= content.y &&
            x + dx < content.x + content.width &&
            y + dy < content.y + content.height
          )
            supported[(y + dy) * modelWidth + x + dx] = 1;
        }
    }
  const hasPixels =
    !!pixels &&
    Number.isInteger(pixels.width) &&
    Number.isInteger(pixels.height) &&
    pixels.width > 2 &&
    pixels.height > 2 &&
    pixels.width <= 1024 &&
    pixels.height <= 1024 &&
    pixels.gray.length === pixels.width * pixels.height &&
    Math.abs(
      pixels.width / pixels.height - sourceSize.width / sourceSize.height,
    ) < 0.02;
  const width = hasPixels ? pixels.width : modelWidth,
    height = hasPixels ? pixels.height : modelWidth;
  const wallMask = new Uint8Array(width * height),
    wallScores = new Uint8Array(wallMask.length).fill(255);
  if (hasPixels) {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const sx = (x / width) * sourceSize.width,
          sy = (y / height) * sourceSize.height;
        if (
          sx < region.x ||
          sy < region.y ||
          sx >= region.x + region.width ||
          sy >= region.y + region.height
        )
          continue;
        const mx = Math.min(
            modelWidth - 1,
            Math.floor(
              content.x + ((sx - region.x) / region.width) * content.width,
            ),
          ),
          my = Math.min(
            modelWidth - 1,
            Math.floor(
              content.y + ((sy - region.y) / region.height) * content.height,
            ),
          );
        if (supported[my * modelWidth + mx] && !([2,3].includes(mask[my*modelWidth+mx])&&scores[my*modelWidth+mx]>=140) && pixels.gray[y * width + x] < 120)
          wallMask[y * width + x] = 1;
      }
  } else
    for (let i = 0; i < mask.length; i++)
      wallMask[i] = mask[i] === 1 && scores[i] >= 140 ? 1 : 0;
  const supportedLine = (a: Point2, b: Point2) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * i) / Math.max(1, n)),
        y = Math.round(a[1] + ((b[1] - a[1]) * i) / Math.max(1, n));
      if (
        x < 0 ||
        y < 0 ||
        x >= width ||
        y >= height ||
        wallMask[y * width + x] !== 1
      )
        return false;
    }
    return true;
  };
  let lines: PlanLine[] = vectorizeNeuralWalls(
    wallMask,
    wallScores,
    width,
    height,
    1,
    3,
    true,
  )
    .filter(
      (w) =>
        w.thickness >= (hasPixels ? 3 : 2) &&
        Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) >=
          Math.max(4, w.thickness * 1.5),
    )
    .map((w) => {
      const a = [...w.a] as Point2,
        b = [...w.b] as Point2,
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      if (Math.abs(dy) <= Math.abs(dx) * 0.1) {
        const y = (a[1] + b[1]) / 2;
        if (supportedLine([a[0], y], [b[0], y])) a[1] = b[1] = y;
      }
      if (Math.abs(dx) <= Math.abs(dy) * 0.1) {
        const x = (a[0] + b[0]) / 2;
        if (supportedLine([x, a[1]], [x, b[1]])) a[0] = b[0] = x;
      }
      return { ...w, a, b };
    });
  // Merge only parallel overlapping/contiguous observations. Use a strict lateral
  // tolerance to avoid collapsing neighbouring distinct walls into one thick axis.
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < lines.length; i++)
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i],
          b = lines[j],
          dx = a.b[0] - a.a[0],
          dy = a.b[1] - a.a[1],
          len = Math.hypot(dx, dy),
          ex = b.b[0] - b.a[0],
          ey = b.b[1] - b.a[1],
          other = Math.hypot(ex, ey);
        if (Math.abs((dx * ex + dy * ey) / (len * other)) < 0.998) continue;
        const projection = (p: Point2) =>
          ((p[0] - a.a[0]) * dx + (p[1] - a.a[1]) * dy) / len;
        const across = (p: Point2) =>
          Math.abs((p[0] - a.a[0]) * dy - (p[1] - a.a[1]) * dx) / len;
        if (
          Math.max(across(b.a), across(b.b)) >
          Math.max(1, Math.min(a.thickness, b.thickness) * 0.25)
        )
          continue;
        const [lo, hi] = [projection(b.a), projection(b.b)].sort(
          (x, y) => x - y,
        );
        if (lo > len + 2 || hi < -2) continue;
        const start = Math.min(0, lo),
          end = Math.max(len, hi),
          point = (t: number): Point2 => [
            a.a[0] + (dx * t) / len,
            a.a[1] + (dy * t) / len,
          ];
        if (!supportedLine(point(start), point(end))) continue;
        lines[i] = {
          ...a,
          a: point(start),
          b: point(end),
          thickness: (a.thickness * len + b.thickness * other) / (len + other),
        };
        lines.splice(j, 1);
        changed = true;
        break outer;
      }
  }
  // Snap supported corner/T endpoints to the actual intersection, not every
  // nearby endpoint; otherwise door gaps get incorrectly filled.
  lines = lines.map((a) => {
    const copy = { ...a, a: [...a.a] as Point2, b: [...a.b] as Point2 };
    for (const b of lines) {
      if (a === b) continue;
      const dx = a.b[0] - a.a[0],
        dy = a.b[1] - a.a[1],
        ex = b.b[0] - b.a[0],
        ey = b.b[1] - b.a[1],
        den = dx * ey - dy * ex;
      if (Math.abs(den) / (Math.hypot(dx, dy) * Math.hypot(ex, ey)) < 0.5)
        continue;
      const qx = b.a[0] - a.a[0],
        qy = b.a[1] - a.a[1],
        t = (qx * ey - qy * ex) / den,
        u = (qx * dy - qy * dx) / den,
        p: Point2 = [a.a[0] + t * dx, a.a[1] + t * dy];
      const tolerance = Math.min(12, Math.max(a.thickness, b.thickness));
      if (
        u < -tolerance / Math.hypot(ex, ey) ||
        u > 1 + tolerance / Math.hypot(ex, ey)
      )
        continue;
      for (const key of ["a", "b"] as const)
        if (
          Math.hypot(copy[key][0] - p[0], copy[key][1] - p[1]) <= tolerance &&
          supportedLine(copy[key], p)
        )
          copy[key] = p;
    }
    return copy;
  });
  lines=lines.filter(w=>Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>=Math.max(3,w.thickness));
  const toSource = ([x, y]: Point2): Point2 =>
    hasPixels
      ? [(x / width) * sourceSize.width, (y / height) * sourceSize.height]
      : [
          region.x + ((x - content.x) / content.width) * region.width,
          region.y + ((y - content.y) / content.height) * region.height,
        ];
  const scale = hasPixels
    ? (sourceSize.width / width + sourceSize.height / height) / 2
    : (region.width / content.width + region.height / content.height) / 2;
  return lines.map((w) => ({
    start: toSource(w.a),
    end: toSource(w.b),
    thickness: w.thickness * scale,
  }));
}
