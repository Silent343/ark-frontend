export { compileCadBlueprint } from "./cad-reconstruction";
import { floorElevations } from "./cad-reconstruction";
import type {
  CadBounds,
  CadEntity,
  CadPlan,
  CadRegion,
  CadRole,
} from "./entities/cad-plan";

export const cadRoleLabels: Record<CadRole, string> = {
  reference: "Referencia / anotación",
  wall: "Muros",
  door: "Puertas",
  window: "Ventanas",
  column: "Columnas",
  stair: "Escaleras",
  furniture: "Mobiliario",
  roof: "Cubiertas",
  electrical: "Instalación eléctrica",
  plumbing: "Instalación sanitaria",
};

/** Layer names supply explicit evidence; unknown layers remain editable reference geometry. */
export function suggestCadRole(name: string): CadRole {
  const key = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/cota|texto|textura|relleno|eje|hoja|grilla|defpoint/.test(key))
    return "reference";
  if (/muro|pared|wall/.test(key)) return "wall";
  if (/puerta|door/.test(key)) return "door";
  if (/ventana|vidrio|window|glaz/.test(key)) return "window";
  if (/columna|column|pilar/.test(key)) return "column";
  if (/grada|escalera|stair/.test(key)) return "stair";
  if (/mueble|mobiliario|furn/.test(key)) return "furniture";
  if (/techo|cubierta|roof/.test(key)) return "roof";
  if (/agua|sanit|pluvial|plumb|drain/.test(key)) return "plumbing";
  if (/elect|energia|lighting/.test(key)) return "electrical";
  return "reference";
}

export function cadEntityBounds(entity: CadEntity): CadBounds {
  if (entity.kind === "path") {
    const xs = entity.points.filter((_, i) => i % 2 === 0),
      ys = entity.points.filter((_, i) => i % 2 === 1);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
  if (entity.kind === "circle")
    return {
      minX: entity.x - entity.radius,
      minY: entity.y - entity.radius,
      maxX: entity.x + entity.radius,
      maxY: entity.y + entity.radius,
    };
  const w = entity.value.length * entity.height * 0.58,
    h = entity.height;
  const points = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([x, y]) => [
    entity.x + x * Math.cos(entity.rotation) - y * Math.sin(entity.rotation),
    entity.y + x * Math.sin(entity.rotation) + y * Math.cos(entity.rotation),
  ]);
  return {
    minX: Math.min(...points.map((p) => p[0])),
    minY: Math.min(...points.map((p) => p[1])),
    maxX: Math.max(...points.map((p) => p[0])),
    maxY: Math.max(...points.map((p) => p[1])),
  };
}

export function cadBounds(entities: CadEntity[]): CadBounds {
  const result = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const entity of entities) {
    const b = cadEntityBounds(entity);
    result.minX = Math.min(result.minX, b.minX);
    result.minY = Math.min(result.minY, b.minY);
    result.maxX = Math.max(result.maxX, b.maxX);
    result.maxY = Math.max(result.maxY, b.maxY);
  }
  return Number.isFinite(result.minX)
    ? result
    : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
}

/** Stray CAD objects can be kilometres away; fit the dominant sheet without deleting those entities. */
function drawingBounds(entities: CadEntity[]): CadBounds {
  if (entities.length < 500) return cadBounds(entities);
  const boxes = entities.map(cadEntityBounds);
  const xs = boxes.map((b) => (b.minX + b.maxX) / 2).sort((a, b) => a - b),
    ys = boxes.map((b) => (b.minY + b.maxY) / 2).sort((a, b) => a - b);
  const low = Math.floor(xs.length * 0.002),
    high = Math.floor(xs.length * 0.998);
  const dx = (xs[high] - xs[low]) * 0.12,
    dy = (ys[high] - ys[low]) * 0.12;
  return cadBounds(
    entities.filter((_, i) => {
      const b = boxes[i],
        x = (b.minX + b.maxX) / 2,
        y = (b.minY + b.maxY) / 2;
      return (
        x >= xs[low] - dx &&
        x <= xs[high] + dx &&
        y >= ys[low] - dy &&
        y <= ys[high] + dy
      );
    }),
  );
}

export function moveCadEntity(
  entity: CadEntity,
  dx: number,
  dy: number,
): CadEntity {
  return entity.kind === "path"
    ? { ...entity, points: entity.points.map((n, i) => n + (i % 2 ? dy : dx)) }
    : { ...entity, x: entity.x + dx, y: entity.y + dy };
}

export function transformCadEntity(
  entity: CadEntity,
  angle: number,
  factor: number,
): CadEntity {
  const b = cadEntityBounds(entity),
    cx = (b.minX + b.maxX) / 2,
    cy = (b.minY + b.maxY) / 2;
  const rad = (angle * Math.PI) / 180;
  const point = (x: number, y: number) => [
    cx + ((x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad)) * factor,
    cy + ((x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad)) * factor,
  ];
  if (entity.kind === "path")
    return {
      ...entity,
      points: entity.points.flatMap((x, i) =>
        i % 2 ? [] : point(x, entity.points[i + 1]),
      ),
    };
  const [x, y] = point(entity.x, entity.y);
  if (entity.kind === "circle")
    return { ...entity, x, y, radius: entity.radius * factor };
  return {
    ...entity,
    x,
    y,
    height: entity.height * factor,
    rotation: entity.rotation + rad,
  };
}

