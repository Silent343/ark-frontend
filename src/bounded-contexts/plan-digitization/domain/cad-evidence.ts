import type { CadEntity, CadRole } from "./entities/cad-plan";
import { distance, reconstructWalls, type PlanLine } from "./cad-topology";

export type FixtureKind =
  | "chair"
  | "table"
  | "bed"
  | "sofa"
  | "toilet"
  | "sink"
  | "cabinet"
  | "equipment"
  | "plant"
  | "vehicle";
export function fixtureKind(name: string): FixtureKind | undefined {
  const s = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/corte|alzado|elevacion|frontal|simb|eje|planta baja|planta alta/.test(s))
    return;
  if (/sillon|sofa|lounge|boot[46]/.test(s)) return "sofa";
  if (/silla|chair|butaca/.test(s)) return "chair";
  if (/mesa|table|comedor|^mre\d|^mc\d/.test(s)) return "table";
  if (/cama|bed/.test(s)) return "bed";
  if (/inodoro|toilet|^wc$/.test(s)) return "toilet";
  if (/ovalin|lavabo|lavaman|sink/.test(s)) return "sink";
  if (/arbol|tree|maceta|planta ornamental/.test(s)) return "plant";
  if (/^auto|coche|vehicul|carro/.test(s)) return "vehicle";
  if (/barra|mueble|closet|armario|rack|cabinet/.test(s)) return "cabinet";
  if (/horno|estufa|helad|lavaloza|refri|caminadora|equipo|campana/.test(s))
    return "equipment";
}

export function blockRole(name: string): CadRole | undefined {
  const s = name.toLowerCase();
  if (/corte|alzado|elevaci[oó]n|frontal|simb|eje/.test(s)) return "reference";
  if (/puerta|door/.test(s)) return "door";
  if (/ventana|window/.test(s)) return "window";
  if (fixtureKind(name)) return "furniture";
}

/** Conservative fallback for anonymous layers: repeated thick parallel faces, not merely long strokes. */
export function anonymousWallLayer(
  entities: CadEntity[],
  units: number,
  glazing = false,
): boolean {
  if (glazing) units *= 2;
  const lines: PlanLine[] = entities.flatMap((e) => {
    if (e.kind !== "path" || e.group?.includes("dimension")) return [];
    const out: PlanLine[] = [];
    for (let i = 2; i < e.points.length; i += 2) {
      const a: [number, number] = [
        e.points[i - 2] * units,
        e.points[i - 1] * units,
      ];
      const b: [number, number] = [
        e.points[i] * units,
        e.points[i + 1] * units,
      ];
      if (distance(a, b) > 0.4) out.push({ a, b, thickness: 0, source: e.id });
    }
    return out;
  });
  if (lines.length < (glazing ? 4 : 12) || lines.length > 3000) return false;
  if (glazing)
    return (
      reconstructWalls(lines).filter(
        (w) =>
          w.paired &&
          w.thickness >= 0.075 &&
          w.thickness <= 0.14 &&
          distance(w.a, w.b) > 3.2,
      ).length >= 2
    );
  const pairs = reconstructWalls(lines).filter(
    (w) => w.paired && w.thickness >= 0.12,
  );
  return (
    pairs.length >= 6 &&
    pairs.filter((w) => distance(w.a, w.b) > 4).length >= 4 &&
    pairs.length / lines.length > 0.18
  );
}

/** A quarter-circle with door-sized radius is a proposal, never a confirmed opening. */
export function isDoorArc(e: CadEntity, units: number): boolean {
  if (e.kind !== "path" || e.closed || e.points.length < 24) return false;
  const p = e.points,
    n = p.length;
  let length = 0;
  for (let i = 2; i < n; i += 2)
    length += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  const chord = Math.hypot(p[n - 2] - p[0], p[n - 1] - p[1]);
  const radius = (chord / Math.SQRT2) * units;
  return (
    radius >= 0.55 &&
    radius <= 1.7 &&
    length / chord > 1.1 &&
    length / chord < 1.12
  );
}
