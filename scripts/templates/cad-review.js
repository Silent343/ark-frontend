// Standalone, offline review workspace. No uploads, remote fonts or third-party scripts.
const batch = JSON.parse(document.getElementById("batch").textContent);
const el = (id) => document.getElementById(id),
  canvas = el("canvas"),
  ctx = canvas.getContext("2d");
let current = 0,
  selected = null,
  scale = 1,
  origin = [0, 0],
  vertices = [],
  pointer = null,
  serial = 0;
const task = () => batch.tasks[current];
function feedback(message) {
  el("feedback").textContent = message;
}
for (const [i, t] of batch.tasks.entries()) {
  const option = document.createElement("option");
  option.value = i;
  option.textContent = t.title;
  el("task").append(option);
}
function point(event) {
  const r = canvas.getBoundingClientRect();
  return [
    (event.clientX - r.left - origin[0]) / scale,
    -(event.clientY - r.top - origin[1]) / scale,
  ];
}
const screen = (p) => [origin[0] + p[0] * scale, origin[1] - p[1] * scale];
function fit() {
  const t = task();
  if (!t) return;
  const [x0, y0, x1, y1] = t.crop,
    r = canvas.getBoundingClientRect();
  scale = Math.min((r.width - 32) / (x1 - x0), (r.height - 32) / (y1 - y0));
  origin = [
    r.width / 2 - ((x0 + x1) / 2) * scale,
    r.height / 2 + ((y0 + y1) / 2) * scale,
  ];
  draw();
}
function trace(points, closed = false) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = screen(p);
    if (!i) ctx.moveTo(...s);
    else ctx.lineTo(...s);
  });
  if (closed) ctx.closePath();
  ctx.stroke();
}
function draw() {
  const t = task();
  if (!t) return;
  const r = canvas.getBoundingClientRect(),
    dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.lineWidth = 0.8;
  for (const s of t.shapes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    if (s.kind === "path") {
      const points = [];
      for (let i = 0; i < s.points.length; i += 2)
        points.push([s.points[i], s.points[i + 1]]);
      trace(points, s.closed);
    } else if (s.kind === "circle") {
      const p = screen([s.x, s.y]);
      ctx.beginPath();
      ctx.arc(...p, s.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const h = s.height * scale;
      if (h < 4 || h > 100) continue;
      const p = screen([s.x, s.y]);
      ctx.save();
      ctx.translate(...p);
      ctx.rotate(-s.rotation);
      ctx.font = h + "px system-ui";
      ctx.fillText(s.value, 0, 0);
      ctx.restore();
    }
  }
  for (const object of [...t.proposals, ...t.annotations]) {
    const isProposal = object.status === "proposed";
    ctx.lineWidth = object.id === selected ? 3 : 1.5;
    ctx.strokeStyle = isProposal ? "#c1780c" : "#087f6a";
    ctx.setLineDash(isProposal ? [5, 4] : []);
    if (object.points) trace(object.points, object.geometry === "polygon");
    else {
      const [x0, y0, x1, y1] = object.bbox;
      const p = screen([x0, y1]);
      ctx.strokeRect(...p, (x1 - x0) * scale, (y1 - y0) * scale);
    }
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "#087f6a";
  trace(vertices);
  for (const v of vertices) {
    const p = screen(v);
    ctx.fillStyle = "#087f6a";
    ctx.fillRect(p[0] - 3, p[1] - 3, 6, 6);
  }
}
function list() {
  const t = task();
  el("list").replaceChildren();
  for (const o of [...t.proposals, ...t.annotations]) {
    const button = document.createElement("button");
    button.textContent =
      (o.status === "proposed" ? "Propuesta · " : "Anotación · ") +
      o.class +
      (o.id === selected ? " ✓" : "");
    button.onclick = () => {
      selected = o.id;
      el("class").value = o.class;
      list();
      draw();
    };
    el("list").append(button);
  }
  el("stats").textContent =
    t.proposals.length +
    " propuestas · " +
    t.annotations.length +
    " anotaciones · " +
    t.shapeCount +
    " entidades del recorte" +
    (t.previewTruncated
      ? " · vista parcial: superar límite de 6000 entidades requiere otro recorte"
      : "");
}
function load() {
  const t = task();
  if (!t) {
    feedback("No hay recortes aptos: consulta los bloqueos del informe.");
    return;
  }
  selected = null;
  vertices = [];
  el("class").replaceChildren();
  for (const c of t.allowedClasses) {
    const option = document.createElement("option");
    option.textContent = c;
    option.value = c;
    el("class").append(option);
  }
  el("source").textContent =
    t.sourceName +
    " · unidades declaradas: " +
    t.units.declared +
    " (sin validar) · recorte propuesto, no planta completa";
  el("annotator").value = t.annotator;
  el("reviewer").value = t.reviewer;
  el("notes").value = t.notes;
  el("view").value = t.viewType;
  el("cropChecked").checked = t.cropConfirmed;
  el("units").value = t.calibration?.metresPerCadUnit ?? "";
  list();
  fit();
}
function addAnnotation(geometry, points) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]),
    bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  if (bbox[0] === bbox[2] && bbox[1] === bbox[3]) return;
  const o = {
    id: "manual-" + Date.now() + "-" + serial++,
    class: el("class").value,
    geometry,
    points,
    bbox,
    status: "annotated-not-reviewed",
    reviewed: false,
    evidence: { kind: "human-drawing" },
  };
  task().annotations.push(o);
  selected = o.id;
  vertices = [];
  list();
  draw();
  feedback("Anotación añadida al borrador; falta revisión independiente.");
}
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointer = {
    start: [e.clientX, e.clientY],
    world: point(e),
    origin: [...origin],
    moved: false,
  };
  if (["polygon", "polyline"].includes(el("mode").value)) {
    vertices.push(point(e));
    draw();
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!pointer) return;
  const dx = e.clientX - pointer.start[0],
    dy = e.clientY - pointer.start[1];
  pointer.moved ||= Math.hypot(dx, dy) > 3;
  if (el("mode").value === "pan") {
    origin = [pointer.origin[0] + dx, pointer.origin[1] + dy];
    draw();
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (!pointer) return;
  if (el("mode").value === "box" && pointer.moved) {
    const a = pointer.world,
      b = point(e);
    addAnnotation("polygon", [a, [b[0], a[1]], b, [a[0], b[1]]]);
  } else if (el("mode").value === "pan" && !pointer.moved) {
    const p = point(e);
    const hit = [...task().annotations, ...task().proposals]
      .filter(
        (o) =>
          p[0] >= o.bbox[0] &&
          p[0] <= o.bbox[2] &&
          p[1] >= o.bbox[1] &&
          p[1] <= o.bbox[3],
      )
      .sort(
        (a, b) =>
          (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) -
          (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]),
      )[0];
    selected = hit?.id ?? null;
    if (hit) el("class").value = hit.class;
    list();
    draw();
  }
  pointer = null;
});
canvas.addEventListener("pointercancel", () => {
  pointer = null;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = point(e),
      pos = screen(p);
    const next = scale * Math.exp(-e.deltaY * 0.001);
    if (next < 1e-6 || next > 1e7) return;
    scale = next;
    origin = [pos[0] - p[0] * scale, pos[1] + p[1] * scale];
    draw();
  },
  { passive: false },
);
el("task").onchange = () => {
  current = Number(el("task").value);
  feedback("");
  load();
};
el("fit").onclick = fit;
el("finish").onclick = () => {
  const mode = el("mode").value;
  if (
    (mode === "polygon" && vertices.length >= 3) ||
    (mode === "polyline" && vertices.length >= 2)
  )
    addAnnotation(mode, [...vertices]);
  else feedback("Marca al menos 3 vértices para un polígono o 2 para una red.");
};
el("cancel").onclick = () => {
  vertices = [];
  pointer = null;
  draw();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    vertices = [];
    pointer = null;
    draw();
  }
});
el("mode").onchange = () => {
  vertices = [];
  draw();
};
el("accept").onclick = () => {
  const p = task().proposals.find((p) => p.id === selected);
  if (!p) return feedback("Selecciona una propuesta primero.");
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = "accepted-" + p.id;
  if (task().annotations.some((a) => a.id === copy.id))
    return feedback("La propuesta ya fue copiada.");
  copy.class = el("class").value;
  copy.status = "annotated-not-reviewed";
  copy.evidence.machineProposalId = p.id;
  task().annotations.push(copy);
  selected = copy.id;
  list();
  draw();
  feedback("Copiada. Comprueba la geometría y completa las omisiones.");
};
el("remove").onclick = () => {
  task().annotations = task().annotations.filter((a) => a.id !== selected);
  task().proposals = task().proposals.filter((a) => a.id !== selected);
  selected = null;
  list();
  draw();
};
el("class").onchange = () => {
  const a = task().annotations.find((a) => a.id === selected);
  if (a) {
    a.class = el("class").value;
    list();
    draw();
  }
};
for (const [id, field] of [
  ["annotator", "annotator"],
  ["reviewer", "reviewer"],
  ["notes", "notes"],
  ["view", "viewType"],
])
  el(id).addEventListener("input", () => {
    task()[field] = el(id).value;
  });
