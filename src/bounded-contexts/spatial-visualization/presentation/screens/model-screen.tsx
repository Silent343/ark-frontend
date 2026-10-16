"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import {
  BoxSelect,
  Building2,
  Check,
  CircleGauge,
  Eye,
  EyeOff,
  Footprints,
  Layers3,
  Moon,
  Orbit,
  Palette,
  Rotate3D,
  Sun,
  Sunset,
} from "lucide-react";
import type {
  CameraPreset,
  LightingPreset,
  MaterialPreset,
  ModelViewMode,
} from "@/bounded-contexts/spatial-visualization/presentation/components/building-scene";
import { useProjectWorkspace } from "@/composition/presentation/hooks/use-project-workspace";
import {
  ErrorState,
  PageHeader,
  Panel,
  Skeleton,
} from "@/shared/presentation/components/ui";
import { GlobalSiteSelector } from "@/bounded-contexts/site-planning/presentation/components/global-site-selector";
import type { ConstructionSiteSelection } from "@/bounded-contexts/site-planning/public";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { useRenderSettings } from "../use-render-settings";
import { useCadReconstruction } from "../use-cad-reconstruction";
import { ModelInspector } from "../components/model-inspector";
import { useCanonicalModel } from "../use-canonical-model";
import { ModelPreparationPanel } from "../components/model-preparation-panel";
import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
import { PlanImportDialog } from "@/bounded-contexts/plan-digitization/presentation/components/plan-import-dialog";

