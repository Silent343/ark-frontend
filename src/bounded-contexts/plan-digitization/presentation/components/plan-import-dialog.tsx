"use client";
import { roomPath } from "../../domain/room-geometry";
import {reclassifyRasterOpening} from '../../domain/raster-opening-review';
import { createCadPlan } from "../../domain/cad-operations";
import { compileCadModel } from "../../infrastructure/compile-cad-model";
import { RasterNeuralPanel } from "./raster-neural-panel";
import {
  applyRasterNeural,
  validRasterNeural,
  type RasterNeuralProposal,
} from "../../domain/raster-neural";
import { useRouter } from "next/navigation";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileImage, Info, RotateCw, Upload, X } from "lucide-react";
import type {
  Blueprint,
  PlanDiscipline,
} from "../../domain/entities/blueprint";
import {
  calibratePlan,
  metersPerUnit,
  restoreSourceCalibration,
  type PlanPoint,
} from "../../domain/plan-calibration";
import { mergeImportedReview } from "../../domain/plan-review";
import { withoutSheetGeometry } from "../../domain/plan-provenance";
import {
  suggestRoomNames,
  suggestServicePoints,
} from "../../application/detect-plan-lines";
import {
  loadPlanSource,
  preparePlanImage,
  planPreviewCanvas,
  recognizePlanText,
  rectifyPlan,
  type RasterPlan,
} from "../../infrastructure/browser-plan-source";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

