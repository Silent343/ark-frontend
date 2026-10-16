import type { Blueprint, Opening, Wall } from "@/bounded-contexts/plan-digitization";
import { metersPerUnit } from "@/bounded-contexts/plan-digitization/domain/plan-calibration";
import type {
  SceneModel,
  SceneOpening,
  SceneWallSegment,
} from "@/bounded-contexts/spatial-visualization/domain/value-objects/scene-preferences";

interface ProjectedOpening {
  opening: Opening;
  type: "door" | "window";
  center: number;
  start: number;
  end: number;
}

/** Calcula los ajustes longitudinales en los extremos de cada muro para sellar esquinas L y encuentros T sin solapamiento. */
function computeCornerExtensions(walls: Wall[]): Map<string, { startPad: number; endPad: number }> {
  const adjustments = new Map<string, { startPad: number; endPad: number }>();
  for (const w of walls) {
    adjustments.set(w.id, { startPad: 0, endPad: 0 });
  }

  for (let i = 0; i < walls.length; i++) {
    const a = walls[i];
    const adx = a.end[0] - a.start[0],
      ady = a.end[1] - a.start[1],
      alen = Math.hypot(adx, ady);
    if (alen < 1e-3) continue;
    const aux = adx / alen,
      auy = ady / alen;
    const adjA = adjustments.get(a.id)!;

    for (let j = 0; j < walls.length; j++) {
      if (i === j) continue;
      const b = walls[j];
      if ((a.levelId ?? "") !== (b.levelId ?? "")) continue;
      const bdx = b.end[0] - b.start[0],
        bdy = b.end[1] - b.start[1],
        blen = Math.hypot(bdx, bdy);
      if (blen < 1e-3) continue;
      const bux = bdx / blen,
        buy = bdy / blen;

      const cosAngle = Math.abs(aux * bux + auy * buy);
      const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle));
      if (sinAngle < 0.35) continue; // Solo uniones con ángulo significativo (> ~20°)

      const maxTol = Math.max(a.thickness, b.thickness) * 1.15;
      const halfB = (b.thickness / 2) * sinAngle;

      // Comprobamos extremo inicial (start) y final (end) del muro A contra el muro B
      for (const endKind of ["start", "end"] as const) {
        const pt = endKind === "start" ? a.start : a.end;
        const dStart = Math.hypot(pt[0] - b.start[0], pt[1] - b.start[1]);
        const dEnd = Math.hypot(pt[0] - b.end[0], pt[1] - b.end[1]);
        const isCorner = Math.min(dStart, dEnd) <= maxTol;

        if (isCorner) {
          // Esquina L: el muro de menor ID tapa la esquina (+halfB) y el otro hace tope limpio (-halfB)
          const pad = a.id < b.id ? halfB : -halfB;
          if (endKind === "start" && Math.abs(pad) > Math.abs(adjA.startPad)) {
            adjA.startPad = pad;
          } else if (endKind === "end" && Math.abs(pad) > Math.abs(adjA.endPad)) {
            adjA.endPad = pad;
          }
        } else {
          // Encuentro en T: el extremo de A toca el cuerpo intermedio de B
          const proj = (pt[0] - b.start[0]) * bux + (pt[1] - b.start[1]) * buy;
          const perp = Math.abs((pt[0] - b.start[0]) * buy - (pt[1] - b.start[1]) * bux);
          if (proj > maxTol * 0.5 && proj < blen - maxTol * 0.5 && perp <= maxTol) {
            // Retraemos el extremo de A para que apoye sobre la cara de B sin atravesarlo
            const pad = -halfB;
            if (endKind === "start" && adjA.startPad === 0) adjA.startPad = pad;
            if (endKind === "end" && adjA.endPad === 0) adjA.endPad = pad;
          }
        }
      }
    }
  }
  return adjustments;
}

