"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Box,
  BrickWall,
  Check,
  Columns3,
  DoorOpen,
  Expand,
  Hand,
  Image as ImageIcon,
  Layers,
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
import type { Blueprint, Wall } from "@/bounded-contexts/plan-digitization";
import { planDigitization } from "@/bounded-contexts/plan-digitization/public";
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
  const { t } = useI18n();
  const { data, loading, error, reload } = useProjectWorkspace(projectId);
  const { data: managementData } = useWorkspace();
  const [tool, setTool] = useState<EditorTool>("select");
  const searchParams = useSearchParams();
  const editMode = searchParams.get("mode") === "edit";
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
  const viewportRef = useRef<HTMLDivElement>(null);
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

  const selectedType = useMemo(() => {
    if (!selectedId || !data) return t("editor.none", "Ninguno");
    if (selectedId.startsWith("wall")) return t("editor.wall", "Muro");
    if (selectedId.startsWith("door")) return t("editor.door", "Puerta");
    if (selectedId.startsWith("window")) return t("editor.window", "Ventana");
    if (selectedId.startsWith("column")) return t("editor.column", "Columna");
    if (selectedId.includes("stair")) return t("editor.stair", "Escalera");
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
                <BlueprintCanvas blueprint={blueprint} overlayOpacity={0.12} />
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

  const persist = (next: Blueprint) => {
    setEditedBlueprint(next);
    void planDigitization.saveBlueprint
      .execute(next)
      .catch((error) => setActionMessage((error as Error).message));
  };
  const remember = () =>
    setHistory((current) => [...current, blueprint].slice(-30));
  const addAt = (x: number, y: number) => {
    if (tool === "select" || tool === "pan" || tool === "delete") return;
    remember();
    const id = `${tool}-local-${Date.now()}`;
    let next = blueprint;
    if (tool === "room")
      next = {
        ...blueprint,
        rooms: [
          ...blueprint.rooms,
          {
            id,
            name: t("editor.newRoomName", "Nuevo ambiente"),
            x: Math.max(0, x - 110),
            y: Math.max(0, y - 80),
            width: 220,
            height: 160,
            area: 3.5,
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
            start: [x - 70, y],
            end: [x + 70, y],
            thickness: 14,
            height: 2.8,
          },
        ],
      };
    if (tool === "column")
      next = {
        ...blueprint,
        columns: [...blueprint.columns, { id, x, y, size: 28 }],
      };
    if (tool === "door" || tool === "window") {
      const closest = nearestWall(blueprint.walls, x, y);
      if (!closest.wall) return;
      const opening = {
        id,
        wallId: closest.wall.id,
        x: closest.point.x,
        y: closest.point.y,
        width: tool === "door" ? 76 : 105,
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
  const moveElement = (id: string, deltaX: number, deltaY: number) => {
    const movePoint = <T extends { id: string; x: number; y: number }>(
      item: T,
    ) =>
      item.id === id
        ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
        : item;
    persist({
      ...blueprint,
      rooms: blueprint.rooms.map((item) =>
        item.id === id
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
      walls: blueprint.walls.map((item) =>
        item.id === id
          ? {
              ...item,
              start: [item.start[0] + deltaX, item.start[1] + deltaY],
              end: [item.end[0] + deltaX, item.end[1] + deltaY],
            }
          : item,
      ),
      doors: blueprint.doors.map((item) =>
        item.id === id || item.wallId === id
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
      windows: blueprint.windows.map((item) =>
        item.id === id || item.wallId === id
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
      columns: blueprint.columns.map(movePoint),
      stairs: blueprint.stairs?.map(movePoint),
    });
  };
  const resizeElement = (
    id: string,
    handle: ResizeHandle,
    deltaX: number,
    deltaY: number,
  ) => {
    const rooms = blueprint.rooms.map((item) => {
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
    const walls = blueprint.walls.map((item) =>
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
    const columns = blueprint.columns.map((item) => {
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
    const stairs = blueprint.stairs?.map((item) => {
      if (item.id !== id) return item;
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
      ...blueprint,
      rooms,
      walls,
      doors: blueprint.doors.map(resizeOpening),
      windows: blueprint.windows.map(resizeOpening),
      columns,
      stairs,
    });
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
    remember();
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
    persist({ ...blueprint, width, height });
  };
  const stopCanvasResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (canvasResize.current?.pointerId === event.pointerId)
      canvasResize.current = null;
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
      | "rotation";
    label: string;
    value: number;
    min?: number;
    step?: number;
  }> = selectedRoom
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
            ? [
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
    if (!selectedId || Number.isNaN(value)) return;
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
          ? key === "thickness"
            ? { ...item, thickness: Math.max(4, value) }
            : resizeSegment(item)
          : item,
      ),
      doors: blueprint.doors.map((item) =>
        item.id === selectedId
          ? {
              ...item,
              ...(key === "width" ? { width: Math.max(24, value) } : {}),
              ...(key === "rotation" ? { rotation: value } : {}),
            }
          : item,
      ),
      windows: blueprint.windows.map((item) =>
        item.id === selectedId
          ? {
              ...item,
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
        item.id === selectedId && key === "diameter"
          ? { ...item, radius: Math.max(40, value) / 2 }
          : item,
      ),
    });
  };

  return (
    <div className="workspace-focus-surface editor-focus-shell">
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
            <Link
              href={`/projects/${projectId}/editor`}
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
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff6a2b] px-4 text-xs font-semibold text-white"
            >
              <Box size={15} /> {t("editor.generate3d", "Generar modelo 3D")}
            </Link>
          </>
        }
      />

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
                  blueprint={blueprint}
                  tool={tool}
                  selectedId={selectedId}
                  overlayOpacity={overlayOpacity / 100}
                  onSelect={selectElement}
                  onCanvasClick={addAt}
                  onMove={moveElement}
                  onMoveStart={remember}
                  onResize={resizeElement}
                  onResizeStart={remember}
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
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e6f3ea] text-[#2f8f62]">
                  <Check size={14} />
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
                {selectedRoom && (
                  <label className="mt-4 block text-[9px] font-semibold text-[#68746e]">
                    {t("editor.roomName", "Nombre del ambiente")}
                    <input
                      aria-label={t("editor.roomName", "Nombre del ambiente")}
                      value={selectedRoom.name}
                      onChange={(event) => setRoomName(event.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border border-[#d9ddd4] bg-white px-3 text-xs outline-none focus:border-[#2563eb]"
                    />
                  </label>
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
                      label: t("editor.confidence", "Confianza"),
                      value: "96%",
                    },
                    {
                      label: t("editor.level", "Nivel"),
                      value: t("editor.floorOne", "Piso 1"),
                    },
                    { label: t("editor.height", "Altura"), value: "2.80 m" },
                    {
                      label: t("editor.source", "Fuente"),
                      value: t("editor.detected", "Detectado"),
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
                <span>
                  {t("editor.interpretedModel", "Modelo interpretado")}
                </span>
                <strong>94%</strong>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[#e7e9e3]">
                <div className="h-full w-[94%] rounded-full bg-[#596151]" />
              </div>
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