const BuildingScene = dynamic(
  () =>
    import("@/bounded-contexts/spatial-visualization/presentation/components/building-scene").then(
      (module) => module.BuildingScene,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);

const materials: MaterialPreset[] = ["Concrete", "Brick", "Wood", "Glass"];
const materialLabels: Record<MaterialPreset, string> = {
  Concrete: "Concreto",
  Brick: "Ladrillo",
  Wood: "Madera",
  Glass: "Vidrio",
};
const lightingOptions: {
  id: LightingPreset;
  label: string;
  icon: typeof Sun;
}[] = [
  { id: "Day", label: "Día", icon: Sun },
  { id: "Sunset", label: "Atardecer", icon: Sunset },
  { id: "Night", label: "Noche", icon: Moon },
];
const cameraOptions: { id: CameraPreset; label: string; icon: typeof Orbit }[] =
  [
    { id: "Isometric", label: "Isométrica", icon: Orbit },
    { id: "Top", label: "Superior", icon: BoxSelect },
    { id: "Walkthrough", label: "Recorrido", icon: Footprints },
  ];

/** Navigable procedural 3D presentation studio. */
export function ModelScreen({ projectId }: { projectId: string }) {
  const {
    data: workspace,
    loading,
    error,
    reload,
  } = useProjectWorkspace(projectId);
  const reconstruction = useCadReconstruction(workspace?.blueprint);
  const canonical = useCanonicalModel(
    reconstruction.blueprint ?? workspace?.blueprint,
    reconstruction.correspondenceResults,
  );
  const data = workspace
    ? {
        ...workspace,
        blueprint:
          canonical.blueprint ??
          reconstruction.blueprint ??
          workspace.blueprint,
      }
    : null;
  const { t } = useI18n();
  const { settings: renderSettings, update: updateRenderSettings } =
    useRenderSettings(projectId);
  const [material, setMaterial] = useState<MaterialPreset>("Concrete");
  const [lighting, setLighting] = useState<LightingPreset>("Day");
  const [camera, setCamera] = useState<CameraPreset>("Isometric");
  const [viewMode, setViewMode] = useState<ModelViewMode>("Architecture");
  const [showRoof, setShowRoof] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [isolatedLevel, setIsolatedLevel] = useState<number | "All">("All");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    null,
  );
  const [familyNotice, setFamilyNotice] = useState("");
  const [recognizeImage, setRecognizeImage] = useState(false);
  const [siteSelection, setSiteSelection] =
    useState<ConstructionSiteSelection | null>(null);
  if (loading) return <ModelSkeleton />;
  if (reconstruction.loading)
    return (
      <div className="pm-card pm-empty" role="status">
        <Layers3 size={28} />
        <h2>Reconstruyendo el edificio</h2>
        <p>Alineando plantas, aberturas y superficies del CAD…</p>
      </div>
    );
  if (error || reconstruction.error || !data)
    return (
      <ErrorState
        message={
          error ?? reconstruction.error ?? "No project data was returned."
        }
        onRetry={reload}
      />
    );
  const levelCount = Math.max(1, data.blueprint.levels.length);
  if (canonical.report && canonical.report.state !== "RECONSTRUCTED")
    return (
      <ModelPreparationPanel
        plan={data.blueprint}
        report={canonical.report}
        error={canonical.error}
        onRetry={reload}
      />
    );

  return (
    <div className="workspace-focus-surface model-focus-shell">
      {recognizeImage && workspace && (
        <PlanImportDialog
          blueprint={workspace.blueprint}
          documents={[]}
          initialSheetId={workspace.blueprint.sheets?.at(-1)?.id}
          onClose={() => setRecognizeImage(false)}
          onSave={async (next) => {
            await planDigitization.saveBlueprint.execute(next);
            await reload();
          }}
        />
      )}
      <PageHeader
        className="model-focus-header"
        eyebrow={`Modelo 3D · ${data.project.name}`}
        title="Estudio del modelo"
        description="Selecciona elementos, comprueba sus medidas y revisa su origen en el plano."
        actions={
          <>
            {!data.blueprint.cad && !!data.blueprint.sheets?.length && (
              <button
                type="button"
                className="pm-button"
                onClick={() => setRecognizeImage(true)}
              >
                Reconocer imagen con IA
              </button>
            )}
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9ddd4] bg-[#fbfbf7] px-3.5 text-xs font-semibold"
            >
              Volver al proyecto
            </Link>
            <Link
              href={`/projects/${projectId}/editor?mode=edit`}
              className="pm-button pm-primary"
            >
              <BoxSelect size={15} /> Plano 2D
            </Link>
          </>
        }
      />
      <div className="model-site-strip">
        {showTerrain ? (
          <GlobalSiteSelector
            projectId={projectId}
            onSelectionChange={setSiteSelection}
          />
        ) : (
          <div className="model-document-strip">
            <span>
              <Layers3 size={15} />{" "}
              {data.blueprint.cad?.sourceName ?? "Plano del proyecto"}
            </span>
            <span>
              {levelCount} {levelCount === 1 ? "nivel" : "niveles"} · Propuesta
              para revisión
            </span>
          </div>
        )}
      </div>
      <div className="model-workbench">
        <Panel className="model-scene-panel overflow-hidden">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#dfe2d9] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2 animate-pulse rounded-full bg-[#4d9a6a]" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.14em]">
                Render en tiempo real
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#dce0d8] bg-white px-3 text-[10px] font-semibold transition hover:border-[#b8c0b6]">
                <input
                  type="checkbox"
                  checked={showTerrain}
                  onChange={(event) => setShowTerrain(event.target.checked)}
                  className="size-4 accent-[#2563eb]"
                />
                Mostrar terreno
              </label>
              <button
                disabled={!data.blueprint.roofs?.length}
                title={
                  !data.blueprint.roofs?.length
                    ? "Define zonas de cubierta en el editor 2D"
                    : undefined
                }
                onClick={() => setShowRoof((value) => !value)}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#dce0d8] bg-white px-3 text-[10px] font-semibold"
              >
                {showRoof ? <Eye size={13} /> : <EyeOff size={13} />} Cubiertas
                ({data.blueprint.roofs?.length ?? 0})
              </button>
            </div>
          </div>
          <div className="model-scene-stage relative">
            <BuildingScene
              blueprint={data.blueprint}
              floors={levelCount}
              material={material}
              lighting={lighting}
              cameraPreset={camera}
              modelViewMode={viewMode}
              renderSettings={renderSettings}
              showRoof={showRoof}
              isolatedLevel={isolatedLevel}
              selectedElementId={selectedElementId}
              onSelectElement={
                camera === "Walkthrough" ? undefined : setSelectedElementId
              }
              siteSelection={
                showTerrain ? (siteSelection ?? undefined) : undefined
              }
            />
            <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/40 bg-[#111815]/75 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-white backdrop-blur">
              {camera === "Walkthrough"
                ? "Haz clic para entrar · WASD · apunta y haz clic en una puerta · Esc"
                : "Órbita · rueda para zoom · arrastra para rotar"}
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/40 bg-white/75 px-3 py-2 text-[10px] font-semibold text-[#3f4a44] backdrop-blur">
              {viewMode === "Structure"
                ? data.blueprint.cad
                  ? "Columnas y losas detectadas · muros de referencia"
                  : "Estructura portante · vigas · columnas · nodos"
                : data.blueprint.sheets?.some((sheet) => sheet.neural)
                  ? `${levelCount} nivel · ${data.blueprint.walls.length} tramos de muro · ${data.blueprint.doors.length + data.blueprint.windows.length} aberturas · ${data.blueprint.fixtures?.length ?? 0} objetos`
                  : `${levelCount} ${levelCount === 1 ? "nivel" : "niveles"} · ${data.blueprint.rooms.length} ambientes · ${data.blueprint.walls.length} muros${showTerrain && siteSelection ? ` · lote ${siteSelection.lotAreaM2} m²` : ""}`}
            </div>
          </div>
        </Panel>

        <aside className="model-control-rail space-y-5">
          {data.blueprint.sheets
            ?.filter((sheet) => sheet.neural)
            .map((sheet) => (
              <details className="model-inspector-panel" key={sheet.id} open>
                <summary className="model-inspector-heading">
                  De la imagen al 3D
                </summary>
                {/* Local mask previews are already encoded; no image optimizer or remote request is needed. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sheet.neural!.overlay}
                  alt="Máscaras reales de IA sobre el plano original"
                  style={{
                    width: "100%",
                    maxHeight: 280,
                    objectFit: "contain",
                    background: "white",
                    borderRadius: 8,
                  }}
                />
                <p className="model-inspector-help">
                    {sheet.neural!.spaces?.length ?? 0} espacios, {sheet.neural!.walls.length} segmentos de muro y{" "}
                  {sheet.neural!.instances.length} regiones de símbolos
                  detectadas. El 3D usa las aberturas asociadas a muros y los
                  objetos con familia compatible.
                </p>
                  {sheet.neural!.symbols && <p className="model-inspector-help">
                    Mobiliario especializado: {sheet.neural!.symbols!.items.length} propuestas;
                    {" "}{sheet.neural!.symbols!.items.filter(i=>i.status==='confirmed').length} confirmadas para 3D.
                    {!sheet.neural!.symbols!.model.classes.includes('plant')&&' Plantas no soportadas.'} Alturas y detalles aproximados.
                  </p>}
                <button
                  type="button"
                  className="pm-button"
                  onClick={() => setRecognizeImage(true)}
                >
                  Comparar y volver a detectar
                </button>
              </details>
            ))}
          {familyNotice && (
            <p className="model-inspector-help" role="status">
              {familyNotice}
            </p>
          )}
          <ModelInspector
            onSaveFamily={
              !("role" in data.project) ||
              !["owner", "architect", "collaborator"].includes(
                String(data.project.role),
              )
                ? undefined
                : async (ids, assignment) => {
                    if (!workspace) return;
                    const choices = new Map(
                      Object.entries(workspace.blueprint.fixtureFamilies ?? {}),
                    );
                    for (const id of ids) {
                      if (assignment) choices.set(id, assignment);
                      else choices.delete(id);
                    }
                    await planDigitization.saveBlueprint.execute({
                      ...workspace.blueprint,
                      fixtureFamilies: Object.fromEntries(choices),
                    });
                    setFamilyNotice(
                      `Representación guardada en ${ids.length} ${ids.length === 1 ? "elemento" : "elementos"}.`,
                    );
                    await reload();
                  }
            }
            canonicalGraph={canonical.graph}
            sourcePlan={reconstruction.rawBlueprint}
            plan={data.blueprint}
            selectedId={selectedElementId}
            onSelect={(id) => {
              setSelectedElementId(id);
              if (id) setIsolatedLevel("All");
            }}
          />
          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Layers3 size={16} className="text-[#65716b]" />
              <h2 className="text-sm font-semibold">Capa del modelo</h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setViewMode("Architecture")}
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-[10px] font-semibold transition ${viewMode === "Architecture" ? "border-[#596151] bg-[#30382f] text-white" : "border-[#e0e3dc] bg-white text-[#758079]"}`}
              >
                <Building2 size={17} /> Arquitectura
              </button>
              <button
                onClick={() => setViewMode("Structure")}
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-[10px] font-semibold transition ${viewMode === "Structure" ? "border-[#3268e8] bg-[#0d1830] text-white" : "border-[#e0e3dc] bg-white text-[#758079]"}`}
              >
                <Layers3 size={17} /> Estructura
              </button>
            </div>
            <p className="mt-3 text-[9px] leading-4 text-[#849089]">
              {data.blueprint.cad
                ? "Aísla columnas y losas detectadas; los muros se muestran transparentes. No se infieren vigas ni armaduras ausentes en el CAD."
                : "La vista portante aísla columnas, vigas y nodos generados desde la geometría semántica."}
            </p>
          </Panel>
          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Layers3 size={16} className="text-[#65716b]" />
              <h2 className="text-sm font-semibold">Nivel visible</h2>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-[#849089]">
              Los niveles provienen del plano semántico, no de pisos inventados
              por el visor.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setIsolatedLevel("All")}
                className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${isolatedLevel === "All" ? "border-[#596151] bg-[#30382f] text-white" : "border-[#e0e3dc] bg-white text-[#758079]"}`}
              >
                Todos
              </button>
              {Array.from({ length: levelCount }, (_, index) => index + 1).map(
                (level) => (
                  <button
                    key={data.blueprint.levels[level - 1].id}
                    onClick={() => setIsolatedLevel(level)}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${isolatedLevel === level ? "border-[#596151] bg-[#30382f] text-white" : "border-[#e0e3dc] bg-white text-[#758079]"}`}
                  >
                    {data.blueprint.levels[level - 1].name}
                  </button>
                ),
              )}
            </div>
          </Panel>
          {!!data.blueprint.services?.length && (
            <Panel className="p-5">
              <h2 className="text-sm font-semibold">
                {t("model.servicesTitle")}
              </h2>
              <p className="mt-2 text-xs text-[#66736d]">
                {t("model.servicesHint")}
              </p>
              <p className="mt-2 text-xs text-[#66736d]">
                {t("model.routesHint").replace(
                  "{count}",
                  String(data.blueprint.routes?.length ?? 0),
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-[#e5b546]" />{" "}
                  {t("model.electrical")}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-[#1885b5]" />{" "}
                  {t("model.plumbing")}
                </span>
              </div>
            </Panel>
          )}
          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Rotate3D size={16} className="text-[#65716b]" />
              <h2 className="text-sm font-semibold">Cámara</h2>
            </div>
            <div className="mt-4 grid gap-2">
              {cameraOptions.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setCamera(id)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-xs font-semibold transition ${camera === id ? "border-[#596151] bg-[#eef0e9] text-[#30382f]" : "border-[#e0e3dc] bg-white text-[#758079] hover:border-[#b8c0b6]"}`}
                >
                  <Icon size={16} />
                  {label}
                  {camera === id && <Check size={14} className="ml-auto" />}
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <Palette size={16} className="text-[#65716b]" />
              <h2 className="text-sm font-semibold">Material principal</h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {materials.map((item) => (
                <button
                  key={item}
                  onClick={() => setMaterial(item)}
                  className={`rounded-xl border p-3 text-left transition ${material === item ? "border-[#596151] bg-[#eef0e9]" : "border-[#e0e3dc] bg-white"}`}
                >
                  <span
                    className={`block size-7 rounded-lg ${item === "Concrete" ? "bg-[#d5d2c9]" : item === "Brick" ? "bg-[#a95e43]" : item === "Wood" ? "bg-[#98704c]" : "bg-[#b8d9dc]"}`}
                  />
                  <span className="mt-2 block text-[10px] font-semibold">
                    {materialLabels[item]}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <CircleGauge size={16} className="text-[#65716b]" />
              <h2 className="text-sm font-semibold">Ambiente</h2>
            </div>
            <div className="mt-4 flex gap-2">
              {lightingOptions.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setLighting(id)}
                  className={`flex flex-1 flex-col items-center gap-2 rounded-xl border py-3 text-[9px] font-semibold ${lighting === id ? "border-[#596151] bg-[#30382f] text-white" : "border-[#e0e3dc] bg-white text-[#758079]"}`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
            <div className="render-controls mt-4">
              <label>
                {t("render.exposure")} · {renderSettings.exposure.toFixed(2)}
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={renderSettings.exposure}
                  onChange={(event) =>
                    updateRenderSettings({
                      exposure: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                {t("render.azimuth")} · {renderSettings.sunAzimuth}°
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={renderSettings.sunAzimuth}
                  onChange={(event) =>
                    updateRenderSettings({
                      sunAzimuth: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                {t("render.elevation")} · {renderSettings.sunElevation}°
                <input
                  type="range"
                  min={5}
                  max={85}
                  disabled={lighting !== "Day"}
                  value={renderSettings.sunElevation}
                  onChange={(event) =>
                    updateRenderSettings({
                      sunElevation: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="plan-check">
                <input
                  type="checkbox"
                  checked={renderSettings.shadows}
                  onChange={(event) =>
                    updateRenderSettings({ shadows: event.target.checked })
                  }
                />
                {t("render.shadows")}
              </label>
              <p className="text-xs leading-relaxed">{t("render.note")}</p>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function ModelSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="mt-3 h-4 w-[36rem] max-w-full" />
      <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_310px]">
        <Skeleton className="h-[680px]" />
        <div className="space-y-5">
          <Skeleton className="h-64" />
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}
