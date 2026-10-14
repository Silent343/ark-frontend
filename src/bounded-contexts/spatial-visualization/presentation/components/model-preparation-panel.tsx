"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, Circle, Layers3, Ruler, ScanLine } from "lucide-react";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import type { PreparationReport } from "@/bounded-contexts/plan-digitization/domain/canonical/preparation";
import { CadPlanCanvas } from "@/bounded-contexts/plan-digitization/presentation/components/cad-plan-canvas";

export function ModelPreparationPanel({
  plan,
  report,
  error,
  onRetry,
}: {
  plan: Blueprint;
  report: PreparationReport;
  error?: string;
  onRetry: () => void;
}) {
  const [highlight, setHighlight] = useState(true);
  const editor = `/projects/${plan.projectId}/editor?mode=edit`;
  const elementLink = (id: string) => {
    const source = plan.elementEvidence?.[id]?.sourceIds[0];
    return `${editor}&${plan.cad && source ? `source=${encodeURIComponent(source)}` : `element_id=${encodeURIComponent(id)}`}`;
  };
  const title =
    report.state === "UNINITIALIZED"
      ? "Añade el plano del edificio"
      : report.state === "AWAITING_UNITS"
        ? "Confirma la escala del plano"
        : report.state === "AWAITING_FLOOR_SELECTION"
          ? "Selecciona la planta que quieres construir"
          : report.state === "RECONSTRUCTING"
            ? "Validando la geometría del edificio"
            : "Revisa la interpretación del plano";
  const steps = [
    {
      label: "Escala confirmada",
      done: report.unitsConfirmed,
      icon: Ruler,
      href: `${editor}&panel=levels`,
    },
    {
      label: "Plantas seleccionadas",
      done: report.selectedFloors > 0,
      icon: Layers3,
      href: `${editor}&panel=levels`,
    },
    {
      label: "Geometría compatible",
      done: report.state === "RECONSTRUCTED",
      icon: ScanLine,
      href: `${editor}&panel=layers`,
    },
  ];
  return (
    <section className="model-preparation" aria-label="Preparación del modelo">
      <header>
        <span className="pm-eyebrow">DISEÑO · MODELO 3D</span>
        <h1>{title}</h1>
        <p>
          Prepara el plano y comprueba sus elementos antes de abrir la vista 3D.
        </p>
      </header>
      <div className="model-preparation-steps">
        {steps.map((step) => (
          <Link
            key={step.label}
            href={step.href}
            aria-label={`${step.label}: ${step.done ? "completado" : "pendiente"}`}
          >
            <step.icon size={20} />
            <span>
              {step.label}
              <small>{step.done ? "Completado" : "Pendiente"}</small>
            </span>
            {step.done ? <Check size={18} /> : <Circle size={16} />}
          </Link>
        ))}
      </div>
      {report.coverage !== null && (
        <div className="model-preparation-coverage">
          <strong>
            {Math.round(report.coverage * 100)} % con categoría asignada
          </strong>
          <span>
            {report.classified.toLocaleString("es-PE")} de{" "}
            {report.eligible.toLocaleString("es-PE")} entidades geométricas en
            las plantas seleccionadas.
          </span>
          <p>
            La cobertura indica clasificación, no exactitud ni validación
            arquitectónica.
          </p>
        </div>
      )}
      {report.skippedEntities > 0 && (
        <p className="model-inspector-help">
          La importación reportó{" "}
          {report.skippedEntities.toLocaleString("es-PE")} entidades omitidas.
          No se incluyen en el porcentaje de clasificación.
        </p>
      )}
      {plan.cad && (
        <>
          <div className="model-preparation-preview">
            <CadPlanCanvas
              plan={plan.cad}
              highlightIds={highlight ? report.unresolvedIds : undefined}
            />
          </div>
          {report.unresolvedIds.length > 0 && (
            <label className="model-preparation-highlight">
              <input
                type="checkbox"
                checked={highlight}
                onChange={(e) => setHighlight(e.target.checked)}
              />{" "}
              Resaltar {report.unresolvedIds.length.toLocaleString("es-PE")}{" "}
              entidades sin clasificar en naranja
            </label>
          )}
        </>
      )}
      {report.blockers.length > 0 && (
        <div className="model-preparation-issues">
          <h2>Conflictos que requieren revisión</h2>
          <ul>
            {report.blockers.slice(0, 30).map((issue, i) => (
              <li key={i}>
                <span>{issue.message}</span>
                {issue.elementIds[0] && (
                  <Link href={elementLink(issue.elementIds[0])}>
                    Revisar elemento
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {report.blockers.length > 30 && (
            <p>
              {report.blockers.length - 30} conflictos adicionales. Revisa las
              categorías en el editor.
            </p>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {report.state === "RECONSTRUCTING" && (
        <p role="status">Comprobando ejes, intersecciones y aberturas…</p>
      )}
      <footer>
        <Link
          className="pm-button pm-primary"
          href={`${editor}&panel=${report.unitsConfirmed && report.selectedFloors ? "layers" : "levels"}`}
        >
          {report.state === "UNINITIALIZED"
            ? "Importar plano"
            : "Preparar en el editor 2D"}
        </Link>
        {report.state === "FAILED" && (
          <button className="pm-button" onClick={onRetry}>
            Volver a intentar
          </button>
        )}
      </footer>
    </section>
  );
}
