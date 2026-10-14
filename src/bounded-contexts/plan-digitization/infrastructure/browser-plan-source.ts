import type { PlanReview } from "../domain/entities/blueprint";
import type { CadEntity } from "../domain/entities/cad-plan";
import type { PlanPoint } from "../domain/plan-calibration";

export interface RasterPlan {
  canvas: HTMLCanvasElement;
  pageCount: number;
  text: PlanReview["text"];
  cad?: {
    entities: CadEntity[];
    layers: Array<{ name: string; visible: boolean; count: number }>;
    skipped: Record<string, number>;
    entityCount: number;
    renderLayers: (
      visibleLayers: string[],
    ) => Promise<{ canvas: HTMLCanvasElement; text: PlanReview["text"] }>;
    dispose: () => void;
  };
}
const MAX_SIDE = 1400;
const MAX_ANALYSIS_PIXELS = 32_000_000;

export function createPlanCanvas(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_ANALYSIS_PIXELS ||
    Math.max(width, height) > 16384
  )
    throw new Error(
      "La región supera el presupuesto de análisis (32 megapíxeles). Exporta o recorta una planta; no se reducirá su resolución automáticamente.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

/** Rasterize only the requested page at a bounded resolution; preserve embedded PDF text. */
export async function loadPlanSource(
  file: File,
  pageNumber = 1,
  signal?: AbortSignal,
): Promise<RasterPlan> {
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Maximum file size: 12 MB.");
  if (/\.(dwg|dxf)$/i.test(file.name)) {
    const { loadCadPlanSource } = await import("./browser-cad-source");
    return loadCadPlanSource(file, signal);
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdf = await import("pdfjs-dist");
    pdf.GlobalWorkerOptions.workerSrc = "/vendor/plan-tools/pdf.worker.min.mjs";
    const task = pdf.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    try {
      const document = await task.promise;
      const page = await document.getPage(
        Math.max(1, Math.min(document.numPages, pageNumber)),
      );
      // 200 DPI analysis preserves small symbols; display thumbnails are generated separately.
      const viewport = page.getViewport({ scale: 200 / 72 });
      const { canvas, context } = createPlanCanvas(
        viewport.width,
        viewport.height,
      );
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const content = await page.getTextContent();
      const text: PlanReview["text"] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const transform = pdf.Util.transform(
          viewport.transform,
          item.transform,
        );
        const height = Math.hypot(transform[2], transform[3]);
        text.push({
          text: item.str.slice(0, 200),
          x: transform[4],
          y: transform[5] - height,
          width: item.width * viewport.scale,
          height,
          confidence: 100,
          source: "pdf",
        });
      }
      return {
        canvas,
        pageCount: document.numPages,
        text: text.slice(0, 1000),
      };
    } finally {
      await task.destroy();
    }
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Use PDF, PNG, JPEG or WebP.");
  const bitmap = await createImageBitmap(file);
  try {
    const { canvas, context } = createPlanCanvas(bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { canvas, pageCount: 1, text: [] };
  } finally {
    bitmap.close();
  }
}

/** Deskew/rotate, normalize contrast and remove isolated pixels without modifying the uploaded file. */
export function preparePlanImage(
  source: HTMLCanvasElement,
  degrees: number,
  contrast: number,
  denoise: boolean,
  grayscale = true,
  maxSide = Number.POSITIVE_INFINITY,
) {
  const angle = (degrees * Math.PI) / 180;
  const boundW =
    Math.abs(source.width * Math.cos(angle)) +
    Math.abs(source.height * Math.sin(angle));
  const boundH =
    Math.abs(source.width * Math.sin(angle)) +
    Math.abs(source.height * Math.cos(angle));
  const scale = Math.min(1, maxSide / Math.max(boundW, boundH));
  const { canvas, context } = createPlanCanvas(boundW * scale, boundH * scale);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(angle);
  context.scale(scale, scale);
  // Keep a CAD drawing's original layer colors; raster scans benefit from monochrome cleanup.
  context.filter = `${grayscale ? "grayscale(1) " : ""}contrast(${contrast}%)`;
  context.drawImage(source, -source.width / 2, -source.height / 2);
  context.resetTransform();
  context.filter = "none";
  if (denoise) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height),
      original = image.data.slice();
    for (let y = 1; y < canvas.height - 1; y++)
      for (let x = 1; x < canvas.width - 1; x++) {
        const offset = (y * canvas.width + x) * 4;
        if (original[offset] > 160) continue;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (original[((y + dy) * canvas.width + x + dx) * 4] < 160)
              neighbors++;
        if (neighbors <= 2)
          image.data[offset] =
            image.data[offset + 1] =
            image.data[offset + 2] =
              255;
      }
    context.putImageData(image, 0, 0);
  }
  return canvas;
}

