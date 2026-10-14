import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const referenceName = (name) =>
  name.replace(/\\/g, "/").split("/").at(-1).normalize("NFC").toLowerCase();
export const normalized = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Hints are audit evidence, not approved class labels. */
export function classHint(name) {
  const n = normalized(name);
  if (
    /demol|existente|cota|texto|text|hatch|ejes|proyec|leyenda|legend|titulo|notas generales/.test(
      n,
    )
  )
    return null;
  const rules = [
    ["toilet", /inodoro|water.?closet|\bwc\b/],
    ["sink", /lavaman|lavator|lavadero/],
    ["chair", /silla|butaca|\bchairs?\b/],
    ["table", /mesa(?:\b|_)|\btables?\b/],
    ["sofa", /sofa|sillon/],
    ["bed", /cama(?:\b|_)/],
    ["panel", /tablero|(?:electr|tierra).*gabinete/],
    ["cabinet", /armario|gabinete/],
    ["column", /columna|pilar/],
    ["joist", /vigueta/],
    ["beam", /viga|\bbeam\b/],
    ["footing", /zapata|cimiento|footing/],
    ["wall", /muro|tabiq|wall/],
    ["door", /puerta|door/],
    ["window", /ventana|window|(?:^|[_$ -])vent(?:[_$ -]|$)/],
    ["stair", /escalera|stair/],
    ["valve", /valvula|llave de paso/],
    ["drain_fixture", /sumidero/],
    ["pump", /bomba|\bpump\b/],
    ["drain", /desague|alcantarill|drain/],
    ["water", /agua|water.?supply/],
    ["light", /luminaria|lighting/],
    ["switch", /interruptor/],
    ["outlet", /tomacorriente/],
  ];
  return rules.find(([, rule]) => rule.test(n))?.[0] ?? null;
}

export function disciplineHint(name) {
  const n = normalized(name);
  if (/desague/.test(n)) return "sanitary-drain";
  if (/\biiss\b|agua/.test(n)) return "sanitary-water-or-details";
  if (/^est\b|estructur/.test(n)) return "structural";
  if (/iluminacion/.test(n)) return "lighting";
  if (/arq|base_bblarco/.test(n)) return "architectural";
  return "unknown";
}

export function unitEvidence(code) {
  const names = {
    0: "unspecified",
    1: "inch",
    2: "foot",
    4: "millimetre",
    5: "centimetre",
    6: "metre",
    7: "kilometre",
  };
  const factors = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 7: 1000 };
  return {
    code: Number.isInteger(code) ? code : null,
    declared: names[code] ?? "other-or-unavailable",
    suggestedMetresPerUnit: factors[code] ?? null,
    confirmed: false,
  };
}

export function inventory(inputs) {
  const files = new Map();
  function visit(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return; // Never follow links outside the selected package.
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(file).sort())
        visit(path.join(file, child));
    } else if (stat.isFile() && /\.dwg$/i.test(file)) {
      const absolute = fs.realpathSync(file);
      files.set(absolute, {
        path: absolute,
        name: path.basename(file),
        bytes: stat.size,
        hash: sha256(fs.readFileSync(file)),
      });
    }
  }
  for (const input of inputs) visit(path.resolve(input));
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Duplicate basenames with differing content must never be resolved arbitrarily. */
export function referenceIndex(files) {
  const index = new Map();
  for (const file of files) {
    const key = referenceName(file.name),
      matches = index.get(key) ?? [];
    matches.push(file);
    index.set(key, matches);
  }
  return index;
}
export function resolveSelectedReference(index, name) {
  const matches = index.get(referenceName(name)) ?? [];
  return new Set(matches.map((f) => f.hash)).size === 1
    ? matches[0]
    : undefined;
}

export function entityBounds(e) {
  if (e.kind === "path") {
    const result = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < e.points.length; i += 2) {
      result[0] = Math.min(result[0], e.points[i]);
      result[1] = Math.min(result[1], e.points[i + 1]);
      result[2] = Math.max(result[2], e.points[i]);
      result[3] = Math.max(result[3], e.points[i + 1]);
    }
    return result;
  }
  const r = e.kind === "circle" ? e.radius : Math.max(e.height ?? 0, 0.001);
  return [e.x - r, e.y - r, e.x + r, e.y + r];
}
export function combinedBounds(shapes) {
  const result = [Infinity, Infinity, -Infinity, -Infinity];
  for (const shape of shapes) {
    const b = entityBounds(shape);
    result[0] = Math.min(result[0], b[0]);
    result[1] = Math.min(result[1], b[1]);
    result[2] = Math.max(result[2], b[2]);
    result[3] = Math.max(result[3], b[3]);
  }
  return result.every(Number.isFinite) ? result : [0, 0, 1, 1];
}
export const intersects = (a, b) =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** Only named block instances become symbol proposals; layer paths are not entire objects. */
export function blockProposals(shapes) {
  const groups = new Map();
  for (const shape of shapes) {
    if (!shape.group || !shape.blockName || shape.kind === "text") continue;
    const group = groups.get(shape.group) ?? {
      name: shape.blockName,
      members: [],
    };
    group.members.push(shape);
    groups.set(shape.group, group);
  }
  return [...groups.entries()].flatMap(([id, group]) => {
    const hint = classHint(group.name);
    if (!hint) return [];
    const bbox = combinedBounds(group.members);
    if (!(bbox[2] > bbox[0] && bbox[3] > bbox[1])) return [];
    return [
      {
        id,
        class: hint,
        bbox,
        evidence: {
          kind: "block-name-rule",
          name: group.name,
          entityIds: group.members.map((e) => e.id),
        },
        status: "proposed",
        reviewed: false,
      },
    ];
  });
}
