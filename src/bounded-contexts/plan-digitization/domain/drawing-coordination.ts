import type { Blueprint } from "./entities/blueprint";
import { cadEntityBounds } from "./cad-operations";
import { modelIntegrityIssues } from "./model-integrity";

export type DrawingView =
  "plan" | "section" | "elevation" | "schedule" | "detail";
export type DrawingProperty = "height" | "sillHeight";
export interface DrawingCorrespondence {
  id: string;
  source: {
    kind: "cad" | "sheet";
    viewId: string;
    textId: string;
    signature: string;
  };
  targetId: string;
  targetSignature: string;
  property: DrawingProperty;
  valueM: number;
  quote: string;
  confirmedAt: string;
}
export const drawingViewLabels: Record<DrawingView, string> = {
  plan: "Planta",
  section: "Corte",
  elevation: "Elevación",
  schedule: "Cuadro",
  detail: "Detalle",
};

// Change detection only, not a cryptographic authenticity or security check.
function fingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `v1-${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

export function correspondenceTargets(plan: Blueprint) {
  return [
    ...plan.walls.map((e, i) => ({
      ...e,
      category: "wall" as const,
      label: `Muro ${i + 1}`,
    })),
    ...plan.doors.map((e, i) => ({
      ...e,
      category: "door" as const,
      label: `Puerta ${i + 1}`,
    })),
    ...plan.windows.map((e, i) => ({
      ...e,
      category: "window" as const,
      label: `Ventana ${i + 1}`,
    })),
    ...plan.columns.map((e, i) => ({
      ...e,
      category: "column" as const,
      label: `Columna ${i + 1}`,
    })),
  ];
}

function signatureForTarget(
  plan: Blueprint,
  target: ReturnType<typeof correspondenceTargets>[number],
) {
  const level = plan.levels.find((l) => l.id === target.levelId);
  return fingerprint([
    target,
    level,
    plan.calibration?.metersPerUnit,
    plan.elementEvidence?.[target.id],
  ]);
}
export function targetSignature(plan: Blueprint, id: string) {
  const target = correspondenceTargets(plan).find((e) => e.id === id);
  return target ? signatureForTarget(plan, target) : undefined;
}

export function drawingTextSources(plan: Blueprint) {
  const sources: Array<{
    kind: "cad" | "sheet";
    viewId: string;
    textId: string;
    view: DrawingView;
    label: string;
    text: string;
    signature: string;
  }> = [];
  for (const region of plan.cad?.regions ?? []) {
    if (!region.viewType || region.viewType === "plan") continue;
    for (const e of plan.cad!.entities) {
      if (e.kind !== "text") continue;
      const b = cadEntityBounds(e),
        x = (b.minX + b.maxX) / 2,
        y = (b.minY + b.maxY) / 2;
      if (
        x < region.minX ||
        x > region.maxX ||
        y < region.minY ||
        y > region.maxY
      )
        continue;
      sources.push({
        kind: "cad",
        viewId: region.id,
        textId: e.id,
        view: region.viewType,
        label: `${region.name} · ${plan.cad!.sourceName}`,
        text: e.value,
        signature: fingerprint([
          plan.cad!.sourceName,
          plan.cad!.metersPerCadUnit,
          region,
          e,
        ]),
      });
    }
  }
  for (const sheet of plan.sheets ?? []) {
    if (!sheet.viewType || sheet.viewType === "plan") continue;
    const sheetSignature = fingerprint([
      sheet.id,
      sheet.sourceName,
      sheet.page,
      sheet.viewType,
      sheet.image,
    ]);
    for (const [index, line] of (sheet.evidence?.text ?? []).entries()) {
      sources.push({
        kind: "sheet",
        viewId: sheet.id,
        textId: String(index),
        view: sheet.viewType,
        label: `${sheet.name} · pág. ${sheet.page}`,
        text: line.text,
        signature: fingerprint([sheetSignature, line]),
      });
    }
  }
  return sources;
}

/** Only explicitly labelled metric heights are suggested; an arbitrary number is never a height. */
export function dimensionProposals(
  text: string,
): Array<{ property: DrawingProperty; valueM: number }> {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const result: Array<{ property: DrawingProperty; valueM: number }> = [];
  const pattern =
    /\b(ALTURA(?:\s+LIBRE)?|ALTO|H|ANTEPECHO|ALFEIZAR)\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*(MM|CM|M)\b/g;
  for (const m of normalized.matchAll(pattern)) {
    const property = /ANTEPECHO|ALFEIZAR/.test(m[1]) ? "sillHeight" : "height";
    const valueM =
      Number(m[2].replace(",", ".")) *
      (m[3] === "MM" ? 0.001 : m[3] === "CM" ? 0.01 : 1);
    if (
      Number.isFinite(valueM) &&
      valueM <= 100 &&
      (valueM > 0 || property === "sillHeight")
    )
      result.push({ property, valueM });
  }
  return result;
}

/** Persisted assertions may outlive a deleted view; unresolved ones remain visible and never apply. */
export function validDrawingCorrespondences(plan: Blueprint) {
  const records = plan.correspondences;
  if (records === undefined) return true;
  if (!Array.isArray(records) || records.length > 2000) return false;
  const ids = new Set<string>();
  const string = (s: unknown, max: number) =>
    typeof s === "string" && s.length > 0 && s.length <= max;
  return records.every((r) => {
    if (!r || typeof r !== "object" || !string(r.id, 150) || ids.has(r.id))
      return false;
    ids.add(r.id);
    return (
      r.source &&
      ["cad", "sheet"].includes(r.source.kind) &&
      string(r.source.viewId, 150) &&
      string(r.source.textId, 150) &&
      typeof r.source.signature === "string" &&
      /^v1-[\da-f]{16}$/.test(r.source.signature) &&
      typeof r.targetSignature === "string" &&
      /^v1-[\da-f]{16}$/.test(r.targetSignature) &&
      string(r.targetId, 150) &&
      string(r.quote, 200) &&
      ["height", "sillHeight"].includes(r.property) &&
      Number.isFinite(r.valueM) &&
      r.valueM <= 100 &&
      (r.valueM > 0 || (r.property === "sillHeight" && r.valueM === 0)) &&
      string(r.confirmedAt, 40) &&
      Number.isFinite(Date.parse(r.confirmedAt))
    );
  });
}

export type CorrespondenceResult = {
  id: string;
  status: "applied" | "stale" | "conflict" | "incompatible";
  detail: string;
};
/** Derived geometry only. Never mutate/save over the detector's output, so stale evidence can be removed safely. */
export function resolveDrawingCorrespondences(base: Blueprint): {
  plan: Blueprint;
  results: CorrespondenceResult[];
} {
  if (!base.correspondences?.length) return { plan: base, results: [] };
  if (!validDrawingCorrespondences(base)) return { plan: base, results: [] };
  const sources = new Map(
    drawingTextSources(base).map((s) => [
      `${s.kind}:${s.viewId}:${s.textId}`,
      s,
    ]),
  );
  const targets = new Map(correspondenceTargets(base).map((t) => [t.id, t]));
  const signatures = new Map<string, string>();
  const results: CorrespondenceResult[] = [];
  const eligible: DrawingCorrespondence[] = [];
  for (const r of base.correspondences) {
    const s = sources.get(
        `${r.source.kind}:${r.source.viewId}:${r.source.textId}`,
      ),
      t = targets.get(r.targetId);
    if (t && !signatures.has(t.id))
      signatures.set(t.id, signatureForTarget(base, t));
    if (
      !s ||
      !t ||
      s.signature !== r.source.signature ||
      signatures.get(t.id) !== r.targetSignature ||
      s.text !== r.quote
    ) {
      results.push({
        id: r.id,
        status: "stale",
        detail:
          "La fuente o el elemento cambió. Vuelve a confirmar la correspondencia.",
      });
    } else if (base.cad ? !base.cad.unitConfirmed : !base.calibration) {
      results.push({
        id: r.id,
        status: "incompatible",
        detail: "Confirma primero las unidades y la escala del plano.",
      });
    } else if (r.property === "sillHeight" && t.category !== "window") {
      results.push({
        id: r.id,
        status: "incompatible",
        detail: "El antepecho solo se aplica a ventanas.",
      });
    } else eligible.push(r);
  }
  const conflicts = new Set<string>(),
    ranges = new Map<string, { min: number; max: number }>();
  for (const r of eligible) {
    const key = JSON.stringify([r.targetId, r.property]),
      previous = ranges.get(key);
    const range = {
      min: Math.min(previous?.min ?? r.valueM, r.valueM),
      max: Math.max(previous?.max ?? r.valueM, r.valueM),
    };
    ranges.set(key, range);
    if (range.max - range.min > 0.001) conflicts.add(r.targetId);
  }
  const accepted = eligible.filter((r) => !conflicts.has(r.targetId));
  let plan = {
    ...base,
    walls: base.walls.map((e) => ({ ...e })),
    doors: base.doors.map((e) => ({ ...e })),
    windows: base.windows.map((e) => ({ ...e })),
    columns: base.columns.map((e) => ({ ...e })),
  };
  const editable = new Map(
    [...plan.walls, ...plan.doors, ...plan.windows, ...plan.columns].map(
      (e) => [e.id, e],
    ),
  );
  for (const r of accepted)
    Object.assign(editable.get(r.targetId)!, { [r.property]: r.valueM });
  const openings = new Map(
    [...base.doors, ...base.windows].map((e) => [e.id, e]),
  );
  const unsafeTargets = new Set<string>();
  for (const issue of modelIntegrityIssues(plan)) {
    unsafeTargets.add(issue.id);
    const opening = openings.get(issue.id);
    if (opening) unsafeTargets.add(opening.wallId);
  }
  // If one assertion breaks a host group, revert every assertion in that group together.
  for (const r of accepted) {
    const opening = openings.get(r.targetId);
    if (opening && unsafeTargets.has(opening.wallId))
      unsafeTargets.add(r.targetId);
  }
  const revert = <T extends { id: string }>(items: T[], original: T[]) => {
    const originals = new Map(original.map((e) => [e.id, e]));
    return items.map((e) =>
      unsafeTargets.has(e.id) ? originals.get(e.id)! : e,
    );
  };
  plan = {
    ...plan,
    walls: revert(plan.walls, base.walls),
    doors: revert(plan.doors, base.doors),
    windows: revert(plan.windows, base.windows),
    columns: revert(plan.columns, base.columns),
  };
  for (const r of eligible)
    results.push({
      id: r.id,
      status: conflicts.has(r.targetId)
        ? "conflict"
        : unsafeTargets.has(r.targetId)
          ? "incompatible"
          : "applied",
      detail: conflicts.has(r.targetId)
        ? "Las fuentes indican valores distintos. Resuelve la discrepancia."
        : unsafeTargets.has(r.targetId)
          ? "La medida no cabe en el muro anfitrión. Revisa alturas y antepecho."
          : "Medida confirmada desde una vista vinculada.",
    });
  return { plan, results };
}