/** Display-only thumbnail. Geometry and calibration stay in full analysis coordinates. */
export function planPreviewCanvas(
  source: HTMLCanvasElement,
  maxSide = MAX_SIDE,
) {
  const ratio = Math.min(1, maxSide / Math.max(source.width, source.height));
  const { canvas, context } = createPlanCanvas(
    source.width * ratio,
    source.height * ratio,
  );
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Inverse projective mapping: user supplies clockwise corners TL, TR, BR, BL. */
export function rectifyPlan(source: HTMLCanvasElement, points: PlanPoint[]) {
  if (points.length !== 4) throw new Error("Four corners required.");
  const crosses = points.map((p, i) => {
    const q = points[(i + 1) % 4],
      r = points[(i + 2) % 4];
    return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
  });
  if (crosses.some((c) => c <= 10))
    throw new Error("Select clockwise corners without crossing edges.");
  const [a, b, c, d] = points;
  const dx1 = b[0] - c[0],
    dx2 = d[0] - c[0],
    dx3 = a[0] - b[0] + c[0] - d[0];
  const dy1 = b[1] - c[1],
    dy2 = d[1] - c[1],
    dy3 = a[1] - b[1] + c[1] - d[1];
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1)
    throw new Error("Degenerate perspective selection.");
  const g = (dx3 * dy2 - dx2 * dy3) / determinant,
    h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const length = (p: PlanPoint, q: PlanPoint) =>
    Math.hypot(p[0] - q[0], p[1] - q[1]);
  const { canvas, context } = createPlanCanvas(
    Math.max(length(a, b), length(c, d)),
    Math.max(length(a, d), length(b, c)),
  );
  const input = source
    .getContext("2d")!
    .getImageData(0, 0, source.width, source.height).data;
  const output = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width,
        v = y / canvas.height,
        den = g * u + h * v + 1;
      const sx = Math.round(
        ((b[0] - a[0] + g * b[0]) * u + (d[0] - a[0] + h * d[0]) * v + a[0]) /
          den,
      );
      const sy = Math.round(
        ((b[1] - a[1] + g * b[1]) * u + (d[1] - a[1] + h * d[1]) * v + a[1]) /
          den,
      );
      if (sx < 0 || sx >= source.width || sy < 0 || sy >= source.height)
        continue;
      const from = (sy * source.width + sx) * 4,
        to = (y * canvas.width + x) * 4;
      output.data.set(input.subarray(from, from + 4), to);
    }
  context.putImageData(output, 0, 0);
  return canvas;
}

/** All language weights and executable workers are hosted locally. No source pixels leave the browser. */
export async function recognizePlanText(
  canvas: HTMLCanvasElement,
  language: "spa" | "eng" | "por",
  progress: (value: number) => void,
  signal: AbortSignal,
): Promise<PlanReview["text"]> {
  const { createWorker } = await import("tesseract.js");
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let rejectAbort: (reason: Error) => void = () => undefined;
  const cancellation = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    rejectAbort(new DOMException("Cancelled", "AbortError"));
    void worker?.terminate();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const initialization = createWorker(language, 1, {
      workerPath: "/vendor/plan-tools/worker.min.js",
      corePath: "/vendor/plan-tools",
      langPath: "/vendor/plan-tools",
      logger: (message) => progress(message.progress ?? 0),
    }).then(async (instance) => {
      worker = instance;
      if (signal.aborted) {
        await instance.terminate();
        throw new DOMException("Cancelled", "AbortError");
      }
      return instance;
    });
    worker = await Promise.race([initialization, cancellation]);
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const result = await Promise.race([
      worker.recognize(canvas, {}, { blocks: true, text: true }),
      cancellation,
    ]);
    return (result.data.blocks ?? [])
      .flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.map((line) => ({
            text: line.text.trim().slice(0, 200),
            x: line.bbox.x0,
            y: line.bbox.y0,
            width: line.bbox.x1 - line.bbox.x0,
            height: line.bbox.y1 - line.bbox.y0,
            confidence: line.confidence,
            source: "ocr" as const,
          })),
        ),
      )
      .filter((line) => line.text)
      .slice(0, 1000);
  } finally {
    signal.removeEventListener("abort", abort);
    await worker?.terminate();
  }
}
