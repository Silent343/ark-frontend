"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Box,
  BrickWall,
  CircleAlert,
  Columns3,
  DoorOpen,
  Expand,
  Hand,
  Image as ImageIcon,
  Layers,
  CircuitBoard,
  PanelsTopLeft,
  Maximize2,
  MousePointer2,
  Move,
  Plus,
  Ruler,
  ScanLine,
  SquareDashed,
  Trash2,
  Undo2,
  Users,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Blueprint, ServiceKind, Wall } from "@/bounded-contexts/plan-digitization/domain/entities/blueprint";
import type {
  EditorTool,
  ResizeHandle,
} from "@/bounded-contexts/plan-digitization/presentation/components/blueprint-canvas";
import { useProjectWorkspace } from "@/composition/presentation/hooks/use-project-workspace";
import {
  ErrorState,
  PageHeader,
  Panel,
  Skeleton,
} from "@/shared/presentation/components/ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { useWorkspace } from "@/composition/presentation/workspace-context";
import {
  reconcilePlanReview,
  planElements,
  planTopologyIssues,
} from "../../domain/plan-review";
import { PlanImportDialog } from "../components/plan-import-dialog";
import { PlanSourceReviewPanel } from "../components/plan-source-review-panel";
import { metersPerUnit } from "../../domain/plan-calibration";
import { sourceSheetForElement } from "../../domain/plan-provenance";
import { geometryOnLevel } from "../../domain/plan-levels";
import { validateSharedBlueprint } from "../../domain/blueprint-rules";
import { useBlueprintSave } from "../use-blueprint-save";

const BlueprintCanvas = dynamic(
  () =>
    import("@/bounded-contexts/plan-digitization/presentation/components/blueprint-canvas").then(
      (module) => module.BlueprintCanvas,
    ),
  { loading: () => <Skeleton className="h-full w-full rounded-none" /> },
);

const tools: {
  id: EditorTool;
  key: string;
  label: string;
  icon: typeof MousePointer2;
}[] = [
  {
    id: "select",
    key: "editor.select",
    label: "Seleccionar",
    icon: MousePointer2,
  },
  { id: "pan", key: "editor.pan", label: "Mover plano", icon: Hand },
  { id: "room", key: "editor.roomTool", label: "Ambiente", icon: SquareDashed },
  { id: "wall", key: "editor.wall", label: "Muro", icon: BrickWall },
  { id: "door", key: "editor.door", label: "Puerta", icon: DoorOpen },
  { id: "window", key: "editor.window", label: "Ventana", icon: Columns3 },
  { id: "column", key: "editor.column", label: "Columna", icon: Plus },
  { id: "roof", key: "editor.roof", label: "Cubierta", icon: PanelsTopLeft },
  { id: "service", key: "editor.service", label: "Instalación", icon: CircuitBoard },
  { id: "delete", key: "editor.delete", label: "Eliminar", icon: Trash2 },
];

function nearestWall(walls: Wall[], x: number, y: number) {
  return walls.reduce(
    (nearest, wall) => {
      const dx = wall.end[0] - wall.start[0];
      const dy = wall.end[1] - wall.start[1];
      const lengthSquared = dx * dx + dy * dy || 1;
      const ratio = Math.max(
        0,
        Math.min(
          1,
          ((x - wall.start[0]) * dx + (y - wall.start[1]) * dy) / lengthSquared,
        ),
      );
      const point = {
        x: wall.start[0] + ratio * dx,
        y: wall.start[1] + ratio * dy,
      };
      const distance = Math.hypot(x - point.x, y - point.y);
      return distance < nearest.distance ? { wall, point, distance } : nearest;
    },
    { wall: walls[0], point: { x, y }, distance: Number.POSITIVE_INFINITY },
  );
}

