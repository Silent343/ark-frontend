"use client";
import { createCadPlan } from "../../domain/cad-operations";
import { compileCadModel } from "../../infrastructure/compile-cad-model";
import { detectColoredSpaces } from "../../application/detect-colored-spaces";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw, Upload, X } from "lucide-react";
import type {
  Blueprint,
  PlanDiscipline,
} from "../../domain/entities/blueprint";
import {
  calibratePlan,
  metersPerUnit,
  type PlanPoint,
} from "../../domain/plan-calibration";
import { mergeImportedReview } from "../../domain/plan-review";
import { withoutSheetGeometry } from "../../domain/plan-provenance";
import {
  detectPlanLines,
  findRectangularRooms,
  suggestOpeningsFromText,
  suggestRoomNames,
  suggestServicePoints,
  suggestStairsFromText,
} from "../../application/detect-plan-lines";
import {
  loadPlanSource,
  preparePlanImage,
  recognizePlanText,
  rectifyPlan,
  type RasterPlan,
} from "../../infrastructure/browser-plan-source";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

interface SourceDocument {
  id: string;
  title: string;
  file_data: string;
  file_name: string;
  mime_type: string;
}
const disciplines: Array<{ id: PlanDiscipline; label: string }> = [
  { id: "architecture", label: "Arquitectura" },
  { id: "structure", label: "Estructura" },
  { id: "electrical", label: "Electricidad" },
  { id: "plumbing", label: "Agua y desagüe" },
];

/** Filename and embedded text only suggest the classification; the user confirms it. */
function suggestDiscipline(name: string, text: string): PlanDiscipline {
  const evidence = `${name} ${text}`.toLowerCase();
  if (
    /eléctric|electric|lighting|iluminaci|enchufe|tomacorriente/.test(evidence)
  )
    return "electrical";
  if (
    /sanitari|plumb|hidráulic|hydraulic|desagüe|drainage|agua potable/.test(
      evidence,
    )
  )
    return "plumbing";
  if (/estructur|structural|cimentaci|foundation|columnas/.test(evidence))
    return "structure";
  return "architecture";
}

