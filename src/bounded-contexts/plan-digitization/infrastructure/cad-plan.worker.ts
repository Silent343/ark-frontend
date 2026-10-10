import {
  extractCadDrawing,
  type CadDrawingPreview,
  type CadShape,
} from "./cad-plan-geometry";

const MAX_SIDE = 3000;
let drawing: CadDrawingPreview | null = null;

type Request =
  | { id: number; type: "load"; bytes: ArrayBuffer; format: "dwg" | "dxf" }
  | { id: number; type: "render"; visibleLayers: string[] };

function boundsOf(shapes: CadShape[], visible: Set<string>) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const shape of shapes) {
    if (!visible.has(shape.layer)) continue;
    if (shape.kind === "path") {
      for (let i = 0; i < shape.points.length; i += 2)
        include(shape.points[i], shape.points[i + 1]);
    } else if (shape.kind === "circle") {
      include(shape.x - shape.radius, shape.y - shape.radius);
      include(shape.x + shape.radius, shape.y + shape.radius);
    } else include(shape.x, shape.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX))
    throw new Error("No hay geometría visible en las capas seleccionadas.");
  return { minX, minY, maxX, maxY };
}

/** Raster output is bounded for the existing calibrated import; original DWG units remain untouched. */
function renderCad(visibleLayers: string[]) {
  if (!drawing) throw new Error("El plano CAD aún no está cargado.");
  const visible = new Set(visibleLayers);
  const bounds = boundsOf(drawing.shapes, visible);
  const extentX = Math.max(0.01, bounds.maxX - bounds.minX);
  const extentY = Math.max(0.01, bounds.maxY - bounds.minY);
  const longest = Math.max(extentX, extentY);
  const width = Math.max(240, Math.round((MAX_SIDE * extentX) / longest));
  const height = Math.max(240, Math.round((MAX_SIDE * extentY) / longest));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D no disponible.");
  context.fillStyle = "#fffefa";
  context.fillRect(0, 0, width, height);
  const scale = Math.min((width - 48) / extentX, (height - 48) / extentY);
  const left = (width - extentX * scale) / 2;
  const top = (height - extentY * scale) / 2;
  const px = (x: number) => left + (x - bounds.minX) * scale;
  const py = (y: number) => top + (bounds.maxY - y) * scale;
  const text: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
    source: "cad";
  }> = [];
  context.lineWidth = 1;
  context.lineCap = "round";
  for (const shape of drawing.shapes) {
    if (!visible.has(shape.layer)) continue;
    context.strokeStyle = shape.color;
    context.fillStyle = shape.color;
    if (shape.kind === "path") {
      context.beginPath();
      context.moveTo(px(shape.points[0]), py(shape.points[1]));
      for (let i = 2; i < shape.points.length; i += 2)
        context.lineTo(px(shape.points[i]), py(shape.points[i + 1]));
      if (shape.closed) context.closePath();
      context.stroke();
    } else if (shape.kind === "circle") {
      context.beginPath();
      context.arc(
        px(shape.x),
        py(shape.y),
        shape.radius * scale,
        0,
        Math.PI * 2,
      );
      context.stroke();
    } else {
      const fontSize = Math.max(3, Math.min(64, shape.height * scale));
      context.save();
      context.translate(px(shape.x), py(shape.y));
      context.rotate(-shape.rotation);
      context.font = `${fontSize}px Arial, sans-serif`;
      context.fillText(shape.value, 0, 0, 800);
      context.restore();
      if (text.length < 1000)
        text.push({
          text: shape.value,
          x: px(shape.x),
          y: py(shape.y) - fontSize,
          width: Math.min(800, shape.value.length * fontSize * 0.55),
          height: fontSize,
          confidence: 100,
          source: "cad",
        });
    }
  }
  return { bitmap: canvas.transferToImageBitmap(), width, height, text };
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      const bytes = new Uint8Array(request.bytes);
      if (bytes.length > 12 * 1024 * 1024)
        throw new Error("Máximo 12 MB por archivo CAD.");
      // Use the library's own prebundled ESM to avoid a Turbopack cycle in its source exports.
      const moduleUrl = "/vendor/plan-tools/acad.bundle.js";
      const cad = (await import(
        /* webpackIgnore: true */ moduleUrl
      )) as typeof import("@node-projects/acad-ts");
      const document =
        request.format === "dwg"
          ? cad.DwgReader.readFromStream(request.bytes)
          : cad.DxfReader.readFromStream(bytes);
      drawing = extractCadDrawing(document, cad);
      const visibleLayers = drawing.layers
        .filter((layer) => layer.visible)
        .map((layer) => layer.name);
      const rendered = renderCad(visibleLayers);
      (
        self.postMessage as (message: unknown, transfer: Transferable[]) => void
      )(
        {
          id: request.id,
          type: "loaded",
          ...rendered,
          shapes: drawing.shapes,
          layers: drawing.layers,
          skipped: drawing.skipped,
          entityCount: drawing.shapes.length,
        },
        [rendered.bitmap],
      );
    } else {
      const rendered = renderCad(request.visibleLayers);
      (
        self.postMessage as (message: unknown, transfer: Transferable[]) => void
      )({ id: request.id, type: "rendered", ...rendered }, [rendered.bitmap]);
    }
  } catch (error) {
    self.postMessage({
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