export interface SourceDocument {
  id: string;
  title: string;
  file_data: string;
  file_name: string;
  mime_type: string;
  discipline?: string;
  notes?: string;
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
  referenceOnly = false,
  initialSheetId,
}: {
  blueprint: Blueprint;
  documents: SourceDocument[];
  initialLevelId?: string;
  onSave: (next: Blueprint) => Promise<void>;
  onClose: () => void;
  referenceOnly?: boolean;
  initialSheetId?: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const initialSheet = blueprint.sheets?.find(
    (sheet) => sheet.id === initialSheetId,
  );
  const initialSheetLoaded = useRef(false);
  const initialNeuralLoaded = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null),
    controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const cadRenderGeneration = useRef(0);
  const [file, setFile] = useState<File | null>(null),
    [page, setPage] = useState(1);
  const [discipline, setDiscipline] = useState<PlanDiscipline>(
    initialSheet?.discipline ?? "architecture",
  );
  const [viewType, setViewType] = useState<
    "plan" | "section" | "elevation" | "schedule" | "detail"
  >(referenceOnly ? "section" : "plan");
  const [levelId, setLevelId] = useState(
    initialSheet?.levelId ??
      initialLevelId ??
      blueprint.levels.find((item) => item.elevation === 0)?.id ??
      blueprint.levels[0]?.id ??
      "",
  );
  const [offsetX, setOffsetX] = useState(
    initialSheet ? initialSheet.x * metersPerUnit(blueprint) : 0,
  );
  const [offsetY, setOffsetY] = useState(
    initialSheet ? initialSheet.y * metersPerUnit(blueprint) : 0,
  );
  const [source, setSource] = useState<RasterPlan | null>(null);
  const [visibleCadLayers, setVisibleCadLayers] = useState<string[]>([]);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [rotation, setRotation] = useState(0),
    [contrast, setContrast] = useState(100),
    [denoise, setDenoise] = useState(false);
  const [points, setPoints] = useState<PlanPoint[]>([]),
    [perspective, setPerspective] = useState(false);
  const [distance, setDistance] = useState(""),
    [wallHeight, setWallHeight] = useState(2.8);
  const [wallHeightSet, setWallHeightSet] = useState(false);
  const [ocr, setOcr] = useState(false),
    [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<Blueprint | null>(null),
    [replaceSheetId, setReplaceSheetId] = useState(initialSheet?.id ?? ""),
    [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmedServices, setConfirmedServices] = useState<string[]>([]);
  const [confirmedOpenings, setConfirmedOpenings] = useState<string[]>([]);
  const [confirmedStairs, setConfirmedStairs] = useState<string[]>([]);
  const [neuralResult, setNeuralResult] = useState<{
    canvas: HTMLCanvasElement;
    proposal: RasterNeuralProposal;
  } | null>(null);
  const [showNeural, setShowNeural] = useState(true);
  const [neuralBusy, setNeuralBusy] = useState(false);
  const [savedScale, setSavedScale] = useState(false);
  const [previewOnly,setPreviewOnly]=useState(false);
  const selectedLevel = blueprint.levels.find((item) => item.id === levelId);
  const referenceLength =
    points.length === 2
      ? Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1])
      : 0;
  const measureReady =
    referenceLength >= 10 &&
    Number(distance) > 0 &&
    Number(distance) <= 1000 &&
    Number.isFinite(Number(distance));
  const analysisReady =
    measureReady &&
    wallHeight >= 1 &&
    wallHeight <= 20 &&
    Number.isFinite(offsetX) &&
    offsetX >= 0 &&
    Number.isFinite(offsetY) &&
    offsetY >= 0;
  const measureHint =
    points.length < 2
      ? `Marca ${points.length === 0 ? "el inicio y el final" : "el final"} de un muro o una cota en el plano.`
      : referenceLength < 10
        ? "Los puntos están demasiado cerca. Marca un tramo más largo."
        : !measureReady
          ? "Escribe cuánto mide ese tramo en metros. Por ejemplo: 4,50."
          : !analysisReady
            ? "Revisa la altura y la posición en Ajustes avanzados antes de continuar."
            : "Medida lista. Ya puedes buscar los elementos del plano.";
  const preparation = useMemo(() => {
    if (!source) return { canvas: null, error: "" };
    try {
      return {
        canvas: preparePlanImage(
          source.canvas,
          rotation,
          contrast,
          source.cad ? false : denoise,
          false,
          source.cad ? 3000 : undefined,
        ),
        error: "",
      };
    } catch (reason) {
      return {
        canvas: null,
        error:
          reason instanceof Error
            ? reason.message
            : "No se pudo preparar la imagen.",
      };
    }
  }, [source, rotation, contrast, denoise]);
  const prepared = preparation.canvas;
  const neuralProposal =
    neuralResult?.canvas === prepared ? neuralResult.proposal : null;
  useEffect(()=>{
    if(initialNeuralLoaded.current||!prepared||!initialSheet?.analysisImage||!initialSheet.neural)return;
    initialNeuralLoaded.current=true;
    if(prepared.width!==initialSheet.neural.sourceSize.width||prepared.height!==initialSheet.neural.sourceSize.height||!validRasterNeural(initialSheet.neural))return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore the saved review once with the identical analysis raster.
    setNeuralResult({canvas:prepared,proposal:initialSheet.neural});
    setManual(false);
  },[prepared,initialSheet]);
  const preview = useMemo(
    () =>
      prepared
        ? planPreviewCanvas(prepared).toDataURL(
            "image/jpeg",
            source?.cad ? 0.82 : 0.9,
          )
        : undefined,
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
    setSavedScale(false);
    setDraft(null);
    setPoints([]);
    setConfirmReplace(false);
    setConfirmedServices([]);
    setConfirmedOpenings([]);
    setConfirmedStairs([]);
    setError("");
  };
  async function load(
    next: File,
    nextPage: number,
    documentDiscipline?: string,
    nextView: typeof viewType = referenceOnly ? "section" : "plan",
  ) {
    const run = ++generation.current;
    controller.current?.abort();
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    resetAnalysis();
    try {
      const raster = await loadPlanSource(next, nextPage, operation.signal);
      if (referenceOnly && raster.cad) {
        raster.cad.dispose();
        throw new Error(
          "Añade esta referencia como PDF o imagen. Para el CAD actual, delimita una región de corte o cuadro.",
        );
      }
      if (run !== generation.current) {
        raster.cad?.dispose();
        return;
      }
      setFile(next);
      setViewType(nextView);
      setPage(nextPage);
      setSource(raster);
      setPreviewOnly(false);
      setVisibleCadLayers(
        raster.cad?.layers
          .filter((item) => item.visible)
          .map((item) => item.name) ?? [],
      );
      setPreviewZoom(1);
      if (!replaceSheetId)
        setDiscipline(
          disciplines.some((d) => d.id === documentDiscipline)
            ? (documentDiscipline as PlanDiscipline)
            : suggestDiscipline(
                next.name,
                raster.cad
                  ? ""
                  : raster.text.map((item) => item.text).join(" "),
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
        document.discipline,
        /^Vista: Corte/.test(document.notes ?? "")
          ? "section"
          : /^Vista: Elevación/.test(document.notes ?? "")
            ? "elevation"
            : /^Vista: Cuadro/.test(document.notes ?? "")
              ? "schedule"
              : /^Vista: Referencia/.test(document.notes ?? "")
                ? "detail"
                : referenceOnly
                  ? "section"
                  : "plan",
      );
    } catch {
      setError(t("import.invalidFile"));
    }
  }
  useEffect(() => {
    if (!initialSheetId || initialSheetLoaded.current) return;
    const sheet = blueprint.sheets?.find((s) => s.id === initialSheetId);
    if (!sheet?.image) return;
    initialSheetLoaded.current = true;
    const analysisImage = sheet.analysisImage ?? sheet.image;
    const mime = /^data:([^;]+);base64,/.exec(analysisImage)?.[1];
    if (!mime?.startsWith("image/")) return;
    const bytes = Uint8Array.from(atob(analysisImage.split(",")[1]), (c) =>
      c.charCodeAt(0),
    );
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Decode the persisted image once when this workspace opens.
    void load(
      new File([bytes], sheet.sourceName.replace(/\.[^.]+$/, "") + ".jpg", {
        type: mime,
      }),
      1,
      sheet.discipline,
      "plan",
    ).then(() => {
      if (!live) return;
      setPreviewOnly(!sheet.analysisImage);
      if (
        !sheet.evidence?.warnings.includes("reference-not-calibrated") &&
        blueprint.calibration
      ) {
        const image = new Image();
        image.onload = () => {
          if (!live) return;
          const calibration=restoreSourceCalibration(sheet.sourceCalibration,{width:image.naturalWidth,height:image.naturalHeight});
          if(calibration){
            setPoints(calibration.referencePoints);
            setDistance(String(calibration.referenceDistanceM));
            setSavedScale(true);
          }
        };
        image.src = analysisImage;
      }
    });
    return () => {
      live = false;
    };
    // Initial sheet hydration runs once. Subsequent user choices stay in control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSheetId, blueprint.sheets]);
  async function analyze() {
    if (
      !prepared ||
      !file ||
      points.length !== 2 ||
      !analysisReady ||
      perspective ||
      viewType !== "plan"
    )
      return;
    if (!manual && discipline === "architecture" && !neuralProposal) {
      setError(
        "Pulsa «Detectar elementos con IA» para obtener la propuesta antes de preparar el 3D.",
      );
      return;
    }
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
        fixtures: [],
        roofs: [],
        levels: blueprint.levels.map((l) =>
          l.id === levelId
            ? {
                ...l,
                height: wallHeight,
                heightSource: wallHeightSet ? "manual" : "assumed",
              }
            : l,
        ),
        calibration: undefined,
        review: undefined,
      };
      next = calibratePlan(
        next,
        points as [PlanPoint, PlanPoint],
        Number(distance),
      );
      if (!manual && discipline === "architecture" && neuralProposal) {
        next = applyRasterNeural(next, neuralProposal, levelId, wallHeight);
      }
      // Embedded text positions are only valid before a geometric transformation.
      let text = rotation === 0 ? (source?.text ?? []) : [];
      if (ocr)
        text = await recognizePlanText(
          prepared,
          locale === "en" ? "eng" : locale === "pt" ? "por" : "spa",
          (fraction) => setProgress(0.7 + fraction * 0.3),
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
      next.review = {
        sourceName: file.name,
        page,
        method: manual
          ? "manual-tracing"
          : neuralProposal
            ? "neural-image-v1"
            : "local-lines-v1",
        status: "draft",
        reviewedIds: [],
        text,
        warnings: [
          ...(neuralProposal
            ? (next.review?.warnings ?? ["neural-image-proposal"])
            : []),
          "openings-require-review",
          "text-proposals-require-confirmation",
          "heights-assumed",
          "verify-source-discipline-and-level",
          ...(source?.cad ? ["cad-preview-requires-review"] : []),
        ],
      };
      setDraft(next);
      setConfirmedServices([]);
      setConfirmedOpenings(
        neuralProposal ? [...next.doors, ...next.windows].map((o) => o.id) : [],
      );
      setConfirmedStairs(neuralProposal?.symbols ? (next.stairs ?? []).map(s=>s.id) : []);
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
  async function save(openModel = false) {
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
        ...(room.polygon ? {polygon:room.polygon.map(point),holes:(room.holes ?? []).map(h=>h.map(point))} : {}),
      }));
      const importedSlabs = (draft.slabs ?? []).map((slab, index) => ({
        ...slab,
        id: `slab-${prefix}-${index + 1}`,
        sheetId,
        levelId,
        polygon: slab.polygon.map(point),
        holes: slab.holes.map((hole) => hole.map(point)),
      }));
      const importedFixtures = (draft.fixtures ?? []).map((fixture, index) => ({
        ...fixture,
        id: `fixture-${prefix}-${index + 1}`,
        sheetId,
        levelId,
        x: originX + fixture.x * ratio,
        y: originY + fixture.y * ratio,
        width: fixture.width * ratio,
        depth: fixture.depth * ratio,
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
        ...(neuralProposal ? { neural: neuralProposal } : {}),
        ...(!source?.cad&&!previewOnly?{analysisImage:prepared.toDataURL('image/jpeg',.95)}:{}),
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
        sourceCalibration: {
          sourceSize: {width:prepared.width,height:prepared.height},
          referencePoints: draft.calibration!.referencePoints,
          referenceDistanceM: draft.calibration!.referenceDistanceM,
        },
        evidence: {
          method: draft.review!.method,
          warnings: draft.review!.warnings,
          text: draft.review!.text,
        },
      };
      const next: Blueprint = {
        ...basePlan,
        levels: basePlan.levels.map((l) =>
          l.id === levelId
            ? {
                ...l,
                height: wallHeight,
                heightSource: wallHeightSet ? "manual" : "assumed",
              }
            : l,
        ),
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
        fixtures: [...(basePlan.fixtures ?? []), ...importedFixtures],
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
      if (openModel) router.push(`/projects/${blueprint.projectId}/model`);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }
  async function saveReference() {
    if (
      !file ||
      !prepared ||
      !preview ||
      source?.cad ||
      !levelId ||
      (viewType === "plan" && !!replaceSheetId)
    )
      return;
    if ((blueprint.sheets?.length ?? 0) >= 24) {
      setError("Se admiten hasta 24 láminas por proyecto.");
      return;
    }
    const run = generation.current;
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setError("");
    setProgress(0);
    const timeout = window.setTimeout(() => operation.abort(), 120_000);
    try {
      const text = ocr
        ? await recognizePlanText(
            prepared,
            locale === "en" ? "eng" : locale === "pt" ? "por" : "spa",
            setProgress,
            operation.signal,
          )
        : rotation === 0
          ? (source?.text ?? [])
          : [];
      if (operation.signal.aborted || generation.current !== run) return;
      const sheet = {
        ...(neuralProposal ? { neural: neuralProposal } : {}),
        ...(!source?.cad&&!previewOnly?{analysisImage:prepared.toDataURL('image/jpeg',.95)}:{}),
        id: crypto.randomUUID(),
        name: `${file.name} · página ${page}`,
        discipline,
        viewType,
        levelId,
        sourceName: file.name,
        page,
        image: preview,
        x: 0,
        y: 0,
        width: prepared.width,
        height: prepared.height,
        // Reference pages have no model scale; this field only sizes their document preview.
        metersPerUnit: 1,
        evidence: {
          method: neuralProposal
            ? ("neural-image-v1" as const)
            : ("manual-tracing" as const),
          warnings: [
            "reference-not-calibrated",
            ...(neuralProposal ? ["neural-image-proposal"] : []),
          ],
          text,
        },
      };
      await onSave({
        ...blueprint,
        width: Math.max(blueprint.width, sheet.width),
        height: Math.max(blueprint.height, sheet.height),
        sheets: [...(blueprint.sheets ?? []), sheet],
      });
      onClose();
    } catch (e) {
      if (generation.current === run)
        setError(
          e instanceof Error ? e.message : "No se pudo guardar la referencia.",
        );
    } finally {
      window.clearTimeout(timeout);
      if (generation.current === run) setBusy(false);
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
          <h2 id="plan-import-title">
            {referenceOnly ? "Añadir lámina de referencia" : t("import.title")}
          </h2>
          <p className="plan-import-intro">
            {viewType === "plan"
              ? "Carga tu archivo y revisa lo que Ark encuentra. Una medida conocida permite dar tamaño real al modelo."
              : "Añade un corte, una fachada o un cuadro para consultarlo junto a la planta."}
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
      <ol className="plan-import-steps" aria-label="Pasos para añadir el plano">
        {(source?.cad
          ? ["Elige el CAD", "Revisa el archivo", "Abre el editor"]
          : viewType !== "plan"
            ? ["Elige la lámina", "Comprueba la vista", "Guarda la referencia"]
            : ["Elige el plano", "Indica una medida", "Revisa y guarda"]
        ).map((label, index) => {
          const active = draft ? 2 : source ? 1 : 0;
          return (
            <li
              key={label}
              aria-current={index === active ? "step" : undefined}
              className={index < active ? "is-complete" : ""}
            >
              <span>{index < active ? <Check size={14} /> : index + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <div className="plan-import-layout">
        <aside>
          <fieldset disabled={busy}>
            <legend>1 · {t("import.source")}</legend>
            <details
              className="plan-import-options plan-file-options"
              open={!source}
            >
              <summary>
                {source && file ? (
                  <span className="plan-selected-file">
                    <FileImage size={18} />
                    <span>{file.name}</span>
                    <small>Cambiar</small>
                  </span>
                ) : (
                  "Archivo del plano"
                )}
              </summary>
              <div className="plan-import-options-body">
                <label className="plan-upload">
                  <Upload size={18} />
                  <span>{file ? "Cambiar archivo" : "Elegir un archivo"}</span>
                  <small>
                    {referenceOnly ? "PDF o imagen" : "DWG, DXF, PDF o imagen"}{" "}
                    · hasta 12 MB
                  </small>
                  <input
                    aria-label={
                      referenceOnly
                        ? "Elegir PDF o imagen de referencia"
                        : t("import.choose")
                    }
                    type="file"
                    accept={
                      referenceOnly
                        ? ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                        : ".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,application/pdf,image/png,image/jpeg,image/webp"
                    }
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) void load(selected, 1);
                    }}
                  />
                </label>
                {documents.some((item) => item.file_data) && (
                  <label>
                    {t("import.documents")}
                    <select
                      defaultValue=""
                      onChange={(event) => selectDocument(event.target.value)}
                    >
                      <option value="">Selecciona un documento</option>
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
              </div>
            </details>
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
                <details className="plan-import-options">
                  <summary>Ver capas del archivo CAD</summary>
                  <div className="plan-import-options-body">
                    <strong>
                      {t("import.cadLayers")} ·{" "}
                      {source.cad.entityCount.toLocaleString(locale)}
                    </strong>
                    <p className="plan-import-help">
                      {t("import.cadLayersHint")}
                    </p>
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
                </details>
              </div>
            )}
            <details className="plan-import-options">
              <summary>
                {disciplines.find((item) => item.id === discipline)?.label} ·{" "}
                {selectedLevel?.name ?? "Piso seleccionado"}
              </summary>
              <div className="plan-import-options-body">
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
                {!source?.cad && (
                  <label>
                    Tipo de vista
                    <select
                      value={viewType}
                      onChange={(e) => {
                        setViewType(e.target.value as typeof viewType);
                        setDraft(null);
                      }}
                    >
                      {!referenceOnly && (
                        <option value="plan">
                          Planta · vista desde arriba
                        </option>
                      )}
                      <option value="section">Corte</option>
                      <option value="elevation">Elevación</option>
                      <option value="schedule">Cuadro de elementos</option>
                      <option value="detail">Detalle / referencia</option>
                    </select>
                  </label>
                )}
                {viewType !== "plan" && (
                  <p className="plan-import-help">
                    Guarda esta vista para vincular sus cotas a elementos de la
                    planta. No necesita calibración para conservarla como
                    referencia.
                  </p>
                )}
                <p className="plan-import-help">{t("import.multiSheetHint")}</p>
                {source && file && (
                  <>
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
                              void load(file, value, discipline, viewType);
                          }}
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
            </details>
          </fieldset>
          {source && (
            <details className="plan-import-options plan-image-options">
              <summary>Mejorar la imagen · opcional</summary>
              <div className="plan-import-options-body">
                <fieldset disabled={busy || !!draft}>
                  <legend>{t("import.prepare")}</legend>
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
              </div>
            </details>
          )}
          {source && !source.cad && !perspective && viewType === "plan" && (
            <fieldset
              className="plan-measure-section"
              disabled={busy || !!draft}
            >
              <legend>2 · {t("import.calibrate")}</legend>
              <p className="plan-field-explanation">
                Esta medida convierte el tamaño de la imagen a metros. Se usa
                para las dimensiones y las áreas del modelo.
              </p>
              {savedScale && (
                <p className="plan-field-explanation">
                  Escala recuperada del plano guardado. Puedes usarla o volver a
                  marcar una medida.
                </p>
              )}
              {initialSheetId&&!savedScale&&points.length===0&&(
                <p className="plan-field-explanation">Este plano no conservaba los puntos de su medida original. Marca una cota o la barra de escala para recuperar dimensiones fiables; no usaremos el ancho de la imagen como referencia.</p>
              )}
              <ol className="plan-measure-instructions">
                <li>
                  En la imagen, pulsa el inicio y el final de un tramo que
                  conozcas.
                </li>
                <li>Escribe abajo cuánto mide en la realidad.</li>
              </ol>
              <div className="plan-measure-status" role="status">
                <span>{Math.min(points.length, 2)}/2 puntos marcados</span>
                {!!points.length && (
                  <button
                    type="button"
                    className="pm-button"
                    onClick={() => {
                      setPoints([]);
                      setDistance("");
                      setSavedScale(false);
                    }}
                  >
                    Volver a marcar
                  </button>
                )}
              </div>
              <label htmlFor="plan-reference-distance">
                {t("import.distance")}
                <input
                  id="plan-reference-distance"
                  type="number"
                  min={0.01}
                  max={1000}
                  step="any"
                  inputMode="decimal"
                  placeholder="Ej. 4,50"
                  aria-describedby="plan-measure-help"
                  value={distance}
                  onChange={(event) => setDistance(event.target.value)}
                />
              </label>
              <p id="plan-measure-help" className="plan-field-explanation">
                Usa una longitud, no el área del ambiente en m².
              </p>
              <label className="plan-check">
                <input
                  type="checkbox"
                  checked={ocr}
                  onChange={(event) => setOcr(event.target.checked)}
                />
                <span>
                  {t("import.ocr")}
                  <small>
                    Ayuda a leer los nombres y las cotas. Puede tardar hasta 2
                    minutos.
                  </small>
                </span>
              </label>
              <details className="plan-import-options">
                <summary>Ajustes avanzados · opcional</summary>
                <div className="plan-import-options-body">
                  <p className="plan-field-explanation">
                    Puedes dejar estos valores como están y revisarlos después.
                  </p>
                  <details className="plan-import-options">
                    <summary>{t("import.coordinates")}</summary>
                    {[0, 1].map((index) => (
                      <div className="plan-import-pair" key={index}>
                        {[0, 1].map((axis) => (
                          <label key={axis}>
                            {index + 1} · {axis === 0 ? "X" : "Y"}
                            <input
                              type="number"
                              min={0}
                              max={
                                axis === 0 ? prepared?.width : prepared?.height
                              }
                              value={points[index]?.[axis] ?? ""}
                              onChange={(event) =>
                                setPoints((current) => {
                                  const next: PlanPoint[] = [
                                    [...(current[0] ?? [0, 0])],
                                    [...(current[1] ?? [0, 0])],
                                  ];
                                  next[index][axis] = Number(
                                    event.target.value,
                                  );
                                  return next;
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    ))}
                  </details>
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
                      onChange={(event) => {
                        setWallHeight(Number(event.target.value));
                        setWallHeightSet(true);
                      }}
                    />
                  </label>
                  <p className="plan-field-explanation">
                    Se usa solo como altura inicial de los muros en 3D. El valor
                    de 2,80 m es una estimación hasta que lo confirmes.
                  </p>
                  <label className="plan-check">
                    <input
                      type="checkbox"
                      checked={manual}
                      disabled={!!source?.cad}
                      onChange={(event) => setManual(event.target.checked)}
                    />
                    {t("import.manual")}
                  </label>
                </div>
              </details>
              {!draft && !replaceSheetId && (
                <p className="plan-field-explanation">
                  Si no conoces ninguna longitud, elige «Guardar plano sin
                  medidas». Podrás indicarla después para generar el 3D.
                </p>
              )}
            </fieldset>
          )}
        </aside>
        <main>
          {previewOnly&&<p className="pm-alert" role="alert">Esta hoja antigua solo conservó una vista previa reducida. Para detectar muebles pequeños, pulsa «Cambiar» y carga de nuevo la imagen original. Al guardarla se conservará su resolución de análisis.</p>}
          {prepared &&
            source &&
            !source.cad &&
            viewType === "plan" &&
            discipline === "architecture" && (
              <RasterNeuralPanel
                canvas={prepared}
                projectId={blueprint.projectId}
                proposal={neuralProposal}
                disabled={busy || !!draft}
                onBusy={(value) => {
                  setNeuralBusy(value);
                  setBusy(value);
                }}
                onResult={(proposal) => {
                  setNeuralResult({ canvas: prepared, proposal });
                  setManual(false);
                  setShowNeural(true);
                  setDraft(null);
                }}
              />
            )}
          <div className="plan-preview-heading">
            <strong>{draft ? "Lo que encontró Ark" : "Tu plano"}</strong>
            <span>{source ? selectedLevel?.name : "Vista previa"}</span>
          </div>
          {neuralProposal && (
            <label className="plan-check">
              <input
                type="checkbox"
                checked={showNeural}
                onChange={(e) => setShowNeural(e.target.checked)}
              />
              Mostrar detecciones de IA sobre la imagen
            </label>
          )}
          <p className="plan-preview-destination">
            <Info size={14} />
            <span>
              Se guardará en{" "}
              <b>
                Plano 2D → Hojas del proyecto →{" "}
                {selectedLevel?.name ?? "Piso seleccionado"}
              </b>
            </span>
          </p>
          <p className="plan-import-help">
            {!source
              ? "Elige un archivo. Aparecerá aquí para revisarlo."
              : source.cad
                ? "El archivo conserva sus líneas y capas. Abre el CAD para revisar y preparar su modelo."
                : viewType !== "plan"
                  ? "Vista de referencia · verifica que las cotas y los textos sean legibles."
                  : t(
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
                  if (busy || draft || (viewType !== "plan" && !perspective))
                    return;
                  const matrix = event.currentTarget.getScreenCTM();
                  if (!matrix) return;
                  const point = new DOMPoint(
                    event.clientX,
                    event.clientY,
                  ).matrixTransform(matrix.inverse());
                  if (
                    point.x < 0 ||
                    point.y < 0 ||
                    point.x > prepared.width ||
                    point.y > prepared.height
                  )
                    return;
                  setPoints((current) =>
                    current.length >= (perspective ? 4 : 2)
                      ? [[point.x, point.y]]
                      : [...current, [point.x, point.y]],
                  );
                }}
              >
                <image
                  href={
                    showNeural && neuralProposal
                      ? neuralProposal.overlay
                      : preview
                  }
                  width={prepared.width}
                  height={prepared.height}
                />
                {draft?.rooms.map((room) => (
                  <path
                    key={room.id}
                    d={roomPath(room)}
                    fillRule="evenodd"
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
          <div className="plan-import-destination">
            <Info size={18} />
            <div>
              <strong>¿Dónde van estos datos?</strong>
              <p>
                El plano se guarda en{" "}
                <b>
                  Plano 2D → Hojas del proyecto →{" "}
                  {selectedLevel?.name ?? "Piso seleccionado"}
                </b>
                . La medida define el tamaño real; la altura se usa para
                levantar los muros en <b>Estudio 3D</b>.
              </p>
              <p>
                {draft
                  ? "Guarda la propuesta para incorporar sus elementos al proyecto."
                  : "Puedes explorar esta vista sin guardar. Elige Guardar cuando quieras incorporarla al proyecto."}
              </p>
            </div>
          </div>
          {busy && !neuralBusy && (
            <p role="status">
              {t("import.processing")} {Math.round(progress * 100)}%
            </p>
          )}
          {(error || preparation.error) && (
            <p role="alert" className="pm-alert pm-danger">
              {error || preparation.error}
            </p>
          )}
          {source && !source.cad && viewType !== "plan" && (
            <section className="plan-import-result">
              <h3>Conservar referencia</h3>
              <p>
                El texto del PDF se conserva. Para una foto o un PDF escaneado,
                activa la lectura OCR.
              </p>
              <label className="plan-check">
                <input
                  type="checkbox"
                  checked={ocr}
                  onChange={(e) => setOcr(e.target.checked)}
                />
                Leer cotas y cuadros con OCR
              </label>
              {busy && (
                <p role="status">
                  Leyendo referencia… {Math.round(progress * 100)}%
                </p>
              )}
              <button
                type="button"
                className="pm-button pm-primary"
                disabled={busy || !prepared}
                onClick={() => void saveReference()}
              >
                Guardar referencia
              </button>
            </section>
          )}
          {draft && (
            <section className="plan-import-result">
              <h3>3 · {t("import.review")}</h3>
              <p>
                {draft.walls.length} {t("editor.walls")} · {draft.rooms.length}{" "}
                {t("editor.rooms")} · {draft.review!.text.length}{" "}
                {t("import.texts")}
              </p>
              {neuralProposal && (
                <p>
                  {draft.doors.length} puertas · {draft.windows.length} ventanas
                  · {draft.fixtures?.length ?? 0} objetos con familia 3D. Los
                  símbolos sin muro asociado quedan en la superposición para
                  revisión.
                </p>
              )}
              {!!draft.slabs?.length && (
                <p>
                  {neuralProposal
                    ? `${draft.slabs.length} contornos cerrados propuestos a partir de los muros de IA. Revisa sus límites y huecos.`
                    : `${draft.slabs.length} superficies propuestas. Revisa sus contornos antes de incorporarlas al modelo.`}
                </p>
              )}
              <p>
                {neuralProposal
                  ? "La red propone categorías y contornos. El 3D conserva los elementos compatibles; revisa alturas, encuentros y símbolos que quedaron sin asociación."
                  : t("import.limitations")}
              </p>
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
                    {neuralProposal
                      ? "Comprueba cada recorte: puedes corregir puerta/ventana y desmarcar una propuesta incorrecta. Las alturas todavía son aproximadas."
                      : t("import.symbolProposalsHint")}
                  </p>
                  {[...draft.doors, ...draft.windows].map((item,index) => (
                    <fieldset className="symbol-review-card" key={item.id}>
                    <legend>Abertura {index+1}</legend>
                    {neuralProposal&&prepared&&preview&&<svg width="160" height="100" viewBox={`${item.x-Math.max(80,item.width*1.2)/2} ${item.y-Math.max(80,item.width*1.2)/2} ${Math.max(80,item.width*1.2)} ${Math.max(80,item.width*1.2)}`} role="img" aria-label={`Recorte de abertura ${index+1}`}><image href={preview} width={prepared.width} height={prepared.height}/><circle cx={item.x} cy={item.y} r="5" fill="none" stroke="#b22a84" strokeWidth="2"/></svg>}
                    {neuralProposal&&<label>Tipo según el plano<select aria-label={`Tipo de abertura ${index+1}`} value={draft.doors.some(o=>o.id===item.id)?'door':'window'} onChange={e=>setDraft(reclassifyRasterOpening(draft,item.id,e.target.value as 'door'|'window',wallHeight))}><option value="door">Puerta</option><option value="window">Ventana</option></select></label>}
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
                      {draft.doors.some((door) => door.id === item.id)
                        ? t("editor.door")
                        : t("editor.window")}{" "}
                      · ({Math.round(item.x)}, {Math.round(item.y)})
                    </label></fieldset>
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
            </section>
          )}
        </main>
      </div>
      {source && !source.cad && viewType === "plan" && !perspective && (
        <footer className="plan-import-footer">
          <div role="status">
            <strong>
              {busy
                ? "Procesando plano…"
                : draft
                  ? "Revisa antes de guardar"
                  : "Siguiente paso"}
            </strong>
            <p>
              {draft
                ? "Se guardarán los elementos de esta propuesta en Plano 2D y Estudio 3D."
                : !neuralProposal && !manual && discipline === "architecture"
                  ? "Pulsa «Detectar elementos con IA» en el panel del plano."
                  : measureHint}
            </p>
          </div>
          <div className="plan-import-footer-actions">
            {draft ? (
              <>
                <button
                  type="button"
                  className="pm-button"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  {t("import.back")}
                </button>
                <button
                  type="button"
                  className="pm-button pm-primary"
                  disabled={busy || (!!replaceSheetId && !confirmReplace)}
                  onClick={() => void save(!!neuralProposal)}
                >
                  {neuralProposal ? "Guardar y ver en 3D" : t("import.save")}
                </button>
              </>
            ) : (
              <>
                {!replaceSheetId && (
                  <button
                    type="button"
                    className="pm-button"
                    disabled={busy || !prepared}
                    onClick={() => void saveReference()}
                  >
                    Guardar plano sin medidas
                  </button>
                )}
                <button
                  type="button"
                  className="pm-button pm-primary"
                  disabled={
                    busy ||
                    !prepared ||
                    !analysisReady ||
                    (!manual &&
                      discipline === "architecture" &&
                      !neuralProposal)
                  }
                  onClick={() => void analyze()}
                >
                  {neuralProposal
                    ? "Preparar 3D con estas detecciones"
                    : t("import.analyze")}
                </button>
              </>
            )}
          </div>
        </footer>
      )}
    </dialog>
  );
}
