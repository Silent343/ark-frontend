"use client";

import { useState } from "react";
import { FileImage, ScanLine } from "lucide-react";
import type {
  Blueprint,
  PlanDiscipline,
} from "../../domain/entities/blueprint";
import { planElements, sheetReviewProgress } from "../../domain/plan-review";
import { sourceSheetForElement } from "../../domain/plan-provenance";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

const disciplineKeys: Record<PlanDiscipline, string> = {
  architecture: "import.discipline.architecture",
  structure: "import.discipline.structure",
  electrical: "import.discipline.electrical",
  plumbing: "import.discipline.plumbing",
};
const disciplineNames: Record<PlanDiscipline, string> = {
  architecture: "Arquitectura",
  structure: "Estructura",
  electrical: "Electricidad",
  plumbing: "Agua y desagüe",
};

/** Source sheets are navigable independently of the shared semantic geometry. */
export function PlanSourceReviewPanel({
  blueprint,
  activeLevelId,
  activeSheetId,
  onOpenSheet,
  onSelectElement,
  onImport,
  canImport,
}: {
  blueprint: Blueprint;
  activeLevelId: string;
  activeSheetId?: string;
  onOpenSheet: (levelId: string, sheetId: string) => void;
  onSelectElement: (
    levelId: string,
    sheetId: string | undefined,
    elementId: string,
  ) => void;
  onImport: () => void;
  canImport: boolean;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const [reviewScope, setReviewScope] = useState<"sheet" | "all">("sheet");
  const sheets = blueprint.sheets ?? [];
  const firstLevelId =
    blueprint.levels.find((level) => level.elevation === 0)?.id ??
    blueprint.levels[0].id;
  const reviewed = new Set(blueprint.review?.reviewedIds ?? []);
  const elements = planElements(blueprint);
  const currentSheet = sheets.find((sheet) => sheet.id === activeSheetId);
  const allPending = blueprint.review
    ? elements.filter((element) => !reviewed.has(element.id))
    : [];
  const pending =
    currentSheet && reviewScope === "sheet"
      ? sheetReviewProgress(blueprint, currentSheet.id).pending
      : allPending;
  const visiblePending = showAll ? pending : pending.slice(0, 5);
  // Older projects only retained the final import's evidence at blueprint level.
  const legacyEvidence =
    currentSheet &&
    currentSheet.id === sheets.at(-1)?.id &&
    currentSheet.sourceName === blueprint.review?.sourceName &&
    currentSheet.page === blueprint.review.page
      ? blueprint.review
      : undefined;
  const evidence = currentSheet?.evidence ?? legacyEvidence;

  return (
    <section
      className="plan-source-review"
      aria-label={t("editor.sourcesTitle")}
    >
      <div className="plan-source-review-heading">
        <FileImage size={17} aria-hidden="true" />
        <div>
          <h2>{t("editor.sourcesTitle")}</h2>
          <p>{t("editor.sourcesHint")}</p>
        </div>
      </div>
      {sheets.length ? (
        <div className="plan-source-levels">
          {blueprint.levels.map((level) => {
            const onLevel = sheets.filter(
              (sheet) => sheet.levelId === level.id,
            );
            if (!onLevel.length) return null;
            return (
              <div key={level.id} className="plan-source-level">
                <p>
                  {level.name} <span>{onLevel.length}</span>
                </p>
                {onLevel.map((sheet) => {
                  const progress = sheetReviewProgress(blueprint, sheet.id);
                  return (
                    <button
                      key={sheet.id}
                      type="button"
                      className="plan-source-sheet"
                      aria-current={
                        activeLevelId === level.id && activeSheetId === sheet.id
                          ? "true"
                          : undefined
                      }
                      onClick={() => onOpenSheet(level.id, sheet.id)}
                    >
                      <span
                        className="plan-source-sheet-name"
                        title={sheet.sourceName}
                      >
                        {sheet.sourceName}
                      </span>
                      <span>
                        {t("import.page")} {sheet.page} ·{" "}
                        {t(
                          disciplineKeys[sheet.discipline],
                          disciplineNames[sheet.discipline],
                        )}
                      </span>
                      <small>
                        {progress.total
                          ? `${progress.reviewed}/${progress.total} ${t("editor.sheetReviewed")}`
                          : t("editor.referenceSheet")}
                      </small>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="plan-source-empty">{t("editor.sourcesEmpty")}</p>
      )}
      {currentSheet && (
        <div className="plan-sheet-evidence">
          <strong>{t("editor.sheetEvidence")}</strong>
          {evidence ? (
            <>
              <p>
                {t(
                  evidence.warnings.includes("reference-not-calibrated")
                    ? "editor.evidence.unmeasured"
                    : evidence.method === "neural-image-v1"
                      ? "editor.evidence.neural"
                      : evidence.method === "manual-tracing"
                        ? "editor.evidence.manual"
                        : "editor.evidence.local",
                )}
              </p>
              <p>
                {t("editor.evidence.ocrCount").replace(
                  "{count}",
                  String(evidence.text.length),
                )}
              </p>
              {evidence.text.length > 0 && (
                <ul className="plan-sheet-evidence-text">
                  {evidence.text.slice(0, 4).map((line, index) => (
                    <li
                      key={`${index}-${line.text}`}
                      title={`${line.source} · ${Math.round(line.confidence)}%`}
                    >
                      {line.text}
                    </li>
                  ))}
                </ul>
              )}
              {evidence.warnings.length > 0 && (
                <details>
                  <summary>
                    {t("editor.evidence.notices")} · {evidence.warnings.length}
                  </summary>
                  <ul>
                    {evidence.warnings.map((warning) => (
                      <li key={warning}>
                          {warning === 'neural-symbols-review-required'
                            ? 'Solo los símbolos confirmados se incorporaron al 3D. Las propuestas restantes siguen disponibles como evidencia.'
                            : warning === 'neural-symbol-dimensions-assumed'
                            ? 'Alturas y detalles de las familias son aproximados; las cajas del detector no son geometría BIM validada.'
                            : warning.startsWith("neural-invalid-spaces:")
                          ? `${warning.split(":")[1]} contornos de espacios no se incorporaron al 3D porque se cruzan o tienen huecos ambiguos. Revisa la evidencia original.`
                          : warning.startsWith("neural-unhosted:")
                          ? `${warning.split(":")[1]} aberturas detectadas sin muro asociado. Se conservan en la superposición para revisión.`
                          : warning.startsWith("tiled-lines-baseline:")
                            ? `Plano analizado en ${warning.split(":")[1]} recortes de alta resolución. Revisa encuentros y símbolos.`
                            : t(`editor.evidence.warning.${warning}`, warning)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <small>{t("editor.evidence.caution")}</small>
            </>
          ) : (
            <p>{t("editor.evidence.unavailable")}</p>
          )}
        </div>
      )}
      <button
        className="plan-source-import"
        type="button"
        onClick={onImport}
        disabled={!canImport}
      >
        {t("editor.addSource")}
      </button>
      {blueprint.review && (
        <div className="plan-source-queue">
          <div className="plan-source-review-heading">
            <ScanLine size={16} aria-hidden="true" />
            <div>
              <h3>
                {t("editor.reviewQueue")} <span>{pending.length}</span>
              </h3>
              <p>{t("editor.reviewQueueHint")}</p>
            </div>
          </div>
          {currentSheet && (
            <div
              className="plan-source-scope"
              role="group"
              aria-label={t("editor.reviewScope")}
            >
              <button
                type="button"
                aria-pressed={reviewScope === "sheet"}
                onClick={() => {
                  setReviewScope("sheet");
                  setShowAll(false);
                }}
              >
                {t("editor.currentSheet")}
              </button>
              <button
                type="button"
                aria-pressed={reviewScope === "all"}
                onClick={() => {
                  setReviewScope("all");
                  setShowAll(false);
                }}
              >
                {t("editor.allElements")} · {allPending.length}
              </button>
            </div>
          )}
          {visiblePending.length ? (
            <div className="plan-source-pending-list">
              {visiblePending.map((element) => {
                const sheet = sourceSheetForElement(blueprint, element);
                const levelId = element.levelId ?? firstLevelId;
                const levelName =
                  blueprint.levels.find((level) => level.id === levelId)
                    ?.name ?? levelId;
                const label =
                  "name" in element &&
                  typeof element.name === "string" &&
                  element.name.trim()
                    ? element.name
                    : element.id;
                return (
                  <button
                    key={element.id}
                    type="button"
                    className="plan-source-pending"
                    onClick={() =>
                      onSelectElement(levelId, sheet?.id, element.id)
                    }
                  >
                    <span title={label}>{label}</span>
                    <small title={sheet?.sourceName}>
                      {levelName} ·{" "}
                      {sheet
                        ? `${sheet.sourceName} · ${t("import.page")} ${sheet.page}`
                        : t("import.manualSource")}
                    </small>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="plan-source-empty">{t("editor.reviewQueueEmpty")}</p>
          )}
          {pending.length > 5 && (
            <button
              className="plan-source-more"
              type="button"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? t("editor.showLess") : t("editor.showAllPending")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