function elementPosition(blueprint: Blueprint, id: string) {
  const wall = blueprint.walls.find((item) => item.id === id);
  if (wall)
    return {
      x: (wall.start[0] + wall.end[0]) / 2,
      y: (wall.start[1] + wall.end[1]) / 2,
    };
  const room = blueprint.rooms.find((item) => item.id === id);
  if (room) return { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  const item = [
    ...blueprint.doors,
    ...blueprint.windows,
    ...blueprint.columns,
    ...(blueprint.stairs ?? []),
    ...(blueprint.roofs ?? []),
    ...(blueprint.services ?? []),
  ].find((candidate) => candidate.id === id);
  return item ? { x: item.x, y: item.y } : null;
}

function resizeBounds(
  bounds: { x: number; y: number; width: number; height: number },
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  minSize = 30,
) {
  let { x, y, width, height } = bounds;
  if (handle.includes("e")) width += deltaX;
  if (handle.includes("s")) height += deltaY;
  if (handle.includes("w")) {
    x += deltaX;
    width -= deltaX;
  }
  if (handle.includes("n")) {
    y += deltaY;
    height -= deltaY;
  }
  if (width < minSize) {
    if (handle.includes("w")) x -= minSize - width;
    width = minSize;
  }
  if (height < minSize) {
    if (handle.includes("n")) y -= minSize - height;
    height = minSize;
  }
  return { x, y, width, height };
}

/** Member initials are an accessible fallback until profile photos are uploaded. */
function memberInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Interactive semantic-plan correction workspace. */
export function EditorScreen({ projectId }: { projectId: string }) {
  return <ProjectEditor key={projectId} projectId={projectId} />;
}

/** A project switch remounts editor drafts, history and save state together. */
function ProjectEditor({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { data, loading, error, reload } = useProjectWorkspace(projectId);
  const { data: managementData } = useWorkspace();
  const [tool, setTool] = useState<EditorTool>("select");
  const [activeLevelId, setActiveLevelId] = useState("");
  const [activeSheetId, setActiveSheetId] = useState("");
  const [serviceKind, setServiceKind] = useState<ServiceKind>("outlet");
  const [routeTargetId, setRouteTargetId] = useState("");
  const searchParams = useSearchParams();
  const editMode = searchParams.get("mode") === "edit";
  const [importOpen, setImportOpen] = useState(
    searchParams.get("import") === "1",
  );
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("element_id"),
  );
  const [overlayOpacity, setOverlayOpacity] = useState(24);
  const [editedBlueprint, setEditedBlueprint] = useState<Blueprint | null>(
    null,
  );
  const [history, setHistory] = useState<Blueprint[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const save = useBlueprintSave();
  const editedBlueprintRef = useRef<Blueprint | null>(null);
  const dragChanged = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastFittedSource = useRef("");
  const canvasPan = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const canvasResize = useRef<{
    pointerId: number;
    x: number;
    y: number;
    width: number;
    height: number;
    handle: "e" | "s" | "se";
  } | null>(null);

  // Fit a newly loaded source once; subsequent wheel/button zoom remains under user control.
  useEffect(() => {
    if (!editMode || !data) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const plan = editedBlueprint?.projectId === data.blueprint.projectId
        ? editedBlueprint : data.blueprint;
      const sourceKey = `${plan.projectId}:${plan.sheets?.length ?? 0}`;
      if (lastFittedSource.current === sourceKey) return;
      lastFittedSource.current = sourceKey;
      const fitted = Math.floor(Math.min(
        (viewport.clientWidth - 48) / plan.width,
        (viewport.clientHeight - 48) / plan.height,
        1,
      ) * 100);
      setZoom(Math.max(50, Math.min(100, fitted)));
      viewport.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editMode, data, editedBlueprint]);

  const selectedType = useMemo(() => {
    if (!selectedId || !data) return t("editor.none", "Ninguno");
    if (selectedId.startsWith("wall")) return t("editor.wall", "Muro");
    if (selectedId.startsWith("door")) return t("editor.door", "Puerta");
    if (selectedId.startsWith("window")) return t("editor.window", "Ventana");
    if (selectedId.startsWith("column")) return t("editor.column", "Columna");
    if (selectedId.includes("stair")) return t("editor.stair", "Escalera");
    if (selectedId.startsWith("roof")) return "Cubierta";
    if (selectedId.startsWith("service")) return "Instalación";
    if (selectedId.startsWith("room")) return t("editor.room", "Habitación");
    return t("editor.element", "Elemento");
  }, [selectedId, data, t]);

  if (loading) return <EditorSkeleton />;
  if (error || !data)
    return (
      <ErrorState
        message={error ?? "No project data was returned."}
        onRetry={reload}
      />
    );

  const blueprint =
    editedBlueprint?.projectId === data.blueprint.projectId
      ? editedBlueprint
      : data.blueprint;
  const levelId = blueprint.levels.some((item) => item.id === activeLevelId)
    ? activeLevelId : (blueprint.levels.find((item) => item.elevation === 0)?.id ?? blueprint.levels[0].id);
  const currentSheet = blueprint.sheets?.find((item) => item.id === activeSheetId && item.levelId === levelId)
    ?? blueprint.sheets?.find((item) => item.levelId === levelId);
  const visibleBlueprint: Blueprint = {
    ...geometryOnLevel(blueprint, levelId),
    sourceImage: currentSheet?.image ?? (levelId === (blueprint.levels.find((item) => item.elevation === 0)?.id ?? blueprint.levels[0].id) ? blueprint.sourceImage : undefined),
    sourceSize: currentSheet ? { width: currentSheet.width, height: currentSheet.height } : blueprint.sourceSize,
    sourceOffset: currentSheet ? { x: currentSheet.x, y: currentSheet.y } : undefined,
  };
  const addLevel = (basement: boolean) => {
    const elevations = blueprint.levels.map((item) => item.elevation);
    const elevation = basement
      ? Math.min(...elevations) - data.project.floorHeight
      : Math.max(...elevations) + data.project.floorHeight;
    const name = basement
      ? `Sótano ${blueprint.levels.filter((item) => item.elevation < 0).length + 1}`
      : `Piso ${blueprint.levels.filter((item) => item.elevation >= 0).length + 1}`;
    const id = `level-${crypto.randomUUID()}`;
    remember();
    persist({ ...blueprint, levels: [...blueprint.levels, { id, name, elevation }].sort((a, b) => a.elevation - b.elevation) });
    setActiveLevelId(id);
    setActiveSheetId("");
    setSelectedId(null);
  };
  const members = managementData?.coordination.members ?? [];

  if (!editMode) {
    return (
      <div className="mx-auto max-w-[1600px]">
        <PageHeader
          eyebrow={`${t("pm.plans")} · ${data.project.name}`}
          title={t("editor.previewTitle", "Vista previa del plano 2D")}
          description={t(
            "editor.previewDescription",
            "Revisa la distribución general antes de entrar al espacio de edición.",
          )}
          actions={
            <Link
              href={`/projects/${projectId}/editor?mode=edit`}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-xs font-semibold text-white"
            >
              <Maximize2 size={15} />
              {t("editor.openEditor", "Abrir editor")}
            </Link>
          }
        />
        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel className="overflow-hidden">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[#dfe2d9] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#5e8f6f]" />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[.14em]">
                  {t("editor.canvasTitle", "Planta baja · Vista previa")}
                </span>
              </div>
              <span className="rounded-lg bg-[#eceee8] px-2 py-1 font-mono text-[9px]">
                {blueprint.scale}
              </span>
            </div>
            <div className="editor-preview-stage">
              <div
                className="editor-preview-plan"
                style={{
                  aspectRatio: `${blueprint.width}/${blueprint.height}`,
                }}
              >
                <BlueprintCanvas blueprint={visibleBlueprint} overlayOpacity={0.12} />
              </div>
              <Link
                href={`/projects/${projectId}/editor?mode=edit`}
                className="editor-preview-expand"
              >
                <Maximize2 size={15} />
                {t("editor.expandAndEdit", "Expandir y editar")}
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe2d9] px-4 py-3">
              <p className="flex items-center gap-2 text-[10px] text-[#78837d]">
                <Ruler size={13} />
                {t("editor.modeledArea", "Área modelada")}:{" "}
                {blueprint.rooms
                  .reduce((sum, room) => sum + room.area, 0)
                  .toFixed(1)}{" "}
                m²
              </p>
              <p className="font-mono text-[9px] text-[#87918c]">
                {blueprint.width} × {blueprint.height} px
              </p>
            </div>
          </Panel>
          <aside className="space-y-5">
            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <Users size={17} className="text-[#65716b]" />
                <h2 className="text-sm font-semibold">
                  {t(
                    "editor.projectParticipants",
                    "Participantes del proyecto",
                  )}
                </h2>
              </div>
              <div className="editor-participant-list">
                {members.map((member, index) => (
                  <div className="editor-participant" key={member.id}>
                    <span
                      className="editor-member-avatar"
                      data-tone={index % 4}
                    >
                      {memberInitials(member.name)}
                    </span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </span>
                  </div>
                ))}
                {!members.length && (
                  <p className="pm-muted">
                    {t(
                      "editor.noParticipants",
                      "Todavía no hay participantes visibles.",
                    )}
                  </p>
                )}
              </div>
              <Link
                className="pm-button mt-4 w-full"
                href={`/projects/${projectId}/team`}
              >
                {t("editor.viewTeam", "Ver equipo")}
              </Link>
            </Panel>
            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <WandSparkles size={16} className="text-[#ff6a2b]" />
                <h2 className="text-sm font-semibold">
                  {t("editor.semanticReading", "Lectura semántica")}
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  [t("editor.walls", "Muros"), blueprint.walls.length],
                  [
                    t("editor.openings", "Aberturas"),
                    blueprint.doors.length + blueprint.windows.length,
                  ],
                  [t("editor.rooms", "Ambientes"), blueprint.rooms.length],
                ].map(([label, value]) => (
                  <div
                    className="flex items-center justify-between text-xs"
                    key={String(label)}
                  >
                    <span className="text-[#65716b]">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </div>
      </div>
    );
  }

  const persist = (candidate: Blueprint, transient = false) => {
    const current = editedBlueprintRef.current ?? blueprint;
    const next = reconcilePlanReview(current, candidate);
    try {
      validateSharedBlueprint(next as unknown as Record<string, unknown>);
      const oldIssues = new Set(planTopologyIssues(current));
      const newIssue = planTopologyIssues(next).find((issue) => !oldIssues.has(issue));
      if (newIssue) throw new Error(`Revisa el plano: ${newIssue}`);
    } catch (reason) {
      setActionMessage((reason as Error).message);
      return;
    }
    if (transient && !dragChanged.current) remember(current);
    setEditedBlueprint(next);
    editedBlueprintRef.current = next;
    if (transient) {
      dragChanged.current = true;
      save.draft(next);
    } else {
      void save.commit(next).catch(() => undefined);
    }
  };
  const startDragEdit = () => {
    dragChanged.current = false;
  };
  const finishDragEdit = () => {
    if (dragChanged.current && editedBlueprintRef.current)
      void save.commit(editedBlueprintRef.current).catch(() => undefined);
    dragChanged.current = false;
  };
  const remember = (snapshot = editedBlueprintRef.current ?? blueprint) =>
    setHistory((current) => [...current, snapshot].slice(-30));
  const addAt = (x: number, y: number) => {
    if (tool === "select" || tool === "pan" || tool === "delete") return;
    remember();
    const id = `${tool}-${crypto.randomUUID()}`;
    const unit = metersPerUnit(blueprint);
    let next = blueprint;
    if (tool === "room")
      next = {
        ...blueprint,
        rooms: [
          ...blueprint.rooms,
          {
            id,
            levelId,
            sheetId: currentSheet?.id,
            name: t("editor.newRoomName", "Nuevo ambiente"),
            x: Math.max(0, Math.min(blueprint.width - Math.min(3 / unit, blueprint.width), x - 1.5 / unit)),
            y: Math.max(0, Math.min(blueprint.height - Math.min(2.4 / unit, blueprint.height), y - 1.2 / unit)),
            width: Math.min(3 / unit, blueprint.width),
            height: Math.min(2.4 / unit, blueprint.height),
            area: 7.2,
          },
        ],
      };
    if (tool === "wall")
      next = {
        ...blueprint,
        walls: [
          ...blueprint.walls,
          {
            id,
            levelId,
            sheetId: currentSheet?.id,
            start: [Math.max(0, x - 0.8 / unit), y],
            end: [Math.min(blueprint.width, x + 0.8 / unit), y],
            thickness: 0.16 / unit,
            height: 2.8,
          },
        ],
      };
    if (tool === "column")
      next = {
        ...blueprint,
        columns: [...blueprint.columns, { id, levelId, sheetId: currentSheet?.id, x, y, size: 0.3 / unit }],
      };
    if (tool === "door" || tool === "window") {
      const closest = nearestWall(visibleBlueprint.walls, x, y);
      if (!closest.wall) return;
      const opening = {
        id,
        levelId,
        sheetId: currentSheet?.id,
        wallId: closest.wall.id,
        x: closest.point.x,
        y: closest.point.y,
        width: (tool === "door" ? 0.9 : 1.2) / unit,
        rotation:
          (Math.atan2(
            closest.wall.end[1] - closest.wall.start[1],
            closest.wall.end[0] - closest.wall.start[0],
          ) *
            180) /
          Math.PI,
      };
      next =
        tool === "door"
          ? { ...blueprint, doors: [...blueprint.doors, opening] }
          : { ...blueprint, windows: [...blueprint.windows, opening] };
    }
    if (tool === "roof") {
      const width = Math.min(3 / unit, blueprint.width);
      const depth = Math.min(2.4 / unit, blueprint.height);
      next = { ...blueprint, roofs: [...(blueprint.roofs ?? []), {
        id, levelId, sheetId: currentSheet?.id, name: "Cubierta parcial",
        x: Math.max(0, Math.min(blueprint.width - width, x - width / 2)),
        y: Math.max(0, Math.min(blueprint.height - depth, y - depth / 2)),
        width, depth, thickness: 0.18,
        elevation: Math.max(2.4, ...visibleBlueprint.walls.map((wall) => wall.height)),
      }] };
    }
    if (tool === "service") {
      const labels: Record<ServiceKind, string> = { outlet: "Tomacorriente", switch: "Interruptor", light: "Luminaria", panel: "Tablero", water: "Punto de agua", drain: "Desagüe" };
      next = { ...blueprint, services: [...(blueprint.services ?? []), {
        id, levelId, kind: serviceKind, name: labels[serviceKind], x, y,
        sheetId: currentSheet && (["water", "drain"].includes(serviceKind) ? currentSheet.discipline === "plumbing" : currentSheet.discipline === "electrical") ? currentSheet.id : undefined,
      }] };
    }
    persist(next);
    setSelectedId(id);
    setTool("select");
    const definition = tools.find((item) => item.id === tool);
    setActionMessage(
      t("editor.added", "{element} añadido al modelo semántico.").replace(
        "{element}",
        definition
          ? t(definition.key, definition.label)
          : t("editor.element", "Elemento"),
      ),
    );
  };
  const selectElement = (id: string) => {
    if (tool === "delete") {
      setPendingDeleteId(id);
      setSelectedId(id);
      return;
    }
    const element = planElements(blueprint).find((item) => item.id === id);
    const source = element && sourceSheetForElement(blueprint, element);
    if (source) {
      setActiveLevelId(source.levelId);
      setActiveSheetId(source.id);
    }
    setSelectedId(id);
  };
  const requestDelete = (id: string) => {
    setPendingDeleteId(id);
    setSelectedId(id);
  };
  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    remember();
    const id = pendingDeleteId;
    persist({
      ...blueprint,
      rooms: blueprint.rooms.filter((item) => item.id !== id),
      walls: blueprint.walls.filter((item) => item.id !== id),
      doors: blueprint.doors.filter(
        (item) => item.id !== id && item.wallId !== id,
      ),
      windows: blueprint.windows.filter(
        (item) => item.id !== id && item.wallId !== id,
      ),
      columns: blueprint.columns.filter((item) => item.id !== id),
      stairs: blueprint.stairs?.filter((item) => item.id !== id),
      roofs: blueprint.roofs?.filter((item) => item.id !== id),
      services: blueprint.services?.filter((item) => item.id !== id),
      routes: blueprint.routes?.filter((route) => route.fromId !== id && route.toId !== id),
    });
    setSelectedId(null);
    setPendingDeleteId(null);
    setTool("select");
    setActionMessage(
      t(
        "editor.deletedMessage",
        "Elemento eliminado. Usa Deshacer si deseas recuperarlo.",
      ),
    );
  };
  const cancelDelete = () => {
    setPendingDeleteId(null);
    setTool("select");
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous || previous.projectId !== blueprint.projectId) return;
    setHistory((current) => current.slice(0, -1));
    persist(previous);
    setSelectedId(null);
    setActionMessage(t("editor.undoMessage", "Última corrección deshecha."));
  };
  const moveElement = (id: string, deltaX: number, deltaY: number, transient = false) => {
    const current = editedBlueprintRef.current ?? blueprint;
    const movePoint = <T extends { id: string; x: number; y: number }>(
      item: T,
    ) =>
      item.id === id
        ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
        : item;
    persist({
      ...current,
      rooms: current.rooms.map((item) =>
        item.id === id
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
      walls: current.walls.map((item) =>
        item.id === id
          ? {
              ...item,
              start: [item.start[0] + deltaX, item.start[1] + deltaY],
              end: [item.end[0] + deltaX, item.end[1] + deltaY],
            }
          : item,
      ),
      doors: current.doors.map((item) =>
        item.id === id || item.wallId === id
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
      windows: current.windows.map((item) =>
        item.id === id || item.wallId === id
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
      columns: current.columns.map(movePoint),
      stairs: current.stairs?.map(movePoint),
      roofs: current.roofs?.map(movePoint),
      services: current.services?.map(movePoint),
    }, transient);
  };
  const resizeElement = (
    id: string,
    handle: ResizeHandle,
    deltaX: number,
    deltaY: number,
    transient = false,
  ) => {
    const current = editedBlueprintRef.current ?? blueprint;
    const rooms = current.rooms.map((item) => {
      if (item.id !== id) return item;
      const bounds = resizeBounds(item, handle, deltaX, deltaY, 60);
      const ratio =
        (bounds.width * bounds.height) / (item.width * item.height || 1);
      return {
        ...item,
        ...bounds,
        area: Math.max(0.1, Math.round(item.area * ratio * 10) / 10),
      };
    });
    const roofs = current.roofs?.map((item) => item.id === id
      ? (() => { const bounds = resizeBounds({ x: item.x, y: item.y, width: item.width, height: item.depth }, handle, deltaX, deltaY, 40); return { ...item, x: bounds.x, y: bounds.y, width: bounds.width, depth: bounds.height }; })()
      : item);
    const walls = current.walls.map((item) =>
      item.id === id
        ? {
            ...item,
            start:
              handle === "start"
                ? ([item.start[0] + deltaX, item.start[1] + deltaY] as [
                    number,
                    number,
                  ])
                : item.start,
            end:
              handle === "end"
                ? ([item.end[0] + deltaX, item.end[1] + deltaY] as [
                    number,
                    number,
                  ])
                : item.end,
          }
        : item,
    );
    const resizeOpening = <
      T extends {
        id: string;
        x: number;
        y: number;
        width: number;
        rotation: number;
      },
    >(
      item: T,
    ) => {
      if (item.id !== id || (handle !== "start" && handle !== "end"))
        return item;
      const angle = (item.rotation * Math.PI) / 180;
      const start = {
        x: item.x - (Math.cos(angle) * item.width) / 2,
        y: item.y - (Math.sin(angle) * item.width) / 2,
      };
      const end = {
        x: item.x + (Math.cos(angle) * item.width) / 2,
        y: item.y + (Math.sin(angle) * item.width) / 2,
      };
      if (handle === "start") {
        start.x += deltaX;
        start.y += deltaY;
      } else {
        end.x += deltaX;
        end.y += deltaY;
      }
      const width = Math.max(24, Math.hypot(end.x - start.x, end.y - start.y));
      return {
        ...item,
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        width,
        rotation:
          (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
      };
    };
    const columns = current.columns.map((item) => {
      if (item.id !== id) return item;
      const bounds = resizeBounds(
        {
          x: item.x - item.size / 2,
          y: item.y - item.size / 2,
          width: item.size,
          height: item.size,
        },
        handle,
        deltaX,
        deltaY,
        16,
      );
      const size = Math.max(bounds.width, bounds.height);
      return {
        ...item,
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        size,
      };
    });
    const stairs = current.stairs?.map((item) => {
      if (item.id !== id) return item;
      if (item.type === "straight") return item; // Rotated flights are sized numerically in the inspector.
      const bounds = resizeBounds(
        {
          x: item.x - item.radius,
          y: item.y - item.radius,
          width: item.radius * 2,
          height: item.radius * 2,
        },
        handle,
        deltaX,
        deltaY,
        40,
      );
      return {
        ...item,
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        radius: Math.max(bounds.width, bounds.height) / 2,
      };
    });
    persist({
      ...current,
      rooms,
      roofs,
      walls,
      doors: current.doors.map(resizeOpening),
      windows: current.windows.map(resizeOpening),
      columns,
      stairs,
    }, transient);
  };
  const handleWheelZoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.shiftKey) return;
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.max(
      50,
      Math.min(220, zoom + (event.deltaY < 0 ? 10 : -10)),
    );
    if (next === zoom) return;
    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left + viewport.scrollLeft;
    const pointerY = event.clientY - rect.top + viewport.scrollTop;
    const ratio = next / zoom;
    setZoom(next);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = pointerX * ratio - (event.clientX - rect.left);
      viewport.scrollTop = pointerY * ratio - (event.clientY - rect.top);
    });
  };
  const startCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "pan" || event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    canvasPan.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = canvasPan.current;
    const viewport = viewportRef.current;
    if (!state || !viewport || state.pointerId !== event.pointerId) return;
    viewport.scrollLeft = state.left - (event.clientX - state.x);
    viewport.scrollTop = state.top - (event.clientY - state.y);
  };
  const stopCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (canvasPan.current?.pointerId === event.pointerId)
      canvasPan.current = null;
  };
  const startCanvasResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    handle: "e" | "s" | "se",
  ) => {
    event.stopPropagation();
    startDragEdit();
    canvasResize.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: blueprint.width,
      height: blueprint.height,
      handle,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveCanvasResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = canvasResize.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const factor = 100 / zoom;
    const width = state.handle.includes("e")
      ? Math.max(
          640,
          Math.round(state.width + (event.clientX - state.x) * factor),
        )
      : state.width;
    const height = state.handle.includes("s")
      ? Math.max(
          480,
          Math.round(state.height + (event.clientY - state.y) * factor),
        )
      : state.height;
    persist({ ...(editedBlueprintRef.current ?? blueprint), width, height }, true);
  };
  const stopCanvasResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (canvasResize.current?.pointerId === event.pointerId) {
      canvasResize.current = null;
      finishDragEdit();
    }
  };
  const setElementCoordinate = (axis: "x" | "y", value: number) => {
    if (!selectedId || Number.isNaN(value)) return;
    const position = elementPosition(blueprint, selectedId);
    if (!position) return;
    remember();
    moveElement(
      selectedId,
      axis === "x" ? value - position.x : 0,
      axis === "y" ? value - position.y : 0,
    );
  };
  const selectedPosition = selectedId
    ? elementPosition(blueprint, selectedId)
    : null;
  const selectedRoom = blueprint.rooms.find((item) => item.id === selectedId);
  const selectedWall = blueprint.walls.find((item) => item.id === selectedId);
  const selectedOpening = [...blueprint.doors, ...blueprint.windows].find(
    (item) => item.id === selectedId,
  );
  const selectedColumn = blueprint.columns.find(
    (item) => item.id === selectedId,
  );
  const selectedStair = blueprint.stairs?.find(
    (item) => item.id === selectedId,
  );
  const selectedRoof = blueprint.roofs?.find((item) => item.id === selectedId);
  const selectedService = blueprint.services?.find((item) => item.id === selectedId);
  const selectedServiceGroup = selectedService && ["water", "drain"].includes(selectedService.kind) ? "plumbing" : "electrical";
  const connectedRoutes = (blueprint.routes ?? []).filter((route) => route.fromId === selectedService?.id || route.toId === selectedService?.id);
  const routeTargets = (blueprint.services ?? []).filter((point) =>
    selectedService && point.id !== selectedService.id && point.levelId === selectedService.levelId &&
    (["water", "drain"].includes(point.kind) ? "plumbing" : "electrical") === selectedServiceGroup &&
    !connectedRoutes.some((route) => route.fromId === point.id || route.toId === point.id));
  const selectedElement = selectedRoom ?? selectedWall ?? selectedOpening ?? selectedColumn ?? selectedStair ?? selectedRoof ?? selectedService;
  const selectedSourceSheet = selectedElement && sourceSheetForElement(blueprint, selectedElement);
  const setRoomName = (name: string) => {
    if (!selectedRoom) return;
    persist({
      ...blueprint,
      rooms: blueprint.rooms.map((room) =>
        room.id === selectedRoom.id ? { ...room, name } : room,
      ),
    });
  };
  const selectedMetrics: Array<{
    key:
      | "width"
      | "height"
      | "length"
      | "thickness"
      | "size"
      | "diameter"
      | "wallHeight"
      | "openingHeight"
      | "sillHeight"
      | "rotation"
      | "roofDepth"
      | "roofThickness"
      | "roofElevation";
    label: string;
    value: number;
    min?: number;
    step?: number;
  }> = selectedRoof
    ? [
        { key: "width", label: "Ancho de cubierta (px)", value: Math.round(selectedRoof.width), min: 40 },
        { key: "roofDepth", label: "Fondo de cubierta (px)", value: Math.round(selectedRoof.depth), min: 40 },
        { key: "roofThickness", label: "Espesor (m)", value: selectedRoof.thickness, min: 0.05, step: 0.01 },
        { key: "roofElevation", label: "Altura sobre el nivel (m)", value: selectedRoof.elevation, min: 0.1, step: 0.05 },
      ]
    : selectedRoom
    ? [
        {
          key: "width",
          label: t("editor.width", "Ancho"),
          value: Math.round(selectedRoom.width),
          min: 60,
        },
        {
          key: "height",
          label: t("editor.height", "Alto"),
          value: Math.round(selectedRoom.height),
          min: 60,
        },
      ]
    : selectedWall
      ? [
          {
            key: "wallHeight",
            label: t("import.heightM"),
            value: selectedWall.height,
            min: 0.1,
            step: 0.05,
          },
          {
            key: "length",
            label: t("editor.length", "Longitud"),
            value: Math.round(
              Math.hypot(
                selectedWall.end[0] - selectedWall.start[0],
                selectedWall.end[1] - selectedWall.start[1],
              ),
            ),
            min: 24,
          },
          {
            key: "thickness",
            label: t("editor.thickness", "Espesor"),
            value: selectedWall.thickness,
            min: 4,
          },
          {
            key: "rotation",
            label: t("editor.rotation", "Rotación °"),
            value: Math.round(
              (Math.atan2(
                selectedWall.end[1] - selectedWall.start[1],
                selectedWall.end[0] - selectedWall.start[0],
              ) *
                180) /
                Math.PI,
            ),
            step: 1,
          },
        ]
      : selectedOpening
        ? [
            {
              key: "openingHeight",
              label: t("import.heightM"),
              value:
                selectedOpening.height ??
                (blueprint.windows.some((item) => item.id === selectedId)
                  ? 1.05
                  : 2.12),
              min: 0.1,
              step: 0.05,
            },
            {
              key: "sillHeight",
              label: t("import.sillM"),
              value:
                selectedOpening.sillHeight ??
                (blueprint.windows.some((item) => item.id === selectedId)
                  ? 0.9
                  : 0),
              min: 0,
              step: 0.05,
            },
            {
              key: "width",
              label: t("editor.width", "Ancho"),
              value: Math.round(selectedOpening.width),
              min: 24,
            },
            {
              key: "rotation",
              label: t("editor.rotation", "Rotación °"),
              value: Math.round(selectedOpening.rotation),
              step: 1,
            },
          ]
        : selectedColumn
          ? [
              {
                key: "size",
                label: t("editor.size", "Tamaño"),
                value: Math.round(selectedColumn.size),
                min: 12,
              },
            ]
          : selectedStair
            ? selectedStair.type === "straight" ? [
                { key: "diameter", label: t("editor.stairWidth", "Ancho"), value: Math.round(selectedStair.radius * 2), min: 40 },
                { key: "length", label: t("editor.length", "Longitud"), value: Math.round(selectedStair.length ?? selectedStair.radius * 4), min: 60 },
                { key: "rotation", label: t("editor.rotation", "Rotación"), value: Math.round(selectedStair.rotation ?? 0), min: -360 },
              ] : [
                {
                  key: "diameter",
                  label: t("editor.diameter", "Diámetro"),
                  value: Math.round(selectedStair.radius * 2),
                  min: 40,
                },
              ]
            : [];
  const setElementMetric = (
    key: (typeof selectedMetrics)[number]["key"],
    value: number,
  ) => {
    if (!selectedId || !Number.isFinite(value)) return;
    remember();
    const resizeSegment = <
      T extends { start: [number, number]; end: [number, number] },
    >(
      item: T,
    ) => {
      const center = [
        (item.start[0] + item.end[0]) / 2,
        (item.start[1] + item.end[1]) / 2,
      ] as const;
      const currentLength = Math.hypot(
        item.end[0] - item.start[0],
        item.end[1] - item.start[1],
      );
      const angle =
        key === "rotation"
          ? (value * Math.PI) / 180
          : Math.atan2(
              item.end[1] - item.start[1],
              item.end[0] - item.start[0],
            );
      const length = key === "length" ? Math.max(24, value) : currentLength;
      const dx = (Math.cos(angle) * length) / 2;
      const dy = (Math.sin(angle) * length) / 2;
      return {
        ...item,
        start: [center[0] - dx, center[1] - dy] as [number, number],
        end: [center[0] + dx, center[1] + dy] as [number, number],
      };
    };
    persist({
      ...blueprint,
      rooms: blueprint.rooms.map((item) =>
        item.id === selectedId
          ? {
              ...item,
              ...(key === "width" ? { width: Math.max(60, value) } : {}),
              ...(key === "height" ? { height: Math.max(60, value) } : {}),
            }
          : item,
      ),
      walls: blueprint.walls.map((item) =>
        item.id === selectedId
          ? key === "wallHeight"
            ? { ...item, height: Math.max(0.1, Math.min(20, value)) }
            : key === "thickness"
              ? { ...item, thickness: Math.max(4, value) }
              : resizeSegment(item)
          : item,
      ),
      doors: blueprint.doors.map((item) =>
        item.id === selectedId
          ? {
              ...item,
              ...(key === "openingHeight"
                ? { height: Math.max(0.1, Math.min(20, value)) }
                : {}),
              ...(key === "sillHeight"
                ? { sillHeight: Math.max(0, Math.min(20, value)) }
                : {}),
              ...(key === "width" ? { width: Math.max(24, value) } : {}),
              ...(key === "rotation" ? { rotation: value } : {}),
            }
          : item,
      ),
      windows: blueprint.windows.map((item) =>
        item.id === selectedId
          ? {
              ...item,
              ...(key === "openingHeight"
                ? { height: Math.max(0.1, Math.min(20, value)) }
                : {}),
              ...(key === "sillHeight"
                ? { sillHeight: Math.max(0, Math.min(20, value)) }
                : {}),
              ...(key === "width" ? { width: Math.max(24, value) } : {}),
              ...(key === "rotation" ? { rotation: value } : {}),
            }
          : item,
      ),
      columns: blueprint.columns.map((item) =>
        item.id === selectedId && key === "size"
          ? { ...item, size: Math.max(12, value) }
          : item,
      ),
      stairs: blueprint.stairs?.map((item) =>
        item.id === selectedId ? {
          ...item,
          ...(key === "diameter" ? { radius: Math.max(40, value) / 2 } : {}),
          ...(item.type === "straight" && key === "length" ? { length: Math.max(60, value) } : {}),
          ...(item.type === "straight" && key === "rotation" ? { rotation: value } : {}),
        } : item,
      ),
      roofs: blueprint.roofs?.map((item) =>
        item.id === selectedId ? {
          ...item,
          ...(key === "width" ? { width: Math.max(40, value) } : {}),
          ...(key === "roofDepth" ? { depth: Math.max(40, value) } : {}),
          ...(key === "roofThickness" ? { thickness: Math.max(0.05, Math.min(2, value)) } : {}),
          ...(key === "roofElevation" ? { elevation: Math.max(0.1, Math.min(100, value)) } : {}),
        } : item,
      ),
    });
  };

  const downloadDraft = () => {
    const draft = save.latestDraft.current ?? editedBlueprintRef.current ?? blueprint;
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ark-plano-${projectId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const confirmDiscard = () =>
    save.status === "saved" || window.confirm(t("editor.save.leaveWarning"));

  return (
    <div className="workspace-focus-surface editor-focus-shell">
      {importOpen && (
        <PlanImportDialog
          blueprint={blueprint}
          initialLevelId={levelId}
          documents={managementData?.documents ?? []}
          onClose={() => setImportOpen(false)}
          onSave={async (next) => {
            await save.commit(next);
            remember();
            editedBlueprintRef.current = next;
            setEditedBlueprint(next);
            setSelectedId(null);
            setActiveLevelId(next.sheets?.at(-1)?.levelId ?? levelId);
            setActiveSheetId(next.sheets?.at(-1)?.id ?? "");
            setOverlayOpacity(35);
          }}
        />
      )}
      <PageHeader
        className="editor-focus-header"
        eyebrow={`Proyecto · ${data.project.name}`}
        title={t("editor.title", "Editor semántico 2D")}
        description={t(
          "editor.description",
          "Corrige elementos detectados sobre el plano original y conserva la trazabilidad entre fuente, geometría y modelo.",
        )}
        actions={
          <>
            <div
              className="editor-save-feedback"
              data-state={save.status}
              role={save.status === "error" || save.status === "conflict" ? "alert" : "status"}
              title={save.error ?? undefined}
            >
              <span className="editor-save-dot" aria-hidden="true" />
              <span>{t("editor.save." + save.status)}</span>
              {save.status === "error" && (
                <button onClick={() => void save.retry().catch(() => undefined)}>
                  {t("editor.save.retry")}
                </button>
              )}
              {(save.status === "error" || save.status === "conflict") && (
                <button onClick={downloadDraft}>{t("editor.save.download")}</button>
              )}
              {save.status === "conflict" && (
                <button onClick={() => { if (confirmDiscard()) window.location.reload(); }}>
                  {t("editor.save.reload")}
                </button>
              )}
            </div>
            <button className="pm-button" disabled={save.status !== "saved"} onClick={() => setImportOpen(true)}>
              <ImageIcon size={15} />
              {t("import.title")}
            </button>
            <Link
              href={`/projects/${projectId}/editor`}
              onClick={(event) => { if (!confirmDiscard()) event.preventDefault(); }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9ddd4] bg-[#fbfbf7] px-3.5 text-xs font-semibold"
            >
              {t("editor.exitEditor", "Salir del editor")}
            </Link>
            <button
              onClick={undo}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9ddd4] bg-[#fbfbf7] px-3.5 text-xs font-semibold"
            >
              <Undo2 size={14} /> {t("editor.undo", "Deshacer")}
            </button>
            <Link
              href={`/projects/${projectId}/model`}
              aria-disabled={save.status !== "saved"}
              onClick={(event) => { if (save.status !== "saved") event.preventDefault(); }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff6a2b] px-4 text-xs font-semibold text-white"
            >
              <Box size={15} /> {t("editor.generate3d", "Generar modelo 3D")}
            </Link>
          </>
        }
      />

      <div className="px-3 pt-3">
      <Panel className="flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-40 flex-1 text-[10px] font-semibold text-[#58665e]">
          {t("import.level")}
          <select className="mt-1 w-full rounded-lg border border-[#d9ddd4] bg-white px-3 py-2 text-xs" value={levelId}
            onChange={(event) => { setActiveLevelId(event.target.value); setActiveSheetId(""); setSelectedId(null); }}>
            {blueprint.levels.map((level) => <option key={level.id} value={level.id}>{level.name} · {level.elevation} m</option>)}
          </select>
        </label>
        <label className="min-w-48 flex-[2] text-[10px] font-semibold text-[#58665e]">
          {t("editor.sourceSheet")}
          <select className="mt-1 w-full rounded-lg border border-[#d9ddd4] bg-white px-3 py-2 text-xs" value={currentSheet?.id ?? ""}
            onChange={(event) => setActiveSheetId(event.target.value)}>
            {!currentSheet && <option value="">Sin hoja</option>}
            {blueprint.sheets?.filter((sheet) => sheet.levelId === levelId).map((sheet) => (
              <option key={sheet.id} value={sheet.id}>{sheet.name} · {t(`import.discipline.${sheet.discipline}`, sheet.discipline)}</option>
            ))}
          </select>
        </label>
        <button className="pm-button" type="button" onClick={() => addLevel(false)}>{t("editor.addFloor")}</button>
        <button className="pm-button" type="button" onClick={() => addLevel(true)}>{t("editor.addBasement")}</button>
        <span className="text-[10px] text-[#66746b]">{visibleBlueprint.rooms.length} ambientes · {visibleBlueprint.walls.length} muros · {visibleBlueprint.roofs?.length ?? 0} cubiertas</span>
      </Panel>
      {tool === "service" && (
        <Panel className="mt-2 flex flex-wrap items-center gap-3 p-3">
          <label className="text-[10px] font-semibold">{t("editor.serviceKind")}
            <select value={serviceKind} onChange={(event) => setServiceKind(event.target.value as ServiceKind)}
              className="ml-2 rounded-lg border border-[#d9ddd4] bg-white px-3 py-2 text-xs">
              <option value="outlet">Tomacorriente</option><option value="switch">Interruptor</option>
              <option value="light">Luminaria</option><option value="panel">Tablero eléctrico</option>
              <option value="water">Punto de agua</option><option value="drain">Desagüe</option>
            </select>
          </label>
          <span className="text-xs text-[#66746b]">Haz clic en la hoja para ubicar el elemento; confirma su posición con el plano original.</span>
        </Panel>
      )}
      </div>
      <div className="editor-workbench">
        <Panel className="editor-toolrail flex gap-2 overflow-x-auto p-2 xl:flex-col xl:overflow-y-auto">
          {tools.map(({ id, key, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTool(id);
                setPendingDeleteId(null);
              }}
              title={t(key, label)}
              aria-label={t(key, label)}
              aria-pressed={tool === id}
              className={`group flex min-w-14 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 transition xl:w-full ${tool === id ? (id === "delete" ? "bg-[#b84438] text-white shadow-sm" : "bg-[#30382f] text-white shadow-sm") : id === "delete" ? "text-[#b84438] hover:bg-[#fff0ed]" : "text-[#647069] hover:bg-[#eef0e9]"}`}
            >
              <Icon size={17} />
              <span className="text-[8px] font-semibold">{t(key, label)}</span>
            </button>
          ))}
        </Panel>

        <Panel className="editor-canvas-panel overflow-hidden">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#dfe2d9] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#5e8f6f]" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.14em]">
                {t("editor.canvasTitle", "Planta baja · Plano interactivo")}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[10px] text-[#758079]">
                <ImageIcon size={13} /> {t("editor.source", "Fuente")}{" "}
                <input
                  aria-label={t(
                    "editor.opacity",
                    "Opacidad del plano original",
                  )}
                  type="range"
                  min="0"
                  max="65"
                  value={overlayOpacity}
                  onChange={(event) =>
                    setOverlayOpacity(Number(event.target.value))
                  }
                  className="w-20 accent-[#596151]"
                />
              </label>
              <span className="rounded-lg bg-[#eceee8] px-2 py-1 font-mono text-[9px]">
                {blueprint.scale}
              </span>
            </div>
          </div>
          <div className="editor-canvas-stage relative overflow-hidden bg-[#e9ece7]">
            {members.length > 0 && (
              <div
                className="editor-collaborators"
                aria-label={t(
                  "editor.activeParticipants",
                  "Participantes del proyecto",
                )}
              >
                {members.slice(0, 5).map((member, index) => (
                  <span
                    key={member.id}
                    className="editor-member-avatar"
                    data-tone={index % 4}
                    title={`${member.name} · ${member.email}`}
                  >
                    {memberInitials(member.name)}
                  </span>
                ))}
                {members.length > 5 && (
                  <span className="editor-member-more">
                    +{members.length - 5}
                  </span>
                )}
              </div>
            )}
            <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-xl border border-[#d6dbd3] bg-white/95 p-1 shadow-lg backdrop-blur">
              <button
                aria-label={t("editor.zoomOut", "Alejar plano")}
                onClick={() => setZoom((current) => Math.max(50, current - 10))}
                className="grid size-8 place-items-center rounded-lg text-[#65716b] hover:bg-[#eef0e9]"
              >
                <ZoomOut size={15} />
              </button>
              <button
                aria-label={t("editor.resetZoom", "Restablecer zoom")}
                onClick={() => setZoom(100)}
                className="min-w-12 rounded-lg px-2 py-2 font-mono text-[9px] font-semibold text-[#46534d] hover:bg-[#eef0e9]"
              >
                {zoom}%
              </button>
              <button
                aria-label={t("editor.zoomIn", "Acercar plano")}
                onClick={() =>
                  setZoom((current) => Math.min(220, current + 10))
                }
                className="grid size-8 place-items-center rounded-lg text-[#65716b] hover:bg-[#eef0e9]"
              >
                <ZoomIn size={15} />
              </button>
            </div>
            <div
              ref={viewportRef}
              onWheel={handleWheelZoom}
              onPointerDown={startCanvasPan}
              onPointerMove={moveCanvasPan}
              onPointerUp={stopCanvasPan}
              onPointerCancel={stopCanvasPan}
              className={`absolute inset-0 overflow-auto overscroll-contain scrollbar-thin ${tool === "pan" ? "cursor-grab active:cursor-grabbing" : ""}`}
              role="region"
              aria-label={t(
                "editor.scrollableCanvas",
                "Lienzo desplazable del plano",
              )}
            >
              <div
                className="relative m-6 origin-top-left bg-[#f8f8f4] shadow-[0_8px_32px_rgba(17,24,21,.12)]"
                style={{
                  width: `${(blueprint.width * zoom) / 100}px`,
                  height: `${(blueprint.height * zoom) / 100}px`,
                }}
              >
                <BlueprintCanvas
                  blueprint={visibleBlueprint}
                  tool={tool}
                  selectedId={selectedId}
                  overlayOpacity={overlayOpacity / 100}
                  onSelect={selectElement}
                  onCanvasClick={addAt}
                  onMove={(id, deltaX, deltaY) => moveElement(id, deltaX, deltaY, true)}
                  onMoveStart={startDragEdit}
                  onResize={(id, handle, deltaX, deltaY) => resizeElement(id, handle, deltaX, deltaY, true)}
                  onResizeStart={startDragEdit}
                  onInteractionEnd={finishDragEdit}
                />
                <button
                  aria-label={t(
                    "editor.expandWidth",
                    "Arrastra para ampliar el lienzo hacia la derecha",
                  )}
                  onPointerDown={(event) => startCanvasResize(event, "e")}
                  onPointerMove={moveCanvasResize}
                  onPointerUp={stopCanvasResize}
                  onPointerCancel={stopCanvasResize}
                  className="group absolute -right-5 -top-5 z-20 grid size-12 cursor-ew-resize place-items-center"
                >
                  <span className="grid size-7 place-items-center rounded-lg border-2 border-white bg-[#2563eb] text-white opacity-0 shadow-lg transition group-hover:scale-105 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Expand size={13} />
                  </span>
                </button>
                <button
                  aria-label={t(
                    "editor.expandHeight",
                    "Arrastra para ampliar el lienzo hacia abajo",
                  )}
                  onPointerDown={(event) => startCanvasResize(event, "s")}
                  onPointerMove={moveCanvasResize}
                  onPointerUp={stopCanvasResize}
                  onPointerCancel={stopCanvasResize}
                  className="group absolute -bottom-5 -left-5 z-20 grid size-12 cursor-ns-resize place-items-center"
                >
                  <span className="grid size-7 place-items-center rounded-lg border-2 border-white bg-[#2563eb] text-white opacity-0 shadow-lg transition group-hover:scale-105 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Expand size={13} className="rotate-90" />
                  </span>
                </button>
                <button
                  aria-label={t(
                    "editor.expandBoth",
                    "Arrastra para ampliar el lienzo en ambas direcciones",
                  )}
                  onPointerDown={(event) => startCanvasResize(event, "se")}
                  onPointerMove={moveCanvasResize}
                  onPointerUp={stopCanvasResize}
                  onPointerCancel={stopCanvasResize}
                  className="group absolute -bottom-5 -right-5 z-20 grid size-12 cursor-nwse-resize place-items-center"
                >
                  <span className="grid size-8 place-items-center rounded-xl border-2 border-white bg-[#ff6a2b] text-white opacity-0 shadow-lg transition group-hover:scale-110 group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Expand size={14} />
                  </span>
                </button>
              </div>
            </div>
            {tool !== "select" && !pendingDeleteId && (
              <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-[#111815]/92 px-4 py-2 text-[10px] font-semibold text-white shadow-lg">
                {tool === "delete"
                  ? t(
                      "editor.selectToDelete",
                      "Selecciona el elemento que deseas eliminar",
                    )
                  : t(
                      "editor.clickToAdd",
                      "Haz clic en el plano para agregar: {element}",
                    ).replace(
                      "{element}",
                      (() => {
                        const item = tools.find(
                          (candidate) => candidate.id === tool,
                        );
                        return item ? t(item.key, item.label) : "";
                      })(),
                    )}
              </div>
            )}
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#111815]/80 px-3 py-2 text-[9px] text-white backdrop-blur">
              <Move size={12} />{" "}
              {t(
                "editor.wheelHelp",
                "Rueda: zoom · Shift + rueda: desplazar · tiradores: redimensionar",
              )}
            </div>
            {pendingDeleteId && (
              <div className="absolute inset-x-4 bottom-4 z-30 mx-auto flex max-w-lg flex-col gap-3 rounded-2xl border border-[#edc2bc] bg-white p-4 shadow-2xl sm:flex-row sm:items-center">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff0ed] text-[#b84438]">
                  <Trash2 size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">
                    {t("editor.deleteQuestion", "¿Eliminar este elemento?")}
                  </p>
                  <p className="mt-1 truncate font-mono text-[9px] text-[#7d8882]">
                    {pendingDeleteId}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={cancelDelete}
                    className="h-9 rounded-xl border border-[#dce0d8] px-3 text-[10px] font-semibold"
                  >
                    {t("common.cancel", "Cancelar")}
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#b84438] px-3 text-[10px] font-semibold text-white"
                  >
                    <Trash2 size={13} /> {t("editor.delete", "Eliminar")}
                  </button>
                </div>
              </div>
            )}
            {actionMessage && !pendingDeleteId && (
              <div className="absolute bottom-4 left-4 z-30 flex max-w-sm items-center gap-3 rounded-xl border border-[#cbd9cf] bg-white p-3 shadow-xl">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eef0e9] text-[#59665f]">
                  <CircleAlert size={14} />
                </span>
                <p className="text-[10px] leading-4 text-[#53615a]">
                  {actionMessage}
                </p>
                <button
                  aria-label={t("common.close", "Cerrar mensaje")}
                  onClick={() => setActionMessage(null)}
                  className="ml-auto grid size-7 shrink-0 place-items-center rounded-lg text-[#87918c] hover:bg-[#eef0e9]"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe2d9] px-4 py-3">
            <p className="flex items-center gap-2 text-[10px] text-[#78837d]">
              <Ruler size={13} /> {t("editor.modeledArea", "Área modelada")}:{" "}
              {blueprint.rooms
                .reduce((sum, room) => sum + room.area, 0)
                .toFixed(1)}{" "}
              m²
            </p>
            <p className="font-mono text-[9px] text-[#87918c]">
              {blueprint.width} × {blueprint.height} px
            </p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#87918c]">
              {t("editor.gridSnap", "Grid 20 cm · Snap activo")}
            </p>
          </div>
        </Panel>

        <aside className="editor-inspector-column space-y-5">
          <PlanSourceReviewPanel
            blueprint={blueprint}
            activeLevelId={levelId}
            activeSheetId={currentSheet?.id}
            canImport={save.status === "saved"}
            onImport={() => setImportOpen(true)}
            onOpenSheet={(nextLevelId, sheetId) => {
              setActiveLevelId(nextLevelId);
              setActiveSheetId(sheetId);
              setSelectedId(null);
            }}
            onSelectElement={(nextLevelId, sheetId, elementId) => {
              setActiveLevelId(nextLevelId);
              if (sheetId) setActiveSheetId(sheetId);
              setTool("select");
              setSelectedId(elementId);
            }}
          />
          {selectedId && (
            <>
              <Link
                href={`/projects/${projectId}/issues?element_id=${encodeURIComponent(selectedId)}`}
                className="pm-button w-full"
              >
                {t("pm.newIssue")} · {selectedId}
              </Link>
              <Link
                href={`/projects/${projectId}/comments?element_id=${encodeURIComponent(selectedId)}`}
                className="pm-button w-full"
              >
                {t("c.newComment")}
              </Link>
            </>
          )}
          <Panel className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#8a948e]">
                  {t("editor.inspector", "Inspector")}
                </p>
                <h2 className="mt-1 font-semibold">
                  {t("editor.selectedElement", "Elemento seleccionado")}
                </h2>
              </div>
              <Layers size={17} className="text-[#7c8781]" />
            </div>
            {selectedId ? (
              <div className="mt-5">
                <div className="flex items-center justify-between rounded-xl border border-[#dedfd8] bg-white p-3">
                  <div>
                    <span className="rounded-md bg-[#eceee8] px-2 py-1 font-mono text-[8px] font-semibold uppercase">
                      {selectedType}
                    </span>
                    <p className="mt-2 font-mono text-[11px] font-semibold text-[#3f4a44]">
                      {selectedId}
                    </p>
                  </div>
                  <button
                    aria-label={t("editor.clearSelection", "Limpiar selección")}
                    onClick={() => setSelectedId(null)}
                    className="grid size-8 place-items-center rounded-lg text-[#89938e] hover:bg-[#f1f2ed]"
                  >
                    <X size={15} />
                  </button>
                </div>
                {(selectedRoom || selectedRoof || selectedService) && (
                  <label className="mt-4 block text-[9px] font-semibold text-[#68746e]">
                    Nombre del elemento
                    <input
                      aria-label="Nombre del elemento"
                      value={selectedRoom?.name ?? selectedRoof?.name ?? selectedService?.name ?? ""}
                      onChange={(event) => {
                        const name = event.target.value;
                        if (selectedRoom) setRoomName(name);
                        else if (selectedRoof) persist({ ...blueprint, roofs: blueprint.roofs?.map((item) => item.id === selectedRoof.id ? { ...item, name: name || "Cubierta" } : item) });
                        else if (selectedService) persist({ ...blueprint, services: blueprint.services?.map((item) => item.id === selectedService.id ? { ...item, name: name || "Instalación" } : item) });
                      }}
                      className="mt-1 h-10 w-full rounded-lg border border-[#d9ddd4] bg-white px-3 text-xs outline-none focus:border-[#2563eb]"
                    />
                  </label>
                )}
                {selectedService && (
                  <label className="mt-3 block text-[9px] font-semibold text-[#68746e]">
                    {t("editor.serviceKind")}
                    <select
                      aria-label="Tipo de instalación seleccionado"
                      value={selectedService.kind}
                      onChange={(event) => {
                        const kind = event.target.value as ServiceKind;
                        const sheet = blueprint.sheets?.find((item) => item.id === selectedService.sheetId);
                        const matchingDiscipline = ["water", "drain"].includes(kind) ? "plumbing" : "electrical";
                        const previousDiscipline = ["water", "drain"].includes(selectedService.kind) ? "plumbing" : "electrical";
                        persist({ ...blueprint, services: blueprint.services?.map((item) =>
                          item.id === selectedService.id
                            ? { ...item, kind, sheetId: sheet?.discipline === matchingDiscipline ? item.sheetId : undefined }
                            : item,
                        ), routes: previousDiscipline === matchingDiscipline ? blueprint.routes :
                          blueprint.routes?.filter((route) => route.fromId !== selectedService.id && route.toId !== selectedService.id) });
                      }}
                      className="mt-1 h-10 w-full rounded-lg border border-[#d9ddd4] bg-white px-3 text-xs"
                    >
                      <option value="outlet">Tomacorriente</option>
                      <option value="switch">Interruptor</option>
                      <option value="light">Luminaria</option>
                      <option value="panel">Tablero eléctrico</option>
                      <option value="water">Punto de agua</option>
                      <option value="drain">Desagüe</option>
                    </select>
                  </label>
                )}
                {selectedService && (
                  <div className="mt-4 rounded-xl border border-[#d9ddd4] p-3">
                    <strong className="text-xs">{t("editor.serviceRoutes")}</strong>
                    <p className="mt-1 text-[10px] text-[#68746e]">{t("editor.routeDisclaimer")}</p>
                    <label className="mt-3 block text-[10px] font-semibold">
                      {t("editor.connectTo")}
                      <select value={routeTargets.some((point) => point.id === routeTargetId) ? routeTargetId : ""}
                        onChange={(event) => setRouteTargetId(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#d9ddd4] bg-white px-2 py-2 text-xs">
                        <option value="">{t("editor.chooseService")}</option>
                        {routeTargets.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}
                      </select>
                    </label>
                    <button type="button" className="pm-button mt-2 w-full" disabled={!routeTargets.some((point) => point.id === routeTargetId)}
                      onClick={() => {
                        const target = routeTargets.find((point) => point.id === routeTargetId);
                        if (!target) return;
                        remember();
                        persist({ ...blueprint, routes: [...(blueprint.routes ?? []), {
                          id: `route-${crypto.randomUUID()}`, levelId: selectedService.levelId,
                          kind: selectedServiceGroup,
                          fromId: selectedService.id, toId: target.id,
                          sheetId: selectedService.sheetId === target.sheetId ? selectedService.sheetId : undefined,
                        }] });
                        setRouteTargetId("");
                      }}>{t("editor.addRoute")}</button>
                    {connectedRoutes.map((route) => {
                      const other = blueprint.services?.find((point) => point.id === (route.fromId === selectedService.id ? route.toId : route.fromId));
                      return <div key={route.id} className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                        <span className="min-w-0 truncate">{other?.name ?? route.id}</span>
                        <button type="button" className="text-[#b84438]" onClick={() => {
                          remember();
                          persist({ ...blueprint, routes: blueprint.routes?.filter((item) => item.id !== route.id) });
                        }}>{t("editor.removeRoute")}</button>
                      </div>;
                    })}
                  </div>
                )}
                {selectedPosition && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <label className="text-[9px] font-semibold text-[#68746e]">
                      {t("editor.positionX", "Posición X")}
                      <input
                        type="number"
                        value={Math.round(selectedPosition.x)}
                        onChange={(event) =>
                          setElementCoordinate("x", Number(event.target.value))
                        }
                        className="mt-1 h-9 w-full rounded-lg border border-[#d9ddd4] bg-white px-2 text-xs outline-none focus:border-[#596151]"
                      />
                    </label>
                    <label className="text-[9px] font-semibold text-[#68746e]">
                      {t("editor.positionY", "Posición Y")}
                      <input
                        type="number"
                        value={Math.round(selectedPosition.y)}
                        onChange={(event) =>
                          setElementCoordinate("y", Number(event.target.value))
                        }
                        className="mt-1 h-9 w-full rounded-lg border border-[#d9ddd4] bg-white px-2 text-xs outline-none focus:border-[#596151]"
                      />
                    </label>
                    <p className="col-span-2 flex items-center gap-2 rounded-lg bg-[#eef3ed] px-3 py-2 text-[9px] text-[#627068]">
                      <Move size={12} />{" "}
                      {t(
                        "editor.dragHint",
                        "También puedes arrastrar el elemento directamente sobre el plano.",
                      )}
                    </p>
                  </div>
                )}
                {selectedMetrics.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {selectedMetrics.map((metric) => (
                      <label
                        key={metric.key}
                        className="text-[9px] font-semibold text-[#68746e]"
                      >
                        {metric.label}
                        <input
                          type="number"
                          min={metric.min}
                          step={metric.step ?? 1}
                          value={metric.value}
                          onChange={(event) =>
                            setElementMetric(
                              metric.key,
                              Number(event.target.value),
                            )
                          }
                          className="mt-1 h-9 w-full rounded-lg border border-[#d9ddd4] bg-white px-2 text-xs outline-none focus:border-[#596151]"
                        />
                      </label>
                    ))}
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    {
                      label: t("import.review"),
                      value: blueprint.review?.reviewedIds.includes(selectedId)
                        ? t("import.accepted")
                        : t("import.pending"),
                    },
                    {
                      label: t("editor.level", "Nivel"),
                      value: blueprint.levels.find((item) => item.id === (
                        selectedRoof?.levelId ?? selectedService?.levelId ??
                        selectedRoom?.levelId ?? selectedWall?.levelId ??
                        selectedOpening?.levelId ?? selectedColumn?.levelId ??
                        selectedStair?.levelId ?? (blueprint.levels.find((item) => item.elevation === 0)?.id ?? blueprint.levels[0].id)
                      ))?.name ?? "—",
                    },
                    {
                      label: t("editor.height", "Altura"),
                      value: blueprint.walls.find(
                        (wall) => wall.id === selectedId,
                      )?.height
                        ? `${blueprint.walls.find((wall) => wall.id === selectedId)!.height.toFixed(2)} m`
                        : "—",
                    },
                    {
                      label: t("editor.source", "Fuente"),
                      value: selectedSourceSheet
                        ? `${selectedSourceSheet.sourceName} · ${t("import.page")} ${selectedSourceSheet.page}`
                        : t("import.manualSource"),
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl bg-[#f0f1ec] p-3"
                    >
                      <p className="text-[9px] text-[#87918c]">{item.label}</p>
                      <p className="mt-1 text-xs font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>
                {blueprint.review && (
                  <button
                    className="pm-button mt-3 w-full"
                    disabled={blueprint.review.reviewedIds.includes(selectedId)}
                    onClick={() =>
                      persist({
                        ...blueprint,
                        review: {
                          ...blueprint.review!,
                          reviewedIds: [
                            ...blueprint.review!.reviewedIds,
                            selectedId,
                          ],
                        },
                      })
                    }
                  >
                    {t("import.acceptElement")}
                  </button>
                )}
                <button
                  onClick={() => requestDelete(selectedId)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#efd0cb] bg-[#fff8f6] py-2.5 text-xs font-semibold text-[#b83c31] transition hover:bg-[#ffefec]"
                >
                  <Trash2 size={14} />{" "}
                  {t("editor.deleteElement", "Eliminar elemento")}
                </button>
              </div>
            ) : (
              <div className="grid min-h-44 place-items-center text-center">
                <div>
                  <MousePointer2 className="mx-auto text-[#a0a8a3]" />
                  <p className="mt-3 text-xs text-[#7d8882]">
                    {t(
                      "editor.selectGeometry",
                      "Selecciona una geometría para ver sus propiedades.",
                    )}
                  </p>
                </div>
              </div>
            )}
          </Panel>
          <Panel className="p-5">
            <div className="flex items-center gap-2">
              <WandSparkles size={16} className="text-[#ff6a2b]" />
              <h2 className="text-sm font-semibold">
                {t("editor.semanticReading", "Lectura semántica")}
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {[
                {
                  label: t("editor.walls", "Muros"),
                  value: blueprint.walls.length,
                  color: "bg-[#596151]",
                },
                {
                  label: t("editor.openings", "Aberturas"),
                  value: blueprint.doors.length + blueprint.windows.length,
                  color: "bg-[#578998]",
                },
                {
                  label: t("editor.rooms", "Ambientes"),
                  value: blueprint.rooms.length,
                  color: "bg-[#d18c48]",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-2 text-[#65716b]">
                    <span className={`size-2 rounded-full ${item.color}`} />
                    {item.label}
                  </span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-[#e2e4de] pt-4">
              <div className="flex justify-between text-[10px]">
                <span>{t("import.reviewProgress")}</span>
                <strong>
                  {blueprint.review?.reviewedIds.length ?? 0} /{" "}
                  {planElements(blueprint).length}
                </strong>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[#e7e9e3]">
                <div
                  className="h-full rounded-full bg-[#596151]"
                  style={{
                    width: `${(100 * (blueprint.review?.reviewedIds.length ?? 0)) / Math.max(1, planElements(blueprint).length)}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-xs">
                {t(
                  blueprint.review?.status === "reviewed"
                    ? "import.accepted"
                    : "import.pending",
                )}
              </p>
              {planTopologyIssues(blueprint).length > 0 && (
                <details className="mt-3 text-xs">
                  <summary>
                    {t("import.topology")} ·{" "}
                    {planTopologyIssues(blueprint).length}
                  </summary>
                  <ul>
                    {planTopologyIssues(blueprint).map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </Panel>
          <div className="rounded-2xl border border-[#d6e2de] bg-[#eff7f4] p-4">
            <p className="flex items-start gap-2 text-[10px] leading-5 text-[#537067]">
              <ScanLine size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong>
                  {t("editor.traceabilityActive", "Trazabilidad activa.")}
                </strong>{" "}
                {t(
                  "editor.traceabilityDescription",
                  "La capa azul corresponde a la imagen fuente y permite validar cada corrección.",
                )}
              </span>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <Skeleton className="h-10 w-80" />
      <Skeleton className="mt-3 h-4 w-[38rem] max-w-full" />
      <div className="mt-8 grid gap-5 xl:grid-cols-[76px_1fr_310px]">
        <Skeleton className="h-[480px]" />
        <Skeleton className="h-[650px]" />
        <div className="space-y-5">
          <Skeleton className="h-80" />
          <Skeleton className="h-56" />
        </div>
      </div>
    </div>
  );
}
