import type { Blueprint } from "./entities/blueprint";
import { metersPerUnit } from "./plan-calibration";
import { modelIntegrityIssues } from "./model-integrity";

export type InspectedElement = {
  id: string;
  label: string;
  category: string;
  levelId?: string;
  dimensions: Array<{ label: string; value: number; property: string }>;
  hostId?: string;
};

/** A read model shared by the inspector and quality checks; lengths are always metres. */
export function inspectModel(plan: Blueprint): InspectedElement[] {
  const m = metersPerUnit(plan);
  return [
    ...plan.walls.map((w, index) => ({
      id: w.id,
      label: `Muro ${index + 1}`,
      category: "Muros",
      levelId: w.levelId,
      dimensions: [
        {
          label: "Longitud",
          value: Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) * m,
          property: "length",
        },
        { label: "Espesor", value: w.thickness * m, property: "thickness" },
        { label: "Altura", value: w.height, property: "height" },
      ],
    })),
    ...(
      [
        ["doors", "Puerta", "Puertas"],
        ["windows", "Ventana", "Ventanas"],
      ] as const
    ).flatMap(([key, label, category]) =>
      plan[key].map((o, index) => ({
        id: o.id,
        label: `${label} ${index + 1}`,
        category,
        levelId: o.levelId,
        hostId: o.wallId,
        dimensions: [
          { label: "Ancho", value: o.width * m, property: "width" },
          {
            label: "Altura",
            value: o.height ?? (key === "doors" ? 2.1 : 1.2),
            property: "height",
          },
          ...(key === "windows"
            ? [
                {
                  label: "Antepecho",
                  value: o.sillHeight ?? 0.9,
                  property: "sillHeight",
                },
              ]
            : []),
        ],
      })),
    ),
    ...plan.columns.map((c, index) => ({
      id: c.id,
      label: `Columna ${index + 1}`,
      category: "Columnas",
      levelId: c.levelId,
      dimensions: [
        { label: "Ancho", value: c.size * m, property: "width" },
        { label: "Fondo", value: (c.depth ?? c.size) * m, property: "depth" },
        { label: "Altura", value: c.height ?? 2.8, property: "height" },
      ],
    })),
    ...(plan.stairs ?? []).map((s, index) => ({
      id: s.id,
      label: `Escalera ${index + 1}`,
      category: "Escaleras",
      levelId: s.levelId,
      dimensions: [
        { label: "Ancho", value: s.radius * 2 * m, property: "width" },
        { label: "Desnivel", value: s.rise ?? 2.8, property: "rise" },
      ],
    })),
    ...(plan.fixtures ?? []).map((f) => ({
      id: f.id,
      label: f.name,
      category: "Mobiliario y equipo",
      levelId: f.levelId,
      dimensions: [
        { label: "Ancho", value: f.width * m, property: "width" },
        { label: "Fondo", value: f.depth * m, property: "depth" },
        { label: "Altura", value: f.height, property: "height" },
      ],
    })),
    ...(plan.slabs ?? []).map((s) => ({
      id: s.id,
      label: s.name,
      category: "Losas",
      levelId: s.levelId,
      dimensions: [
        { label: "Espesor", value: s.thickness, property: "thickness" },
      ],
    })),
    ...(plan.roofs ?? []).map((r) => ({
      id: r.id,
      label: r.name,
      category: "Cubiertas",
      levelId: r.levelId,
      dimensions: [
        { label: "Espesor", value: r.thickness, property: "thickness" },
        {
          label: "Cota sobre nivel",
          value: r.elevation,
          property: "elevation",
        },
      ],
    })),
  ];
}

export function modelReadiness(plan: Blueprint) {
  const checks: Array<{
    id: string;
    label: string;
    detail: string;
    action: string;
    panel: "levels" | "layers";
    count: number;
  }> = [];
  if (plan.cad && !plan.cad.unitConfirmed)
    checks.push({
      id: "units",
      label: "Confirmar unidades",
      detail: "Verifica una medida conocida del dibujo.",
      action: "Revisar unidades",
      panel: "levels",
      count: 1,
    });
  else if (!plan.cad && !plan.calibration)
    checks.push({
      id: "scale",
      label: "Calibrar el plano",
      detail: "Usa dos puntos y una distancia real.",
      action: "Calibrar",
      panel: "levels",
      count: 1,
    });
  const heights = plan.levels.filter((l) => l.heightSource !== "manual").length;
  if (heights)
    checks.push({
      id: "height",
      label: "Revisar alturas",
      detail:
        "Confirma la altura de los muros desde cortes o cotas; el desnivel entre pisos es solo una referencia.",
      action: "Definir alturas",
      panel: "levels",
      count: heights,
    });
  const unregistered = plan.reconstruction?.unregisteredRegions?.length ?? 0;
  if (unregistered)
    checks.push({
      id: "alignment",
      label: "Alinear plantas",
      detail:
        "No se encontraron suficientes coincidencias geométricas; se utilizó el centro de la vista.",
      action: "Ajustar alineación",
      panel: "levels",
      count: unregistered,
    });
  const layers =
    plan.cad?.layers.filter((l) => l.inferred && !l.reviewed).length ?? 0;
  if (layers)
    checks.push({
      id: "layers",
      label: "Confirmar capas propuestas",
      detail: "La función de estas capas se dedujo de su geometría.",
      action: "Revisar capas",
      panel: "layers",
      count: layers,
    });
  const symbols =
    (plan.reconstruction?.unresolvedSymbols ?? 0) +
    (plan.reconstruction?.unmatchedOpenings ?? 0);
  if (symbols)
    checks.push({
      id: "symbols",
      label: "Resolver símbolos",
      detail:
        "Hay grupos de mobiliario o aberturas sin representación asociada.",
      action: "Revisar símbolos",
      panel: "layers",
      count: symbols,
    });
  const skipped = Object.values(plan.cad?.skipped ?? {}).reduce(
    (n, c) => n + c,
    0,
  );
  const integrity = modelIntegrityIssues(plan);
  if (integrity.length)
    checks.push({
      id: "integrity",
      label: "Revisar conflictos geométricos",
      detail:
        "Hay muros o aberturas con dimensiones o relaciones incompatibles. Selecciona un elemento para ver su diagnóstico.",
      action: "Revisar geometría",
      panel: "layers",
      count: integrity.length,
    });
  if (skipped)
    checks.push({
      id: "skipped",
      label: "Revisar objetos no compatibles",
      detail: "Consulta qué entidades del archivo no pudieron incorporarse.",
      action: "Ver diagnóstico",
      panel: "layers",
      count: skipped,
    });
  return checks;
}
