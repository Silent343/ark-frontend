import { ValidationError } from "@/kernel/domain/resource";
import { planElements, planTopologyIssues } from "./plan-review";
import type { Blueprint } from "./entities/blueprint";
import { validModelEvidence } from "./model-evidence";
import { validRasterNeural } from "./raster-neural";
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
  // Apply the same trust boundary to page-local OCR and the legacy global review.
  const validateEvidence = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      invalid();
    const evidence = candidate as Record<string, unknown>;
    if (
      !["local-lines-v1", "manual-tracing", "neural-image-v1"].includes(
        String(evidence.method),
      )
    )
      invalid();
    if (
      !Array.isArray(evidence.warnings) ||
      evidence.warnings.length > 100 ||
      !evidence.warnings.every(
        (item) => typeof item === "string" && item.length <= 300,
      )
    )
      invalid();
    if (!Array.isArray(evidence.text) || evidence.text.length > 1000) invalid();
    for (const item of evidence.text as Record<string, unknown>[]) {
      if (
        !item ||
        typeof item.text !== "string" ||
        item.text.length > 200 ||
        !["pdf", "ocr", "cad"].includes(String(item.source))
      )
        invalid();
      for (const key of ["x", "y", "width", "height", "confidence"])
        number(item[key]);
      if (Number(item.confidence) < 0 || Number(item.confidence) > 100)
        invalid();
    }
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
    "roofs",
    "services",
    "routes",
    "sheets",
    "slabs",
  ];
  for (const key of collections) {
    const rows =
      value[key] ??
      (["stairs", "roofs", "services", "routes", "sheets", "slabs"].includes(
        key,
      )
        ? []
        : null);
    if (!Array.isArray(rows) || rows.length > 10000) invalid();
    if (key === "sheets" && (rows as unknown[]).length > 24) invalid();
    for (const item of rows as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) invalid();
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || !row.id || ids.has(row.id as string))
        invalid();
      ids.add(row.id as string);
      if (key === "levels") {
        number(row.elevation);
        if (row.height !== undefined) number(row.height, true);
        if (typeof row.name !== "string" || !row.name.trim()) invalid();
      } else if (key === "slabs") {
        number(row.thickness, true);
        if (
          Number(row.thickness) > 2 ||
          !Array.isArray(row.holes) ||
          row.holes.length > 200
        )
          invalid();
        for (const polygon of [row.polygon, ...(row.holes as unknown[])]) {
          if (
            !Array.isArray(polygon) ||
            polygon.length < 3 ||
            polygon.length > 10000
          )
            invalid();
          for (const point of polygon as unknown[]) {
            if (!Array.isArray(point) || point.length !== 2) invalid();
            (point as unknown[]).forEach((v) => number(v));
          }
        }
      } else if (key === "sheets") {
        if(row.analysisImage!==undefined && (typeof row.analysisImage!=='string'||row.analysisImage.length>4_200_000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(row.analysisImage)))invalid();
        if (
          !["architecture", "structure", "electrical", "plumbing"].includes(
            String(row.discipline),
          ) ||
          typeof row.name !== "string" ||
          !row.name.trim() ||
          row.name.length > 200 ||
          typeof row.sourceName !== "string" ||
          row.sourceName.length > 300 ||
          !Number.isInteger(row.page) ||
          Number(row.page) < 1 ||
          typeof row.image !== "string" ||
          row.image.length > 4_200_000 ||
          !/^data:image\/(png|jpeg|webp);base64,/.test(row.image)
        )
          invalid();
        for (const field of ["x", "y"]) number(row[field]);
        for (const field of ["width", "height", "metersPerUnit"])
          number(row[field], true);
        if (row.evidence !== undefined) validateEvidence(row.evidence);
        if (row.neural !== undefined && !validRasterNeural(row.neural))
          invalid();
      } else if (key === "walls") {
        for (const point of [row.start, row.end]) {
          if (!Array.isArray(point) || point.length !== 2) invalid();
          (point as unknown[]).forEach((v) => number(v));
        }
        number(row.thickness, true);
        number(row.height, true);
      } else if (key === "routes") {
        if (
          !["electrical", "plumbing"].includes(String(row.kind)) ||
          typeof row.fromId !== "string" ||
          typeof row.toId !== "string" ||
          row.fromId === row.toId
        )
          invalid();
      } else {
        number(row.x);
        number(row.y);
        if (key === "roofs") {
          if (
            typeof row.name !== "string" ||
            !row.name.trim() ||
            row.name.length > 100
          )
            invalid();
          for (const field of ["width", "depth", "thickness", "elevation"])
            number(row[field], true);
          if (Number(row.thickness) > 2 || Number(row.elevation) > 100)
            invalid();
        }
        if (key === "services") {
          if (
            !["outlet", "switch", "light", "panel", "water", "drain"].includes(
              String(row.kind),
            ) ||
            typeof row.name !== "string" ||
            !row.name.trim() ||
            row.name.length > 100
          )
            invalid();
        }
        if (key === "rooms") {
          number(row.width, true);
          number(row.height, true);
          number(row.area);
          if (typeof row.name !== "string") invalid();
          if (row.polygon !== undefined || row.holes !== undefined) {
            if (!Array.isArray(row.holes) || row.holes.length > 32) invalid();
            for (const ring of [row.polygon, ...(row.holes as unknown[])]) {
              if (!Array.isArray(ring) || ring.length < 3 || ring.length > 256) invalid();
              for (const p of ring as unknown[]) {
                if (!Array.isArray(p) || p.length !== 2) invalid();
                (p as unknown[]).forEach(v => number(v));
              }
            }
          }
        }
        if (key === "doors" || key === "windows") {
          number(row.width, true);
          number(row.rotation);
          if (row.height !== undefined) number(row.height, true);
          if (row.sillHeight !== undefined) {
            number(row.sillHeight);
            if (Number(row.sillHeight) < 0) invalid();
          }
          if (
            !(value.walls as { id: string }[]).some((w) => w.id === row.wallId)
          )
            invalid();
        }
        if (key === "columns") {
          number(row.size, true);
          for (const field of ["depth", "height"])
            if (row[field] !== undefined) number(row[field], true);
          if (row.rotation !== undefined) number(row.rotation);
        }
        if (key === "stairs") {
          number(row.radius, true);
          if (row.rise !== undefined) number(row.rise, true);
          if (row.baseElevation !== undefined) number(row.baseElevation);
          if (
            row.stepCount !== undefined &&
            (!Number.isInteger(row.stepCount) ||
              Number(row.stepCount) < 1 ||
              Number(row.stepCount) > 200)
          )
            invalid();
          if (row.type !== "spiral" && row.type !== "straight") invalid();
          if (row.type === "straight") {
            number(row.length, true);
            number(row.rotation);
          }
        }
      }
    }
  }
  if (!(value.levels as unknown[]).length) invalid();
  if (!validModelEvidence(value as unknown as Blueprint)) invalid();
  const levelIds = new Set(
    (value.levels as { id: string }[]).map((level) => level.id),
  );
  const sheets = (value.sheets ?? []) as {
    id: string;
    levelId: string;
    discipline: string;
  }[];
  const sheetIds = new Set(sheets.map((sheet) => sheet.id));
  const firstLevelId = (
    (value.levels as { id: string; elevation: number }[]).find(
      (level) => level.elevation === 0,
    ) ?? (value.levels as { id: string }[])[0]
  ).id;
  for (const key of collections.filter((item) => item !== "levels")) {
    for (const row of (value[key] ?? []) as Record<string, unknown>[]) {
      if (
        (row.levelId !== undefined ||
          ["sheets", "roofs", "services", "slabs"].includes(key)) &&
        (typeof row.levelId !== "string" || !levelIds.has(row.levelId))
      )
        invalid();
      if (key !== "sheets" && row.sheetId !== undefined) {
        if (typeof row.sheetId !== "string" || !sheetIds.has(row.sheetId))
          invalid();
        const sheet = sheets.find((item) => item.id === row.sheetId)!;
        if (sheet.levelId !== (row.levelId ?? firstLevelId)) invalid();
        if (
          key === "services" &&
          (["water", "drain"].includes(String(row.kind))
            ? sheet.discipline !== "plumbing"
            : sheet.discipline !== "electrical")
        )
          invalid();
        if (key === "routes" && sheet.discipline !== row.kind) invalid();
      }
      if (key === "doors" || key === "windows") {
        const wall = (value.walls as { id: string; levelId?: string }[]).find(
          (item) => item.id === row.wallId,
        );
        if (
          !wall ||
          (row.levelId ?? firstLevelId) !== (wall.levelId ?? firstLevelId)
        )
          invalid();
      }
    }
  }
  const services = new Map(
    (
      (value.services ?? []) as Array<{
        id: string;
        levelId: string;
        kind: string;
      }>
    ).map((item) => [item.id, item]),
  );
  const routePairs = new Set<string>();
  for (const route of (value.routes ?? []) as Array<{
    levelId: string;
    kind: string;
    fromId: string;
    toId: string;
  }>) {
    const from = services.get(route.fromId);
    const to = services.get(route.toId);
    const serviceKind = (kind: string) =>
      ["water", "drain"].includes(kind) ? "plumbing" : "electrical";
    if (
      !from ||
      !to ||
      from.levelId !== route.levelId ||
      to.levelId !== route.levelId ||
      serviceKind(from.kind) !== route.kind ||
      serviceKind(to.kind) !== route.kind
    )
      invalid();
    const pair = [route.fromId, route.toId].sort().join("|");
    if (routePairs.has(pair)) invalid();
    routePairs.add(pair);
  }
  if (value.sourceSize !== undefined) {
    const size = value.sourceSize as Record<string, unknown>;
    if (!size || typeof size !== "object") invalid();
    number(size.width, true);
    number(size.height, true);
  }
  if (value.calibration !== undefined) {
    const calibration = value.calibration as Record<string, unknown>;
    if (!calibration || typeof calibration !== "object") invalid();
    number(calibration.metersPerUnit, true);
    number(calibration.referenceDistanceM, true);
    const points = calibration.referencePoints;
    if (!Array.isArray(points) || points.length !== 2) invalid();
    for (const point of points as unknown[]) {
      if (!Array.isArray(point) || point.length !== 2) invalid();
      (point as unknown[]).forEach((v) => number(v));
    }
    const [a, b] = points as [[number, number], [number, number]];
    const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (
      distance < 10 ||
      Math.abs(
        distance * Number(calibration.metersPerUnit) -
          Number(calibration.referenceDistanceM),
      ) > 0.001
    )
      invalid();
  }
  if (value.review !== undefined) {
    const review = value.review as Record<string, unknown>;
    if (
      !review ||
      typeof review !== "object" ||
      !["draft", "reviewed"].includes(String(review.status))
    )
      invalid();
    validateEvidence(review);
    if (
      typeof review.sourceName !== "string" ||
      review.sourceName.length > 300 ||
      !Number.isInteger(review.page) ||
      Number(review.page) < 1
    )
      invalid();
    if (
      !Array.isArray(review.reviewedIds) ||
      review.reviewedIds.length > 10000 ||
      new Set(review.reviewedIds).size !== review.reviewedIds.length ||
      !review.reviewedIds.every((id) => typeof id === "string" && ids.has(id))
    )
      invalid();
    const plan = value as unknown as Blueprint;
    const geometryIds = new Set(planElements(plan).map((item) => item.id));
    if (!(review.reviewedIds as string[]).every((id) => geometryIds.has(id)))
      invalid();
    if (
      review.status === "reviewed" &&
      (!value.calibration ||
        !geometryIds.size ||
        (review.reviewedIds as string[]).length !== geometryIds.size ||
        planTopologyIssues(plan).length)
    )
      invalid();
  }
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