/** Anti-corruption translator from semantic-plan coordinates to scene space. */
export class BuildSceneModel {
  execute(
    blueprint: Blueprint,
    alignment?: { centerX: number; centerY: number; scale: number },
  ): SceneModel {
    const coordinates = [
      ...blueprint.walls.flatMap((wall) => [wall.start, wall.end]),
      ...blueprint.rooms.flatMap((room) => [
        [room.x, room.y],
        [room.x + room.width, room.y + room.height],
      ]),
      ...(blueprint.slabs ?? []).flatMap((slab) => slab.polygon),
      ...blueprint.columns.flatMap((column) => [
        [column.x - column.size / 2, column.y - column.size / 2],
        [column.x + column.size / 2, column.y + column.size / 2],
      ]),
      ...(blueprint.roofs ?? []).flatMap((roof) => [
        [roof.x, roof.y],
        [roof.x + roof.width, roof.y + roof.depth],
      ]),
      ...(blueprint.services ?? []).map((point) => [point.x, point.y]),
      ...(blueprint.fixtures ?? []).flatMap((f) => {
        const angle = ((f.rotation ?? 0) * Math.PI) / 180;
        const dx =
          (Math.abs(Math.cos(angle)) * f.width +
            Math.abs(Math.sin(angle)) * f.depth) /
          2;
        const dy =
          (Math.abs(Math.sin(angle)) * f.width +
            Math.abs(Math.cos(angle)) * f.depth) /
          2;
        return [
          [f.x - dx, f.y - dy],
          [f.x + dx, f.y + dy],
        ];
      }),
    ];
    if (!coordinates.length)
      coordinates.push([0, 0], [blueprint.width, blueprint.height]);
    const minX = Math.min(...coordinates.map(([x]) => x));
    const maxX = Math.max(...coordinates.map(([x]) => x));
    const minY = Math.min(...coordinates.map(([, y]) => y));
    const maxY = Math.max(...coordinates.map(([, y]) => y));
    const centerX = alignment?.centerX ?? (minX + maxX) / 2;
    const centerY = alignment?.centerY ?? (minY + maxY) / 2;
    const scale = alignment?.scale ?? 1 / metersPerUnit(blueprint);

    const wallSegments: SceneWallSegment[] = [];
    const sceneOpenings: SceneOpening[] = [];
    const openings = [
      ...blueprint.doors.map((opening) => ({ opening, type: "door" as const })),
      ...blueprint.windows.map((opening) => ({
        opening,
        type: "window" as const,
      })),
    ];

    const cornerPads = computeCornerExtensions(blueprint.walls);

    blueprint.walls.forEach((wall) => {
      const dx = wall.end[0] - wall.start[0];
      const dy = wall.end[1] - wall.start[1];
      const pixelLength = Math.hypot(dx, dy);
      if (pixelLength < 0.001) return;
      const unitX = dx / pixelLength;
      const unitY = dy / pixelLength;
      const rotation = -Math.atan2(dy, dx);
      const onWall: ProjectedOpening[] = openings
        .filter(({ opening }) => opening.wallId === wall.id)
        .map(({ opening, type }) => {
          const center =
            (opening.x - wall.start[0]) * unitX +
            (opening.y - wall.start[1]) * unitY;
          return {
            opening,
            type,
            center,
            start: Math.max(0, center - opening.width / 2),
            end: Math.min(pixelLength, center + opening.width / 2),
          };
        })
        .sort((a, b) => a.start - b.start);

      const pad = cornerPads.get(wall.id) ?? { startPad: 0, endPad: 0 };
      const firstOpeningStart = onWall[0]?.start ?? pixelLength;
      const lastOpeningEnd = onWall.at(-1)?.end ?? 0;

      // Solo aplicamos retracción en esquina si queda margen suficiente antes del primer/último vano
      const startOffset =
        pad.startPad < 0 && firstOpeningStart + pad.startPad < 2
          ? 0
          : -pad.startPad;
      const endLimit =
        pad.endPad < 0 && pixelLength + pad.endPad - lastOpeningEnd < 2
          ? pixelLength
          : pixelLength + pad.endPad;

      const addSegment = (
        id: string,
        start: number,
        end: number,
        bottom: number,
        height: number,
      ) => {
        if (end - start < 1 || height <= 0) return;
        const midpoint = (start + end) / 2;
        wallSegments.push({
          id,
          elementId: wall.id,
          length: (end - start) / scale,
          height,
          x: (wall.start[0] + unitX * midpoint - centerX) / scale,
          y: bottom + height / 2,
          z: (wall.start[1] + unitY * midpoint - centerY) / scale,
          rotation,
          thickness: Math.max(0.001, wall.thickness / scale),
        });
      };

      let cursor = startOffset;
      onWall.forEach(({ opening, type, start, end }, index) => {
        start = Math.max(cursor, start);
        end = Math.min(endLimit, end);
        if (end <= start) return;
        addSegment(`${wall.id}-solid-${index}`, cursor, start, 0, wall.height);
        const sillHeight = Math.max(
          0,
          Math.min(
            wall.height,
            opening.sillHeight ?? (type === "window" ? 0.9 : 0),
          ),
        );
        const openingHeight = Math.max(
          0,
          Math.min(
            wall.height - sillHeight,
            opening.height ?? (type === "window" ? 1.05 : 2.12),
          ),
        );
        if (openingHeight <= 0) {
          addSegment(
            `${wall.id}-${opening.id}-closed`,
            start,
            end,
            0,
            wall.height,
          );
          cursor = end;
          return;
        }
        if (sillHeight > 0)
          addSegment(
            `${wall.id}-${opening.id}-sill`,
            start,
            end,
            0,
            sillHeight,
          );
        addSegment(
          `${wall.id}-${opening.id}-lintel`,
          start,
          end,
          sillHeight + openingHeight,
          wall.height - sillHeight - openingHeight,
        );

        sceneOpenings.push({
          id: opening.id,
          type,
          width: (end - start) / scale,
          height: openingHeight,
          sillHeight,
          x: (wall.start[0] + (unitX * (start + end)) / 2 - centerX) / scale,
          z: (wall.start[1] + (unitY * (start + end)) / 2 - centerY) / scale,
          rotation,
        });
        cursor = end;
      });
      addSegment(`${wall.id}-solid-end`, cursor, endLimit, 0, wall.height);
    });

    return {
      centerX,
      centerY,
      scale,
      width: Math.max(0.1, (maxX - minX) / scale),
      depth: Math.max(0.1, (maxY - minY) / scale),
      wallSegments,
      openings: sceneOpenings,
    };
  }
}

export const buildSceneModel = new BuildSceneModel();