import type { FixtureKind } from "./cad-evidence";

/** Original procedural families. IDs are stable across reconstruction and exports. */
export const FIXTURE_FAMILIES = [
  { id: "chair-standard", kind: "chair", label: "Silla de cuatro patas" },
  { id: "chair-auditorium", kind: "chair", label: "Butaca de auditorio" },
  { id: "chair-office", kind: "chair", label: "Silla de oficina" },
  { id: "table-rectangular", kind: "table", label: "Mesa rectangular" },
  { id: "table-round", kind: "table", label: "Mesa redonda / ovalada" },
  { id: "sofa-two", kind: "sofa", label: "Sofá de dos plazas" },
  { id: "sofa-three", kind: "sofa", label: "Sofá de tres plazas" },
  { id: "bed-single", kind: "bed", label: "Cama individual" },
  { id: "bed-double", kind: "bed", label: "Cama doble" },
  { id: "toilet-floor", kind: "toilet", label: "Inodoro de piso con cisterna" },
  { id: "toilet-wall", kind: "toilet", label: "Inodoro suspendido" },
  { id: "sink-vanity", kind: "sink", label: "Lavabo con mueble" },
  { id: "sink-pedestal", kind: "sink", label: "Lavabo con pedestal" },
  { id: "sink-wall", kind: "sink", label: "Lavabo mural" },
  { id: "cabinet-base", kind: "cabinet", label: "Mueble bajo" },
  { id: "cabinet-tall", kind: "cabinet", label: "Armario alto" },
  { id: "bench-timber", kind: "bench", label: "Banco de listones" },
  { id: "bathtub-inset", kind: "bathtub", label: "Bañera empotrada" },
  { id: "bathtub-free", kind: "bathtub", label: "Bañera exenta" },
  {
    id: "fireplace-built-in",
    kind: "fireplace",
    label: "Chimenea de interior",
  },
  { id: "chimney-masonry", kind: "chimney", label: "Conducto de chimenea" },
  {
    id: "equipment-generic",
    kind: "equipment",
    label: "Equipo sin tipo confirmado",
  },
  { id: "plant-potted", kind: "plant", label: "Planta en maceta" },
  { id: "vehicle-compact", kind: "vehicle", label: "Vehículo compacto" },
] as const satisfies ReadonlyArray<{
  id: string;
  kind: FixtureKind;
  label: string;
}>;
export type FixtureFamilyId = (typeof FIXTURE_FAMILIES)[number]["id"];
export type FixtureFamily = (typeof FIXTURE_FAMILIES)[number];
export interface FixtureFamilyAssignment {
  familyId: FixtureFamilyId;
  finish: "natural" | "light" | "dark";
  /** Metres above the element's own level, independent of plan units. */
  elevationM: number;
}
export type FixtureFamilyAssignments = Record<string, FixtureFamilyAssignment>;
const NAME_HINTS: ReadonlyArray<[FixtureFamilyId, RegExp]> = [
  ["chair-auditorium", /butaca|auditorio|auditorium/],
  ["chair-office", /oficina|office|task chair/],
  ["table-round", /redonda|ovalada|round|oval/],
  ["sofa-three", /3\s*(plazas|seats)|tres plazas|three seat/],
  ["bed-double", /doble|matrimonial|double|queen|king/],
  ["toilet-wall", /suspendido|wall.hung/],
  ["sink-pedestal", /pedestal/],
  ["sink-wall", /mural|wall.mounted/],
  ["cabinet-tall", /armario|closet|wardrobe|alto|tall/],
  ["bathtub-free", /exenta|freestanding/],
];

export function familyForFixture(
  fixture: { id: string; kind?: FixtureKind; name?: string },
  assignments?: FixtureFamilyAssignments,
): FixtureFamily | undefined {
  const selection = assignments?.[fixture.id];
  const name = (fixture.name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const hint = NAME_HINTS.find(
    ([id, pattern]) =>
      pattern.test(name) &&
      FIXTURE_FAMILIES.some((f) => f.id === id && f.kind === fixture.kind),
  );
  return (
    FIXTURE_FAMILIES.find(
      (f) => f.id === selection?.familyId && f.kind === fixture.kind,
    ) ??
    FIXTURE_FAMILIES.find((f) => f.id === hint?.[0]) ??
    FIXTURE_FAMILIES.find((f) => f.kind === fixture.kind)
  );
}

export function validFamilyAssignment(
  value: unknown,
): value is FixtureFamilyAssignment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).every((k) =>
      ["familyId", "finish", "elevationM"].includes(k),
    ) &&
    FIXTURE_FAMILIES.some((f) => f.id === v.familyId) &&
    ["natural", "light", "dark"].includes(String(v.finish)) &&
    typeof v.elevationM === "number" &&
    Number.isFinite(v.elevationM) &&
    v.elevationM >= 0 &&
    v.elevationM <= 10
  );
}
