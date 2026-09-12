import { ValidationError } from "@/kernel/domain/resource";
/** Validates shared geometry before any client can consume it in the 2D or WebGL renderer. */
export function validateSharedBlueprint(value: Record<string, unknown>) {
  const invalid = () => {
    throw new ValidationError("Invalid semantic plan geometry.");
  };
  const number = (v: unknown, positive = false) => {
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      Math.abs(v) > 100000 ||
      (positive && v <= 0)
    )
      invalid();
  };
  const ids = new Set<string>();
  const collections = [
    "levels",
    "rooms",
    "walls",
    "doors",
    "windows",
    "columns",
    "stairs",
  ];
  for (const key of collections) {
    const rows = value[key] ?? (key === "stairs" ? [] : null);
    if (!Array.isArray(rows) || rows.length > 10000) invalid();
    for (const item of rows as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) invalid();
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || !row.id || ids.has(row.id as string))
        invalid();
      ids.add(row.id as string);
      if (key === "levels") {
        number(row.elevation);
        if (typeof row.name !== "string") invalid();
      } else if (key === "walls") {
        for (const point of [row.start, row.end]) {
          if (!Array.isArray(point) || point.length !== 2) invalid();
          (point as unknown[]).forEach((v) => number(v));
        }
        number(row.thickness, true);
        number(row.height, true);
      } else {
        number(row.x);
        number(row.y);
        if (key === "rooms") {
          number(row.width, true);
          number(row.height, true);
          number(row.area);
          if (typeof row.name !== "string") invalid();
        }
        if (key === "doors" || key === "windows") {
          number(row.width, true);
          number(row.rotation);
          if (
            !(value.walls as { id: string }[]).some((w) => w.id === row.wallId)
          )
            invalid();
        }
        if (key === "columns") number(row.size, true);
        if (key === "stairs") number(row.radius, true);
      }
    }
  }
  if (!(value.levels as unknown[]).length) invalid();
  if (
    !Array.isArray(value.materials) ||
    !value.materials.every((v) => typeof v === "string")
  )
    invalid();
  const seismic = value.seismic as Record<string, unknown>;
  if (!seismic || typeof seismic !== "object") invalid();
  for (const key of [
    "defaultIntensity",
    "defaultDuration",
    "maxDisplacement",
    "maxDrift",
  ])
    number(seismic[key]);
  if (typeof seismic.defaultDirection !== "string") invalid();
  if (
    value.sourceImage !== undefined &&
    (typeof value.sourceImage !== "string" ||
      (!value.sourceImage.startsWith("/sources/") &&
        !/^data:image\/(png|jpeg|webp);base64,/.test(value.sourceImage)))
  )
    invalid();
}
