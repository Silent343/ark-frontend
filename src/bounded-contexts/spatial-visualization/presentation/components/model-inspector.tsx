"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, Scan, X } from "lucide-react";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import type { FixtureFamilyAssignment } from "@/bounded-contexts/plan-digitization/domain/fixture-families";
import { FixtureFamilyEditor } from "./fixture-family-editor";
import { modelIntegrityIssues } from "@/bounded-contexts/plan-digitization/domain/model-integrity";
import { resolveDrawingCorrespondences } from "@/bounded-contexts/plan-digitization/domain/drawing-coordination";
import { modelDetectionExport } from "@/bounded-contexts/plan-digitization/domain/detection-sample";
import { preparationReport } from "@/bounded-contexts/plan-digitization/domain/canonical/preparation";
import type { CanonicalFloorPlanGraph } from "@/bounded-contexts/plan-digitization/domain/canonical/types";
import {
  inspectModel,
  modelReadiness,
} from "@/bounded-contexts/plan-digitization/domain/model-inspection";

export function ModelInspector({
  plan,
  selectedId,
  onSelect,
  sourcePlan = plan,
  canonicalGraph,
  onSaveFamily,
}: {
  plan: Blueprint;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  sourcePlan?: Blueprint;
  canonicalGraph?: CanonicalFloorPlanGraph;
  onSaveFamily?: (
    ids: string[],
    assignment: FixtureFamilyAssignment | undefined,
  ) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const elements = useMemo(() => inspectModel(plan), [plan]);
  const checks = useMemo(() => modelReadiness(plan), [plan]);
  const issues = useMemo(() => modelIntegrityIssues(plan), [plan]);
  const preparation = useMemo(() => preparationReport(plan), [plan]);
  const correspondence = useMemo(
    () => resolveDrawingCorrespondences(sourcePlan),
    [sourcePlan],
  );
  const applied = (id: string, property: string) =>
    sourcePlan.correspondences?.some(
      (r) =>
        r.targetId === id &&
        r.property === property &&
        correspondence.results.some(
          (s) => s.id === r.id && s.status === "applied",
        ),
    );
  const selected = elements.find((e) => e.id === selectedId);
  const fixture = plan.fixtures?.find((f) => f.id === selectedId);
  const evidence = selected ? plan.elementEvidence?.[selected.id] : undefined;
  const sourceId = evidence?.sourceIds[0];
  const editor = `/projects/${plan.projectId}/editor?mode=edit`;
  const results = elements.filter(
    (e) =>
      (!level || e.levelId === level) &&
      `${e.label} ${e.category} ${e.id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function exportPredictions() {
    const blob = new Blob(
      [JSON.stringify(modelDetectionExport(sourcePlan), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `ark-detecciones-${plan.projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportCanonical() {
    if (!canonicalGraph) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(canonicalGraph, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ark-modelo-canonico-${plan.projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      className="model-inspector-panel"
      aria-label="Inspección del modelo"
    >
      <div className="model-inspector-heading">
        <Scan size={17} />
        <h2>Inspección del modelo</h2>
        <span>{elements.length}</span>
      </div>
      <p className="model-inspector-help">
        Selecciona un elemento en el 3D o búscalo aquí para revisar sus medidas
        y su origen.
      </p>
      {canonicalGraph && (
        <div className="model-canonical-summary">
          <strong>Geometría común CAD / raster</strong>
          <span>
            {canonicalGraph.elements.length} elementos ·{" "}
            {canonicalGraph.levels.reduce(
              (n, l) => n + l.topology.faces.filter((f) => !f.exterior).length,
              0,
            )}{" "}
            contornos cerrados
          </span>
          {preparation.coverage !== null && (
            <small>
              {Math.round(preparation.coverage * 100)} % de entidades con
              categoría asignada. No mide exactitud.
            </small>
          )}
          <button type="button" className="pm-button" onClick={exportCanonical}>
            Exportar modelo canónico · JSON
          </button>
        </div>
      )}
      {plan.cad && (
        <Link className="pm-button" href={`${editor}&panel=recognition`}>
          Reconocimiento con IA
        </Link>
      )}
      <Link
        className="pm-button"
        href={`${editor}&panel=coordination${selectedId ? `&target=${encodeURIComponent(selectedId)}` : ""}`}
      >
        Vincular plantas, cortes y cuadros
      </Link>
      {!!correspondence.results.length && (
        <p className="model-inspector-help">
          {correspondence.results.filter((r) => r.status === "applied").length}{" "}
          medidas vinculadas ·{" "}
          {correspondence.results.filter((r) => r.status !== "applied").length}{" "}
          por revisar
        </p>
      )}
      {(plan.cad ? !plan.cad.unitConfirmed : !plan.calibration) && (
        <p className="model-metric-warning">
          Medidas provisionales: falta confirmar la escala del plano.
        </p>
      )}
      {plan.cad &&
        (!plan.cad.regions.some(
          (r) => r.enabled && (!r.viewType || r.viewType === "plan"),
        ) ||
          plan.review?.warnings.includes("cad-awaiting-units")) && (
          <p className="model-metric-warning">
            CAD importado, pendiente de preparar el modelo. En «Vistas»,
            confirma las unidades, delimita las plantas y selecciona cuáles
            incluir en 3D.{" "}
            <Link href={`${editor}&panel=levels`}>
              Revisar plantas y escala
            </Link>
          </p>
        )}
      {selected ? (
        <div className="model-element-card">
          {issues
            .filter((issue) => issue.id === selected.id)
            .map((issue) => (
              <p className="model-metric-warning" key={issue.code}>
                {issue.detail}
              </p>
            ))}
          <div className="model-inspector-heading">
            <div>
              <small>{selected.category}</small>
              <h3>{selected.label}</h3>
            </div>
            <button
              type="button"
              aria-label="Cerrar elemento"
              onClick={() => onSelect(null)}
            >
              <X size={16} />
            </button>
          </div>
          <p>
            {plan.levels.find((l) => l.id === selected.levelId)?.name ??
              "Nivel principal"}
          </p>
          <dl>
            {selected.dimensions.map((d) => (
              <div key={d.label}>
                <dt>{d.label}</dt>
                <dd>
                  {d.value.toLocaleString("es-PE", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  m{" "}
                  <small>
                    {applied(selected.id, d.property)
                      ? "Cota vinculada y confirmada"
                      : evidence
                        ? evidence.assumed.includes(d.property)
                          ? "Por confirmar"
                          : evidence.method === "neural-mask"
                            ? "Propuesta CAD + IA"
                            : "Del plano / ajuste"
                        : "Sin evidencia registrada"}
                  </small>
                </dd>
              </div>
            ))}
          </dl>
          {selected.hostId && (
            <button
              className="model-host-link"
              onClick={() => onSelect(selected.hostId!)}
            >
              Seleccionar muro anfitrión
            </button>
          )}
          {fixture && (
            <FixtureFamilyEditor
              key={`${fixture.id}:${JSON.stringify(plan.fixtureFamilies?.[fixture.id])}`}
              fixture={fixture}
              plan={plan}
              onSave={onSaveFamily}
            />
          )}
          {evidence && (
            <p className="model-source-note">
              <strong>Origen</strong> {evidence.sourceName}
              <br />
              {evidence.sourceIds.length} entidades de referencia. Tipo y
              acabado requieren revisión.
            </p>
          )}
          <Link
            className="pm-button"
            href={
              editor +
              (sourceId
                ? `&source=${encodeURIComponent(sourceId)}&region=${encodeURIComponent(evidence!.regionId)}`
                : "")
            }
          >
            <ArrowUpRight size={14} />
            Revisar en el plano 2D
          </Link>
        </div>
      ) : (
        <details className="model-review-checks" open={checks.length > 0}>
          <summary>
            {checks.length
              ? `${checks.length} comprobaciones pendientes`
              : "Revisión del proyecto"}
          </summary>
          {checks.map((c) => (
            <Link key={c.id} href={`${editor}&panel=${c.panel}`}>
              <span>
                <strong>
                  {c.label} <small>{c.count}</small>
                </strong>
                <span>{c.detail}</span>
              </span>
              <ArrowUpRight size={14} />
            </Link>
          ))}
          {!checks.length && (
            <p>
              Revisa tipos, materiales y dimensiones antes de preparar una
              entrega.
            </p>
          )}
          {!!issues.length && (
            <div
              className="model-issue-list"
              aria-label="Elementos con conflictos"
            >
              {[...new Set(issues.map((issue) => issue.id))]
                .slice(0, 8)
                .map((id) => (
                  <button key={id} type="button" onClick={() => onSelect(id)}>
                    Revisar {elements.find((e) => e.id === id)?.label ?? id}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
            </div>
          )}
        </details>
      )}
      <label className="model-element-search">
        <Search size={14} />
        <input
          type="search"
          aria-label="Buscar elementos del modelo"
          placeholder="Muros, ventanas, mobiliario…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <select
        aria-label="Filtrar elementos por nivel"
        value={level}
        onChange={(e) => setLevel(e.target.value)}
      >
        <option value="">Todos los niveles</option>
        {plan.levels.map((l) => (
          <option value={l.id} key={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <div className="model-element-list" aria-label="Elementos del modelo">
        {results.slice(0, 80).map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={selectedId === e.id}
            onClick={() => onSelect(e.id)}
          >
            <span>
              {e.label}
              <small>
                {plan.levels.find((l) => l.id === e.levelId)?.name ??
                  e.category}
              </small>
            </span>
            <ArrowUpRight size={13} />
          </button>
        ))}
        {results.length > 80 && (
          <p>Mostrando 80 de {results.length}. Filtra por nombre o nivel.</p>
        )}
        {!results.length && <p>No hay elementos con ese filtro.</p>}
      </div>
      <details className="model-review-checks">
        <summary>Evaluación del reconocimiento</summary>
        <p>
          Exporta las propuestas por planta para compararlas con anotaciones
          independientes. El número de objetos no indica exactitud.
        </p>
        <button
          type="button"
          className="pm-button"
          onClick={exportPredictions}
          disabled={
            sourcePlan.cad
              ? !sourcePlan.cad.unitConfirmed
              : !sourcePlan.calibration
          }
        >
          Exportar detecciones
        </button>
      </details>
    </section>
  );
}
