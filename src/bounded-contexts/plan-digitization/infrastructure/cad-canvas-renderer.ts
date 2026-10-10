import type {
  CadBounds,
  CadEntity,
  CadPlan,
} from "../domain/entities/cad-plan";
import { cadEntityBounds } from "../domain/cad-operations";

/** A single renderer serves the interactive viewport and image exports at their target resolution. */
export function drawCad(
  context: CanvasRenderingContext2D,
  plan: CadPlan,
  view: { x: number; y: number; scale: number; width: number; height: number },
  selectedId?: string | null,
) {
  context.fillStyle = "#fffefa";
  context.fillRect(0, 0, view.width, view.height);
  const visible = new Set(
    plan.layers.filter((l) => l.visible).map((l) => l.name),
  );
  const px = (x: number) => view.x + x * view.scale,
    py = (y: number) => view.y - y * view.scale;
  const bounds: CadBounds = {
    minX: -view.x / view.scale,
    maxX: (view.width - view.x) / view.scale,
    minY: (view.y - view.height) / view.scale,
    maxY: view.y / view.scale,
  };
  const paint = (e: CadEntity, selected: boolean) => {
    if (!visible.has(e.layer)) return;
    const b = cadEntityBounds(e);
    if (
      b.maxX < bounds.minX ||
      b.minX > bounds.maxX ||
      b.maxY < bounds.minY ||
      b.minY > bounds.maxY
    )
      return;
    context.strokeStyle = context.fillStyle = selected ? "#2563eb" : e.color;
    context.lineWidth = selected ? 2.5 : 0.85;
    if (e.kind === "path") {
      context.beginPath();
      context.moveTo(px(e.points[0]), py(e.points[1]));
      for (let i = 2; i < e.points.length; i += 2)
        context.lineTo(px(e.points[i]), py(e.points[i + 1]));
      if (e.closed) context.closePath();
      context.stroke();
    } else if (e.kind === "circle") {
      context.beginPath();
      context.arc(px(e.x), py(e.y), e.radius * view.scale, 0, Math.PI * 2);
      context.stroke();
    } else {
      context.save();
      context.translate(px(e.x), py(e.y));
      context.rotate(-e.rotation);
      context.font = `${Math.max(0.5, e.height * view.scale)}px Arial, sans-serif`;
      context.fillText(e.value, 0, 0);
      context.restore();
    }
    if (selected) {
      context.setLineDash([4, 3]);
      context.strokeRect(
        px(b.minX) - 4,
        py(b.maxY) - 4,
        (b.maxX - b.minX) * view.scale + 8,
        (b.maxY - b.minY) * view.scale + 8,
      );
      context.setLineDash([]);
    }
  };
  for (const entity of plan.entities)
    if (entity.id !== selectedId) paint(entity, false);
  const selected = plan.entities.find((e) => e.id === selectedId);
  if (selected) paint(selected, true);
}

export function fitCadView(
  bounds: CadBounds,
  width: number,
  height: number,
  margin = 32,
) {
  const scale = Math.min(
    (width - margin * 2) / Math.max(0.01, bounds.maxX - bounds.minX),
    (height - margin * 2) / Math.max(0.01, bounds.maxY - bounds.minY),
  );
  return {
    scale,
    x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    y: height / 2 + ((bounds.minY + bounds.maxY) / 2) * scale,
    width,
    height,
  };
}

export async function exportCadImage(
  plan: CadPlan,
  format: "png" | "jpg",
  bounds = plan.bounds,
): Promise<Blob> {
  const w = Math.max(0.01, bounds.maxX - bounds.minX),
    h = Math.max(0.01, bounds.maxY - bounds.minY);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((6000 * w) / Math.max(w, h));
  canvas.height = Math.round((6000 * h) / Math.max(w, h));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas no disponible.");
  drawCad(context, plan, fitCadView(bounds, canvas.width, canvas.height, 30));
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("No se pudo exportar la imagen.")),
      format === "jpg" ? "image/jpeg" : "image/png",
      0.95,
    ),
  );
}