/** Staged import: nothing replaces the current shared plan until the user explicitly confirms. */
export function PlanImportDialog({
  blueprint,
  documents,
  initialLevelId,
  onSave,
  onClose,
}: {
  blueprint: Blueprint;
  documents: SourceDocument[];
  initialLevelId?: string;
  onSave: (next: Blueprint) => Promise<void>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null),
    controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const cadRenderGeneration = useRef(0);
  const [file, setFile] = useState<File | null>(null),
    [page, setPage] = useState(1);
  const [discipline, setDiscipline] = useState<PlanDiscipline>("architecture");
  const [levelId, setLevelId] = useState(
    initialLevelId ??
      blueprint.levels.find((item) => item.elevation === 0)?.id ??
      blueprint.levels[0]?.id ??
      "",
  );
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [source, setSource] = useState<RasterPlan | null>(null);
  const [visibleCadLayers, setVisibleCadLayers] = useState<string[]>([]);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [rotation, setRotation] = useState(0),
    [contrast, setContrast] = useState(100),
    [denoise, setDenoise] = useState(true);
  const [points, setPoints] = useState<PlanPoint[]>([]),
    [perspective, setPerspective] = useState(false);
  const [distance, setDistance] = useState(""),
    [wallHeight, setWallHeight] = useState(2.8),
    [threshold, setThreshold] = useState(145);
  const [ocr, setOcr] = useState(false),
    [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<Blueprint | null>(null),
    [replaceSheetId, setReplaceSheetId] = useState(""),
    [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmedServices, setConfirmedServices] = useState<string[]>([]);
  const [confirmedOpenings, setConfirmedOpenings] = useState<string[]>([]);
  const [confirmedStairs, setConfirmedStairs] = useState<string[]>([]);
  const prepared = useMemo(
    () =>
      source
        ? preparePlanImage(
            source.canvas,
            rotation,
            contrast,
            source.cad ? false : denoise,
            false,
            source.cad ? 3000 : undefined,
          )
        : null,
    [source, rotation, contrast, denoise],
  );
  const preview = useMemo(
    () => prepared?.toDataURL("image/jpeg", source?.cad ? 0.82 : 0.9),
    [prepared, source?.cad],
  );
  useEffect(() => {
    const requests = generation;
    dialog.current?.showModal();
    return () => {
      requests.current++;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => () => source?.cad?.dispose(), [source?.cad]);

  const resetAnalysis = () => {
    setDraft(null);
    setPoints([]);
    setConfirmReplace(false);
    setConfirmedServices([]);
    setConfirmedOpenings([]);
    setConfirmedStairs([]);
    setError("");
  };
  async function load(next: File, nextPage: number) {
    const run = ++generation.current;
    controller.current?.abort();
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    resetAnalysis();
    try {
      const raster = await loadPlanSource(next, nextPage, operation.signal);
      if (run !== generation.current) {
        raster.cad?.dispose();
        return;
      }
      setFile(next);
      setPage(nextPage);
      setSource(raster);
      setVisibleCadLayers(
        raster.cad?.layers
          .filter((item) => item.visible)
          .map((item) => item.name) ?? [],
      );
      setPreviewZoom(1);
      if (!replaceSheetId)
        setDiscipline(
          suggestDiscipline(
            next.name,
            raster.cad ? "" : raster.text.map((item) => item.text).join(" "),
          ),
        );
      setManual(!!raster.cad); // A CAD preview alone must not invent semantic walls or rooms.
      setRotation(0);
      setContrast(100);
      setPerspective(false);
    } catch (reason) {
      if (run === generation.current) setError((reason as Error).message);
    } finally {
      if (run === generation.current) setBusy(false);
    }
  }
  async function setCadLayers(next: string[]) {
    if (!source?.cad || next.length === 0) return;
    const run = ++cadRenderGeneration.current;
    setBusy(true);
    setError("");
    try {
      const rendered = await source.cad.renderLayers(next);
      if (run !== cadRenderGeneration.current) return;
      setVisibleCadLayers(next);
      setSource({ ...source, canvas: rendered.canvas, text: rendered.text });
      resetAnalysis(); // A layer change changes the calibrated source image and its OCR positions.
    } catch (reason) {
      if (run === cadRenderGeneration.current)
        setError((reason as Error).message);
    } finally {
      if (run === cadRenderGeneration.current) setBusy(false);
    }
  }
  function selectDocument(id: string) {
    const document = documents.find((item) => item.id === id);
    if (!document?.file_data.startsWith("data:")) return;
    try {
      const bytes = Uint8Array.from(
        atob(document.file_data.split(",")[1]),
        (character) => character.charCodeAt(0),
      );
      void load(
        new File([bytes], document.file_name, { type: document.mime_type }),
        1,
      );
    } catch {
      setError(t("import.invalidFile"));
    }
  }
  async function analyze() {
    if (!prepared || !file || points.length !== 2 || perspective) return;
    const run = ++generation.current;
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setError("");
    setProgress(0);
    const timeout = window.setTimeout(() => operation.abort(), 120_000);
    try {
      let next: Blueprint = {
        ...blueprint,
        width: prepared.width,
        height: prepared.height,
        sourceImage: preview,
        sourceSize: { width: prepared.width, height: prepared.height },
        rooms: [],
        walls: [],
        doors: [],
        windows: [],
        columns: [],
        stairs: [],
        services: [],
        slabs: [],
        levels: blueprint.levels,
        calibration: undefined,
        review: undefined,
      };
      next = calibratePlan(
        next,
        points as [PlanPoint, PlanPoint],
        Number(distance),
      );
      const pixels = prepared
        .getContext("2d")!
        .getImageData(0, 0, prepared.width, prepared.height);
      next.walls =
        manual || discipline !== "architecture"
          ? []
          : detectPlanLines(
              pixels.data,
              prepared.width,
              prepared.height,
              threshold,
            ).map((wall) => ({ ...wall, height: wallHeight }));
      next.rooms =
        manual || discipline !== "architecture"
          ? []
          : findRectangularRooms(next.walls, prepared.width, prepared.height);
      next.slabs =
        manual || discipline !== "architecture"
          ? []
          : detectColoredSpaces(
              pixels.data,
              prepared.width,
              prepared.height,
              levelId,
            );
      // Embedded text positions are only valid before a geometric transformation.
      let text = rotation === 0 ? (source?.text ?? []) : [];
      if (ocr)
        text = await recognizePlanText(
          prepared,
          locale === "en" ? "eng" : locale === "pt" ? "por" : "spa",
          setProgress,
          operation.signal,
        );
      if (operation.signal.aborted || generation.current !== run) return;
      next.rooms = suggestRoomNames(next.rooms, text);
      next.services = suggestServicePoints(
        text,
        discipline,
        levelId,
        prepared.width,
        prepared.height,
      );
      next = calibratePlan(
        next,
        points as [PlanPoint, PlanPoint],
        Number(distance),
      );
      if (!manual && discipline === "architecture") {
        const proposals = suggestOpeningsFromText(
          text,
          next.walls,
          levelId,
          next.calibration!.metersPerUnit,
        );
        next.doors = proposals.doors;
        next.windows = proposals.windows;
        next.stairs = suggestStairsFromText(
          text,
          levelId,
          next.calibration!.metersPerUnit,
          prepared.width,
          prepared.height,
        );
      }
      next.review = {
        sourceName: file.name,
        page,
        method: manual ? "manual-tracing" : "local-lines-v1",
        status: "draft",
        reviewedIds: [],
        text,
        warnings: [
          "orthogonal-baseline",
          "openings-require-review",
          "text-proposals-require-confirmation",
          "heights-assumed",
          "verify-source-discipline-and-level",
          ...(source?.cad ? ["cad-preview-requires-review"] : []),
        ],
      };
      setDraft(next);
      setConfirmedServices([]);
      setConfirmedOpenings([]);
      setConfirmedStairs([]);
    } catch (reason) {
      if (generation.current === run)
        setError(
          operation.signal.aborted
            ? t("import.cancelled")
            : (reason as Error).message,
        );
    } finally {
      window.clearTimeout(timeout);
      if (generation.current === run) setBusy(false);
    }
  }
  async function save() {
    if (!draft || !file || !prepared || !preview) return;
    setBusy(true);
    setError("");
    try {
      const replacedSheet = blueprint.sheets?.find(
        (item) => item.id === replaceSheetId,
      );
      if (replaceSheetId && (!replacedSheet || !confirmReplace))
        throw new Error(t("import.confirmReplacement"));
      const basePlan = replacedSheet
        ? withoutSheetGeometry(blueprint, replacedSheet.id)
        : blueprint;
      const existing =
        blueprint.rooms.length +
        blueprint.walls.length +
        blueprint.columns.length;
      const baseRatio =
        blueprint.calibration?.metersPerUnit ??
        (existing ? 1 / 86 : draft.calibration!.metersPerUnit);
      const ratio = draft.calibration!.metersPerUnit / baseRatio;
      const originX = offsetX / baseRatio;
      const originY = offsetY / baseRatio;
      const point = ([x, y]: [number, number]): [number, number] => [
        originX + x * ratio,
        originY + y * ratio,
      ];
      const sheetId = replacedSheet?.id ?? crypto.randomUUID();
      // Reimports use new geometry IDs even though the source sheet keeps its stable ID.
      const prefix = replacedSheet
        ? crypto.randomUUID().slice(0, 8)
        : sheetId.slice(0, 8);
      const importedWalls = draft.walls.map((wall, index) => ({
        ...wall,
        id: `wall-${prefix}-${index + 1}`,
        levelId,
        sheetId,
        start: point(wall.start),
        end: point(wall.end),
        thickness: wall.thickness * ratio,
      }));
      const importedRooms = draft.rooms.map((room, index) => ({
        ...room,
        id: `room-${prefix}-${index + 1}`,
        levelId,
        sheetId,
        x: originX + room.x * ratio,
        y: originY + room.y * ratio,
        width: room.width * ratio,
        height: room.height * ratio,
      }));
      const importedSlabs = (draft.slabs ?? []).map((slab, index) => ({
        ...slab,
        id: `slab-${prefix}-${index + 1}`,
        sheetId,
        levelId,
        polygon: slab.polygon.map(point),
        holes: slab.holes.map((hole) => hole.map(point)),
      }));
      const importedServices = (draft.services ?? [])
        .filter((item) => confirmedServices.includes(item.id))
        .map((item, index) => ({
          ...item,
          id: `service-${prefix}-${index + 1}`,
          levelId,
          sheetId,
          x: originX + item.x * ratio,
          y: originY + item.y * ratio,
        }));
      const wallIds = new Map(
        draft.walls.map((wall, index) => [wall.id, importedWalls[index].id]),
      );
      const importOpenings = (
        items: typeof draft.doors,
        type: "door" | "window",
      ) =>
        items
          .filter(
            (item) =>
              confirmedOpenings.includes(item.id) && wallIds.has(item.wallId),
          )
          .map((item, index) => ({
            ...item,
            id: `${type}-${prefix}-${index + 1}`,
            levelId,
            sheetId,
            wallId: wallIds.get(item.wallId)!,
            x: originX + item.x * ratio,
            y: originY + item.y * ratio,
            width: item.width * ratio,
          }));
      const importedStairs = (draft.stairs ?? [])
        .filter((item) => confirmedStairs.includes(item.id))
        .map((item, index) => ({
          ...item,
          id: `stair-${prefix}-${index + 1}`,
          levelId,
          sheetId,
          x: originX + item.x * ratio,
          y: originY + item.y * ratio,
          radius: item.radius * ratio,
          ...(item.length ? { length: item.length * ratio } : {}),
        }));
      const sheet = {
        id: sheetId,
        name: `${file.name} · página ${page}`,
        discipline,
        levelId,
        sourceName: file.name,
        page,
        image: preview,
        x: originX,
        y: originY,
        width: prepared.width * ratio,
        height: prepared.height * ratio,
        metersPerUnit: draft.calibration!.metersPerUnit,
        evidence: {
          method: draft.review!.method,
          warnings: draft.review!.warnings,
          text: draft.review!.text,
        },
      };
      const next: Blueprint = {
        ...basePlan,
        width: Math.max(blueprint.width, sheet.x + sheet.width),
        height: Math.max(blueprint.height, sheet.y + sheet.height),
        sourceImage: existing ? blueprint.sourceImage : undefined,
        sourceSize: existing ? blueprint.sourceSize : undefined,
        sheets: replacedSheet
          ? (blueprint.sheets ?? []).map((item) =>
              item.id === sheetId ? sheet : item,
            )
          : [...(blueprint.sheets ?? []), sheet],
        calibration:
          blueprint.calibration ??
          (existing
            ? {
                ...draft.calibration!,
                metersPerUnit: baseRatio,
                referencePoints: draft.calibration!.referencePoints.map(
                  point,
                ) as [[number, number], [number, number]],
              }
            : draft.calibration),
        walls: [...basePlan.walls, ...importedWalls],
        rooms: [...basePlan.rooms, ...importedRooms],
        slabs: [...(basePlan.slabs ?? []), ...importedSlabs],
        doors: [...basePlan.doors, ...importOpenings(draft.doors, "door")],
        windows: [
          ...basePlan.windows,
          ...importOpenings(draft.windows, "window"),
        ],
        stairs: [...(basePlan.stairs ?? []), ...importedStairs],
        services: [...(basePlan.services ?? []), ...importedServices],
      };
      await onSave(
        mergeImportedReview(blueprint, next, draft.review!, replacedSheet?.id),
      );
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="plan-import-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="plan-import-title"
    >
      <header>
        <div>
          <p className="pm-eyebrow">{t("import.eyebrow")}</p>
          <h2 id="plan-import-title">{t("import.title")}</h2>
          <p>{t("import.private")}</p>
          <p className="plan-import-help">
            Una imagen necesita una medida real: marca los extremos de una cota
            y escribe su distancia en metros. Después analiza y revisa la
            propuesta. Subir el archivo no basta para crear el 3D.
          </p>
        </div>
        <button
          type="button"
          className="pm-button"
          onClick={onClose}
          aria-label={t("import.close")}
        >
          <X size={18} />
        </button>
      </header>
      <div className="plan-import-layout">
        <aside>
          <fieldset disabled={busy}>
            <legend>1 · {t("import.source")}</legend>
            <label className="plan-upload">
              <Upload size={18} />
              {t("import.choose")}
              <input
                aria-label={t("import.choose")}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void load(selected, 1);
                }}
              />
            </label>
            {source?.cad && (
              <div className="plan-cad-layers">
                <button
                  type="button"
                  className="pm-button pm-primary"
                  disabled={busy}
                  onClick={async () => {
                    if (!file || !source.cad) return;
                    setBusy(true);
                    setError("");
                    try {
                      const cad = createCadPlan(
                        file.name,
                        source.cad.entities,
                        source.cad.layers,
                        source.cad.skipped,
                        wallHeight,
                      );
                      await onSave(
                        await compileCadModel(blueprint, cad, wallHeight),
                      );
                      onClose();
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Abrir CAD editable y preparar modelo 3D
                </button>
                <strong>
                  {t("import.cadLayers")} ·{" "}
                  {source.cad.entityCount.toLocaleString(locale)}
                </strong>
                <p className="plan-import-help">{t("import.cadLayersHint")}</p>
                <div className="plan-cad-layer-list">
                  {source.cad.layers.map((layer) => (
                    <label className="plan-check" key={layer.name}>
                      <input
                        type="checkbox"
                        checked={visibleCadLayers.includes(layer.name)}
                        disabled={
                          busy ||
                          (visibleCadLayers.length === 1 &&
                            visibleCadLayers.includes(layer.name))
                        }
                        onChange={(event) =>
                          void setCadLayers(
                            event.target.checked
                              ? [...visibleCadLayers, layer.name]
                              : visibleCadLayers.filter(
                                  (name) => name !== layer.name,
                                ),
                          )
                        }
                      />
                      <span>{layer.name}</span>
                      <small>{layer.count.toLocaleString(locale)}</small>
                    </label>
                  ))}
                </div>
                {Object.keys(source.cad.skipped).length > 0 && (
                  <p className="plan-import-help">
                    {t("import.cadPartial")}{" "}
                    {Object.entries(source.cad.skipped)
                      .map(([kind, count]) => `${kind}: ${count}`)
                      .join(" · ")}
                  </p>
                )}
              </div>
            )}
            {(blueprint.sheets?.length ?? 0) > 0 && (
              <label>
                {t("import.importAction")}
                <select
                  value={replaceSheetId}
                  onChange={(event) => {
                    const id = event.target.value;
                    const target = blueprint.sheets?.find(
                      (item) => item.id === id,
                    );
                    setReplaceSheetId(id);
                    setConfirmReplace(false);
                    setDraft(null);
                    if (target) {
                      setLevelId(target.levelId);
                      setDiscipline(target.discipline);
                      setOffsetX(
                        Number(
                          (target.x * metersPerUnit(blueprint)).toFixed(3),
                        ),
                      );
                      setOffsetY(
                        Number(
                          (target.y * metersPerUnit(blueprint)).toFixed(3),
                        ),
                      );
                    }
                  }}
                >
                  <option value="">{t("import.addSheet")}</option>
                  {blueprint.sheets?.map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {t("import.replaceSheet")} · {sheet.sourceName} ·{" "}
                      {t("import.page")} {sheet.page}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t("import.discipline")}
              <select
                value={discipline}
                disabled={!!replaceSheetId}
                onChange={(event) => {
                  setDiscipline(event.target.value as PlanDiscipline);
                  setDraft(null);
                }}
              >
                {disciplines.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(`import.discipline.${item.id}`, item.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("import.level")}
              <select
                value={levelId}
                disabled={!!replaceSheetId}
                onChange={(event) => {
                  setLevelId(event.target.value);
                  setDraft(null);
                }}
              >
                {blueprint.levels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.elevation} m
                  </option>
                ))}
              </select>
            </label>
            <p className="plan-import-help">{t("import.multiSheetHint")}</p>
            {documents.some((item) => item.file_data) && (
              <label>
                {t("import.documents")}
                <select
                  defaultValue=""
                  onChange={(event) => selectDocument(event.target.value)}
                >
                  <option value="">—</option>
                  {documents
                    .filter((item) => item.file_data)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {source && file && (
              <>
                <p className="plan-file-name">{file.name}</p>
                {source.pageCount > 1 && (
                  <label>
                    {t("import.page")}
                    <input
                      type="number"
                      min={1}
                      max={source.pageCount}
                      value={page}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (value >= 1 && value <= source.pageCount)
                          void load(file, value);
                      }}
                    />
                  </label>
                )}
              </>
            )}
          </fieldset>
          {source && (
            <fieldset disabled={busy || !!draft}>
              <legend>2 · {t("import.prepare")}</legend>
              <div className="plan-import-pair">
                <button
                  className="pm-button"
                  onClick={() => {
                    setRotation((value) => (value + 90) % 360);
                    resetAnalysis();
                  }}
                >
                  <RotateCw size={15} />
                  90°
                </button>
                <label>
                  {t("import.rotation")}
                  <input
                    type="number"
                    min={-360}
                    max={360}
                    step={0.1}
                    value={rotation}
                    onChange={(event) => {
                      setRotation(Number(event.target.value));
                      resetAnalysis();
                    }}
                  />
                </label>
              </div>
              <label>
                {t("import.contrast")} · {contrast}%
                <input
                  type="range"
                  min={70}
                  max={200}
                  value={contrast}
                  onChange={(event) => {
                    setContrast(Number(event.target.value));
                    setDraft(null);
                  }}
                />
              </label>
              <label className="plan-check">
                <input
                  type="checkbox"
                  checked={denoise}
                  onChange={(event) => setDenoise(event.target.checked)}
                />
                {t("import.denoise")}
              </label>
              <button
                className="pm-button"
                onClick={() => {
                  setPerspective(!perspective);
                  resetAnalysis();
                }}
              >
                {t(
                  perspective
                    ? "import.cancelPerspective"
                    : "import.perspective",
                )}
              </button>
              {perspective && (
                <button
                  className="pm-button"
                  disabled={points.length !== 4}
                  onClick={() => {
                    try {
                      setSource({
                        ...source,
                        canvas: rectifyPlan(prepared!, points),
                        text: [],
                      });
                      setRotation(0);
                      setContrast(100);
                      setPerspective(false);
                      resetAnalysis();
                    } catch (reason) {
                      setError((reason as Error).message);
                    }
                  }}
                >
                  {t("import.rectify")}
                </button>
              )}
            </fieldset>
          )}
          {source && !perspective && (
            <fieldset disabled={busy || !!draft}>
              <legend>3 · {t("import.calibrate")}</legend>
              <p>{t("import.twoPoints")}</p>
              <details>
                <summary>{t("import.coordinates")}</summary>
                {[0, 1].map((index) => (
                  <div className="plan-import-pair" key={index}>
                    {[0, 1].map((axis) => (
                      <label key={axis}>
                        {index + 1} · {axis === 0 ? "X" : "Y"}
                        <input
                          type="number"
                          min={0}
                          max={axis === 0 ? prepared?.width : prepared?.height}
                          value={points[index]?.[axis] ?? ""}
                          onChange={(event) =>
                            setPoints((current) => {
                              const next: PlanPoint[] = [
                                [...(current[0] ?? [0, 0])],
                                [...(current[1] ?? [0, 0])],
                              ];
                              next[index][axis] = Number(event.target.value);
                              return next;
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </details>
              <label>
                {t("import.distance")}
                <input
                  type="number"
                  min={0.01}
                  max={1000}
                  step={0.01}
                  value={distance}
                  onChange={(event) => setDistance(event.target.value)}
                />
              </label>
              {(blueprint.sheets?.length ?? 0) > 0 && (
                <div className="plan-import-pair">
                  <label>
                    {t("import.offsetX")}
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={offsetX}
                      onChange={(event) =>
                        setOffsetX(Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    {t("import.offsetY")}
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={offsetY}
                      onChange={(event) =>
                        setOffsetY(Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              )}
              <label>
                {t("import.wallHeight")}
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={0.05}
                  value={wallHeight}
                  onChange={(event) =>
                    setWallHeight(Number(event.target.value))
                  }
                />
              </label>
              <label>
                {t("import.threshold")} · {threshold}
                <input
                  type="range"
                  min={50}
                  max={220}
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                />
              </label>
              <label className="plan-check">
                <input
                  type="checkbox"
                  checked={manual}
                  disabled={!!source?.cad}
                  onChange={(event) => setManual(event.target.checked)}
                />
                {t("import.manual")}
              </label>
              <label className="plan-check">
                <input
                  type="checkbox"
                  checked={ocr}
                  onChange={(event) => setOcr(event.target.checked)}
                />
                {t("import.ocr")}
              </label>
              <button
                className="pm-button pm-primary"
                disabled={
                  points.length !== 2 ||
                  Number(distance) <= 0 ||
                  !Number.isFinite(Number(distance)) ||
                  wallHeight < 1 ||
                  wallHeight > 20 ||
                  !Number.isFinite(offsetX) ||
                  offsetX < 0 ||
                  !Number.isFinite(offsetY) ||
                  offsetY < 0
                }
                onClick={() => void analyze()}
              >
                {t("import.analyze")}
              </button>
            </fieldset>
          )}
        </aside>
        <main>
          <p className="plan-import-help">
            {t(
              draft
                ? "import.reviewHint"
                : perspective
                  ? "import.fourPoints"
                  : "import.twoPoints",
            )}
          </p>
          {source?.cad && (
            <div className="plan-cad-zoom" aria-label={t("import.cadZoom")}>
              <span>{t("import.cadZoom")}</span>
              <button
                type="button"
                className="pm-button"
                disabled={previewZoom <= 0.5}
                onClick={() =>
                  setPreviewZoom((value) => Math.max(0.5, value / 2))
                }
                aria-label={t("import.zoomOut")}
              >
                −
              </button>
              <output>{Math.round(previewZoom * 100)}%</output>
              <button
                type="button"
                className="pm-button"
                disabled={previewZoom >= 4}
                onClick={() =>
                  setPreviewZoom((value) => Math.min(4, value * 2))
                }
                aria-label={t("import.zoomIn")}
              >
                +
              </button>
            </div>
          )}
          <div
            className={`plan-import-preview${source?.cad ? " plan-cad-preview" : ""}`}
          >
            {prepared && preview ? (
              <svg
                viewBox={`0 0 ${prepared.width} ${prepared.height}`}
                className={source?.cad ? "plan-cad-preview-svg" : undefined}
                style={
                  source?.cad ? { width: `${previewZoom * 100}%` } : undefined
                }
                role="img"
                aria-label={t("import.preview")}
                onClick={(event) => {
                  if (busy || draft) return;
                  const matrix = event.currentTarget.getScreenCTM();
                  if (!matrix) return;
                  const point = new DOMPoint(
                    event.clientX,
                    event.clientY,
                  ).matrixTransform(matrix.inverse());
                  setPoints((current) =>
                    current.length >= (perspective ? 4 : 2)
                      ? [[point.x, point.y]]
                      : [...current, [point.x, point.y]],
                  );
                }}
              >
                <image
                  href={preview}
                  width={prepared.width}
                  height={prepared.height}
                />
                {draft?.rooms.map((room) => (
                  <rect
                    key={room.id}
                    x={room.x}
                    y={room.y}
                    width={room.width}
                    height={room.height}
                    fill="#22c55e"
                    opacity={0.16}
                  />
                ))}
                {draft?.walls.map((wall) => (
                  <line
                    key={wall.id}
                    x1={wall.start[0]}
                    y1={wall.start[1]}
                    x2={wall.end[0]}
                    y2={wall.end[1]}
                    stroke="#2563eb"
                    strokeWidth={wall.thickness}
                    opacity={0.65}
                  />
                ))}
                {draft?.services?.map((point) => (
                  <g key={point.id}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={10}
                      fill={
                        ["water", "drain"].includes(point.kind)
                          ? "#1885b5"
                          : "#d59a28"
                      }
                      opacity={0.8}
                    />
                    <text
                      x={point.x + 12}
                      y={point.y - 10}
                      fontSize={14}
                      fill="#263841"
                    >
                      {point.name}
                    </text>
                  </g>
                ))}
                <polyline
                  points={points.map((point) => point.join(",")).join(" ")}
                  fill="none"
                  stroke="#e04e28"
                  strokeWidth={3}
                />
                {points.map(([x, y], index) => (
                  <g key={index}>
                    <circle
                      cx={x}
                      cy={y}
                      r={8}
                      fill="#e04e28"
                      stroke="white"
                      strokeWidth={2}
                    />
                    <text x={x + 12} y={y - 8} fontSize={18} fill="#b92e14">
                      {index + 1}
                    </text>
                  </g>
                ))}
              </svg>
            ) : (
              <div className="plan-import-empty">
                <Upload size={32} />
                <p>{t("import.empty")}</p>
              </div>
            )}
          </div>
          {busy && (
            <p role="status">
              {t("import.processing")} {Math.round(progress * 100)}%
            </p>
          )}
          {error && (
            <p role="alert" className="pm-alert pm-danger">
              {error}
            </p>
          )}
          {draft && (
            <section className="plan-import-result">
              <h3>4 · {t("import.review")}</h3>
              <p>
                {draft.walls.length} {t("editor.walls")} · {draft.rooms.length}{" "}
                {t("editor.rooms")} · {draft.review!.text.length}{" "}
                {t("import.texts")}
              </p>
              {!!draft.slabs?.length && (
                <p>
                  {draft.slabs.length} superficies propuestas a partir del
                  color. Revisa sus contornos: el color no identifica materiales
                  ni mobiliario.
                </p>
              )}
              <p>{t("import.limitations")}</p>
              {discipline !== "architecture" && (
                <p>{t("import.referenceOnly")}</p>
              )}
              {(draft.services?.length ?? 0) > 0 && (
                <div>
                  <strong>{t("import.serviceProposals")}</strong>
                  {draft.services?.map((point) => (
                    <label className="plan-check" key={point.id}>
                      <input
                        type="checkbox"
                        checked={confirmedServices.includes(point.id)}
                        onChange={(event) =>
                          setConfirmedServices((current) =>
                            event.target.checked
                              ? [...current, point.id]
                              : current.filter((id) => id !== point.id),
                          )
                        }
                      />
                      {point.kind} · {point.name} ({Math.round(point.x)},{" "}
                      {Math.round(point.y)})
                    </label>
                  ))}
                </div>
              )}
              {draft.doors.length +
                draft.windows.length +
                (draft.stairs?.length ?? 0) >
                0 && (
                <div>
                  <strong>{t("import.symbolProposals")}</strong>
                  <p className="plan-import-help">
                    {t("import.symbolProposalsHint")}
                  </p>
                  {[...draft.doors, ...draft.windows].map((item) => (
                    <label className="plan-check" key={item.id}>
                      <input
                        type="checkbox"
                        checked={confirmedOpenings.includes(item.id)}
                        onChange={(event) =>
                          setConfirmedOpenings((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />
                      {item.id.startsWith("door")
                        ? t("editor.door")
                        : t("editor.window")}{" "}
                      · ({Math.round(item.x)}, {Math.round(item.y)})
                    </label>
                  ))}
                  {draft.stairs?.map((item) => (
                    <label className="plan-check" key={item.id}>
                      <input
                        type="checkbox"
                        checked={confirmedStairs.includes(item.id)}
                        onChange={(event) =>
                          setConfirmedStairs((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />
                      {t("editor.stair")} ·{" "}
                      {item.type === "straight"
                        ? t("import.straightProposal")
                        : t("import.spiralProposal")}
                    </label>
                  ))}
                </div>
              )}
              {draft.rooms.map((room) => (
                <label key={room.id}>
                  {room.id}
                  <input
                    value={room.name}
                    maxLength={100}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        rooms: draft.rooms.map((item) =>
                          item.id === room.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <details>
                <summary>{t("import.texts")}</summary>
                <ul>
                  {draft.review!.text.map((line, index) => (
                    <li key={index}>
                      {line.text}{" "}
                      <small>
                        {line.source === "pdf"
                          ? "PDF"
                          : line.source === "cad"
                            ? "CAD"
                            : `OCR · ${Math.round(line.confidence)}%`}
                      </small>
                    </li>
                  ))}
                </ul>
              </details>
              {!!replaceSheetId && (
                <label className="plan-check">
                  <input
                    type="checkbox"
                    checked={confirmReplace}
                    onChange={(event) =>
                      setConfirmReplace(event.target.checked)
                    }
                  />
                  {t("import.confirmReplacement")}
                </label>
              )}
              <div className="plan-import-pair">
                <button
                  className="pm-button"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  {t("import.back")}
                </button>
                <button
                  className="pm-button pm-primary"
                  disabled={busy || (!!replaceSheetId && !confirmReplace)}
                  onClick={() => void save()}
                >
                  {t("import.save")}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </dialog>
  );
}
