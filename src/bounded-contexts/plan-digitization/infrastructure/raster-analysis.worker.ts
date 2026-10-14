import { detectTiledRaster } from "../application/raster-tiles";
import { buildPlanarGraph } from "../domain/canonical/planar-graph";
import type { FloorSlab, Room } from "../domain/entities/blueprint";
import type { Point2 } from "../domain/canonical/types";

self.onmessage = async (
  event: MessageEvent<{
    bitmap: ImageBitmap;
    threshold: number;
    metersPerPixel: number;
    wallHeight: number;
    levelId: string;
  }>,
) => {
  const {
    bitmap,
    threshold,
    metersPerPixel: ratio,
    wallHeight,
    levelId,
  } = event.data;
  try {
    if (!Number.isFinite(ratio) || ratio <= 0)
      throw new Error("Calibra la escala antes de analizar.");
    const result = await detectTiledRaster(
      bitmap.width,
      bitmap.height,
      async (tile) => {
        const canvas = new OffscreenCanvas(tile.width, tile.height),
          ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Análisis raster no disponible.");
        ctx.drawImage(
          bitmap,
          tile.x,
          tile.y,
          tile.width,
          tile.height,
          0,
          0,
          tile.width,
          tile.height,
        );
        return ctx.getImageData(0, 0, tile.width, tile.height).data;
      },
      {
        threshold,
        onProgress: (completed, total) =>
          self.postMessage({ progress: completed / total }),
      },
    );
    const walls = result.walls.map((w) => ({
      ...w,
      height: wallHeight,
      levelId,
    }));
    const metric = ([x, y]: Point2): Point2 => [x * ratio, -y * ratio],
      pixel = ([x, y]: Point2): Point2 => [x / ratio, -y / ratio];
    const topology = buildPlanarGraph(
      walls.map((w) => ({
        start: metric(w.start),
        end: metric(w.end),
        wallId: w.id,
      })),
    );
    const slabs: FloorSlab[] = [],
      rooms: Room[] = [];
    for (const face of topology.faces.filter((f) => !f.exterior)) {
      const polygon = face.polygon.outer.map(pixel),
        holes = face.polygon.holes.map((h) => h.map(pixel));
      const xs = polygon.map((p) => p[0]),
        ys = polygon.map((p) => p[1]);
      const signed = (p: Point2[]) =>
        Math.abs(
          p.reduce((sum, a, i) => {
            const b = p[(i + 1) % p.length];
            return sum + a[0] * b[1] - b[0] * a[1];
          }, 0),
        ) / 2;
      const area =
        signed(face.polygon.outer) -
        face.polygon.holes.reduce((sum, h) => sum + signed(h), 0);
      if (area < 0.5) continue;
      slabs.push({
        id: `slab-raster-${slabs.length}`,
        levelId,
        name: "Contorno cerrado · revisar losa",
        polygon,
        holes,
        thickness: 0.18,
      });
      // The legacy room editor stores rectangles. Irregular polygons stay precise slabs, never distorted room boxes.
      const width = Math.max(...xs) - Math.min(...xs),
        height = Math.max(...ys) - Math.min(...ys);
      if (!holes.length && area / (width * height * ratio ** 2) > 0.98)
        rooms.push({
          id: `room-raster-${rooms.length}`,
          levelId,
          name: `Ambiente ${rooms.length + 1}`,
          x: Math.min(...xs),
          y: Math.min(...ys),
          width,
          height,
          area,
        });
    }
    self.postMessage({ result: { ...result, walls, slabs, rooms } });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "No se pudo analizar el raster.",
    });
  } finally {
    bitmap.close();
  }
};