el("cropChecked").onchange = () => {
  task().cropConfirmed = el("cropChecked").checked;
};
el("units").oninput = () => {
  const v = Number(el("units").value);
  task().calibration =
    Number.isFinite(v) && v > 0
      ? {
          metresPerCadUnit: v,
          status: "reviewer-entered-not-independently-validated",
        }
      : null;
};
el("export").onclick = () => {
  const draft = {
    ...batch,
    trainingReady: false,
    independentlyReviewed: false,
    tasks: batch.tasks.map((t) => {
      const copy = { ...t, reviewed: false };
      delete copy.shapes;
      return copy;
    }),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "ark-annotation-draft.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  feedback(
    "Borrador descargado. No contiene imágenes ni una certificación de validación.",
  );
};
el("import").onclick = () => el("draftFile").click();
el("draftFile").onchange = async () => {
  try {
    const file = el("draftFile").files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Borrador demasiado grande (máximo 10 MB).");
    const draft = JSON.parse(await file.text());
    if (
      draft.schemaVersion !== batch.schemaVersion ||
      !Array.isArray(draft.tasks) ||
      draft.tasks.length !== batch.tasks.length
    )
      throw new Error("El borrador no corresponde a este lote.");
    const replacements = batch.tasks.map((t) => {
      const incoming = draft.tasks.find((s) => s.id === t.id);
      if (
        !incoming ||
        incoming.sourceHash !== t.sourceHash ||
        JSON.stringify(incoming.crop) !== JSON.stringify(t.crop)
      )
        throw new Error("La fuente o el recorte no coinciden.");
      if (
        !Array.isArray(incoming.annotations) ||
        incoming.annotations.length > 1000
      )
        throw new Error("Anotaciones inválidas.");
      const ids = new Set();
      const annotations = incoming.annotations.map((a) => {
        if (
          !a ||
          typeof a.id !== "string" ||
          a.id.length > 200 ||
          ids.has(a.id) ||
          !t.allowedClasses.includes(a.class) ||
          !Array.isArray(a.bbox) ||
          a.bbox.length !== 4 ||
          !a.bbox.every((v) => Number.isFinite(v) && Math.abs(v) < 1e9) ||
          a.bbox[2] < a.bbox[0] ||
          a.bbox[3] < a.bbox[1]
        )
          throw new Error("Clase, caja o identidad de anotación inválida.");
        ids.add(a.id);
        if (
          a.points &&
          (!Array.isArray(a.points) ||
            a.points.length > 2000 ||
            a.points.length < 2 ||
            !["polygon", "polyline"].includes(a.geometry) ||
            !a.points.every(
              (p) =>
                Array.isArray(p) &&
                p.length === 2 &&
                p.every((v) => Number.isFinite(v) && Math.abs(v) < 1e9),
            ))
        )
          throw new Error("Trazado inválido.");
        return {
          id: a.id,
          class: a.class,
          bbox: a.bbox,
          ...(a.points ? { points: a.points, geometry: a.geometry } : {}),
          status: "annotated-not-reviewed",
          reviewed: false,
          evidence: { kind: "imported-human-draft" },
        };
      });
      const metres = incoming.calibration?.metresPerCadUnit;
      return {
        ...t,
        annotations,
        annotator: String(incoming.annotator ?? "").slice(0, 200),
        reviewer: String(incoming.reviewer ?? "").slice(0, 200),
        notes: String(incoming.notes ?? "").slice(0, 10000),
        viewType: ["plan", "section", "elevation", "detail", "legend"].includes(
          incoming.viewType,
        )
          ? incoming.viewType
          : "unconfirmed",
        cropConfirmed: incoming.cropConfirmed === true,
        calibration:
          Number.isFinite(metres) && metres > 0 && metres <= 1000
            ? {
                metresPerCadUnit: metres,
                status: "reviewer-entered-not-independently-validated",
              }
            : null,
      };
    });
    batch.tasks = replacements;
    load();
    feedback(
      "Borrador cargado; el lote continúa sin certificación independiente.",
    );
  } catch (error) {
    feedback("No se cargó: " + error.message);
  }
  el("draftFile").value = "";
};
new ResizeObserver(fit).observe(el("surface"));
load();
