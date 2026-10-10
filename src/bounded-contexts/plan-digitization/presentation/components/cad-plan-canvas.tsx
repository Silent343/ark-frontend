"use client";
import { useEffect, useRef, useState } from "react";
import type { CadBounds, CadPlan } from "../../domain/entities/cad-plan";
import { cadEntityBounds } from "../../domain/cad-operations";
import { drawCad, fitCadView } from "../../infrastructure/cad-canvas-renderer";

interface Props {
  plan: CadPlan;
  selectedId?: string | null;
  editable?: boolean;
  pan?: boolean;
  regionMode?: boolean;
  onRegionSelected?: (bounds: CadBounds) => void;
  fitBounds?: CadBounds;
  fitKey?: number | string;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, dx: number, dy: number) => void;
  onMoveEnd?: () => void;
}
/** Canvas culls off-screen geometry; pointer capture keeps dragging reliable outside a small entity. */
export function CadPlanCanvas({
  plan,
  selectedId,
  editable,
  pan,
  regionMode,
  onRegionSelected,
  fitBounds,
  fitKey,
  onSelect,
  onMove,
  onMoveEnd,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState({
    x: 0,
    y: 0,
    scale: 1,
    width: 800,
    height: 600,
  });
  const drag = useRef<{
    id: string | null;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [selection, setSelection] = useState<{
    x: number;
    y: number;
    endX: number;
    endY: number;
  } | null>(null);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setView(fitCadView(fitBounds ?? plan.bounds, size.width, size.height)),
    );
    return () => cancelAnimationFrame(frame);
  }, [size, fitBounds, fitKey, plan.bounds]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    el.width = size.width * ratio;
    el.height = size.height * ratio;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    drawCad(ctx, plan, { ...view, ...size }, selectedId);
  }, [plan, view, size, selectedId]);
  // Native wheel listener must be non-passive to keep wheel zoom inside the editor.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect(),
        x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      setView((v) => {
        const scale = Math.max(
            0.05,
            Math.min(100000, v.scale * Math.exp(-event.deltaY * 0.0015)),
          ),
          r = scale / v.scale;
        return { ...v, scale, x: x - (x - v.x) * r, y: y - (y - v.y) * r };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  return (
    <div ref={container} className="cad-drawing-viewport">
      {selection && (
        <div
          className="cad-region-selection"
          style={{
            left: Math.min(selection.x, selection.endX),
            top: Math.min(selection.y, selection.endY),
            width: Math.abs(selection.endX - selection.x),
            height: Math.abs(selection.endY - selection.y),
          }}
        />
      )}
      <canvas
        ref={canvas}
        aria-label="Plano CAD editable"
        style={{ cursor: pan ? "grab" : editable ? "crosshair" : "grab" }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect(),
            sx = event.clientX - rect.left,
            sy = event.clientY - rect.top,
            x = (sx - view.x) / view.scale,
            y = (view.y - sy) / view.scale;
          if (regionMode) {
            setSelection({ x: sx, y: sy, endX: sx, endY: sy });
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }
          let id: string | null = null;
          if (editable && !pan && event.button === 0) {
            const visible = new Set(
              plan.layers.filter((l) => l.visible).map((l) => l.name),
            );
            const tol = 6 / view.scale;
            for (let i = plan.entities.length - 1; i >= 0; i--) {
              const e = plan.entities[i];
              if (!visible.has(e.layer)) continue;
              const b = cadEntityBounds(e);
              if (
                x < b.minX - tol ||
                x > b.maxX + tol ||
                y < b.minY - tol ||
                y > b.maxY + tol
              )
                continue;
              let hit = e.kind === "text";
              if (e.kind === "circle")
                hit = Math.abs(Math.hypot(x - e.x, y - e.y) - e.radius) < tol;
              if (e.kind === "path") {
                const p = e.closed
                  ? [...e.points, ...e.points.slice(0, 2)]
                  : e.points;
                for (let j = 0; j + 3 < p.length; j += 2) {
                  const dx = p[j + 2] - p[j],
                    dy = p[j + 3] - p[j + 1],
                    t = Math.max(
                      0,
                      Math.min(
                        1,
                        ((x - p[j]) * dx + (y - p[j + 1]) * dy) /
                          (dx * dx + dy * dy || 1),
                      ),
                    );
                  if (
                    Math.hypot(x - p[j] - t * dx, y - p[j + 1] - t * dy) < tol
                  ) {
                    hit = true;
                    break;
                  }
                }
              }
              if (hit) {
                id = e.id;
                break;
              }
            }
            onSelect?.(id);
          }
          drag.current = {
            id,
            x: event.clientX,
            y: event.clientY,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (selection) {
            const r = event.currentTarget.getBoundingClientRect();
            setSelection((s) =>
              s
                ? {
                    ...s,
                    endX: event.clientX - r.left,
                    endY: event.clientY - r.top,
                  }
                : null,
            );
            return;
          }
          const d = drag.current;
          if (!d) return;
          const dx = event.clientX - d.x,
            dy = event.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 0) d.moved = true;
          if (d.id) onMove?.(d.id, dx / view.scale, -dy / view.scale);
          else setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
          d.x = event.clientX;
          d.y = event.clientY;
        }}
        onPointerUp={() => {
          if (selection) {
            if (
              Math.abs(selection.x - selection.endX) > 15 &&
              Math.abs(selection.y - selection.endY) > 15
            )
              onRegionSelected?.({
                minX:
                  (Math.min(selection.x, selection.endX) - view.x) / view.scale,
                maxX:
                  (Math.max(selection.x, selection.endX) - view.x) / view.scale,
                minY:
                  (view.y - Math.max(selection.y, selection.endY)) / view.scale,
                maxY:
                  (view.y - Math.min(selection.y, selection.endY)) / view.scale,
              });
            setSelection(null);
          }
          if (drag.current?.id && drag.current.moved) onMoveEnd?.();
          drag.current = null;
        }}
        onPointerCancel={() => {
          setSelection(null);
          onMoveEnd?.();
          drag.current = null;
        }}
      />
    </div>
  );
}