/** Large plan titles distinguish plan views from the smaller floor labels in elevations. */
export function detectCadRegions(
  plan: Pick<CadPlan, "entities" | "layers">,
  floorHeight = 2.8,
): CadRegion[] {
  const titles = plan.entities.filter(
    (e): e is Extract<CadEntity, { kind: "text" }> =>
      e.kind === "text" &&
      /^(PLANTA\s*\d|S[ÓO]TANO\s*\d|TERRAZA)/i.test(e.value.trim()),
  );
  const largest = Math.max(0, ...titles.map((e) => e.height));
  const strong = titles.filter((e) => e.height >= largest * 0.78);
  const wallLayers = new Set(
    plan.layers.filter((l) => l.role === "wall").map((l) => l.name),
  );
  const physicalLayers = new Set(
    plan.layers
      .filter((l) =>
        ["wall", "column", "window", "door", "stair"].includes(l.role),
      )
      .map((l) => l.name),
  );
  const walls = plan.entities.filter(
    (e) => physicalLayers.has(e.layer) && e.kind !== "text",
  );
  const regions: CadRegion[] = [];
  for (const title of strong) {
    if (
      regions.some(
        (r) =>
          Math.hypot((r.minX + r.maxX) / 2 - title.x, r.minY - title.y) <
          title.height * 8,
      )
    )
      continue;
    const unit = title.height;
    const nearby = walls.filter((e) => {
      const b = cadEntityBounds(e),
        x = (b.minX + b.maxX) / 2,
        y = (b.minY + b.maxY) / 2;
      if (b.maxX - b.minX > unit * 90 || b.maxY - b.minY > unit * 90)
        return false;
      if (!(
        x > title.x - unit * 78 &&
        x < title.x + unit * 54 &&
        y > title.y + unit * 1.5 &&
        y < title.y + unit * 88
      ))
        return false;
      // A nearest-title partition prevents adjacent plan views from leaking into each other's floors.
      const distance = (t: typeof title) =>
        Math.hypot(x - (t.x - t.height * 16), y - (t.y + t.height * 35));
      return strong.every(
        (other) => other.id === title.id || distance(title) <= distance(other),
      );
    });
    if (nearby.length < 8) continue;
    const bounds = cadBounds(nearby);
    const numbers = [...title.value.matchAll(/\d+/g)].map((m) => Number(m[0]));
    const basement = /s[óo]tano/i.test(title.value);
    const number = numbers[0] ?? 1;
    regions.push({
      ...bounds,
      id: `region-${title.id}`,
      name: title.value,
      elevation: basement ? -number * floorHeight : (number - 1) * floorHeight,
      repeat: Math.min(
        20,
        numbers.length > 1 && /\d\s*[-–]\s*\d/.test(title.value)
          ? Math.max(...numbers) - number + 1
          : 1,
      ),
      enabled: true,
    });
  }
  const highest = Math.max(
    0,
    ...regions
      .filter((r) => !/terraza/i.test(r.name))
      .map((r) => r.elevation + (r.repeat - 1) * floorHeight),
  );
  for (const region of regions)
    if (/terraza/i.test(region.name)) region.elevation = highest + floorHeight;
  // Finished-floor annotations carry actual storey heights, including basements and nonuniform ground floors.
  for (const region of regions) {
    const values = floorElevations(plan.entities.filter(e => e.kind === "text" && e.x >= region.minX && e.x <= region.maxX && e.y >= region.minY - 1 && e.y <= region.maxY));
    if (!values.length) continue;
    region.elevation = values[0];
    if (region.repeat > 1) {
      const upper = values.filter(v => v >= region.elevation).sort((a, b) => a - b);
      region.elevations = Array.from({ length: region.repeat }, (_, i) => upper[i] ?? region.elevation + i * floorHeight);
    }
  }
  if (!regions.length && wallLayers.size && walls.length)
    regions.push({
      ...cadBounds(walls),
      id: "region-main",
      name: "Planta principal",
      elevation: 0,
      repeat: 1,
      enabled: true,
    });
  return regions.sort((a, b) => a.elevation - b.elevation);
}

export function createCadPlan(
  sourceName: string,
  entities: CadEntity[],
  layers: Array<{ name: string; visible: boolean; count: number }>,
  skipped: Record<string, number>,
  floorHeight = 2.8,
): CadPlan {
  const plan: CadPlan = {
    sourceName,
    entities,
    layers: layers.map((l) => ({ ...l, role: suggestCadRole(l.name) })),
    bounds: drawingBounds(entities),
    metersPerCadUnit: 1,
    unitConfirmed: false,
    regions: [],
    skipped,
  };
  plan.regions = detectCadRegions(plan, floorHeight);
  return plan;
}
