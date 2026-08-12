import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import type { Opening } from "@/bounded-contexts/plan-digitization";
import type { SceneModel, SceneOpening, SceneWallSegment } from "@/bounded-contexts/spatial-visualization/domain/value-objects/scene-preferences";

interface ProjectedOpening {
  opening: Opening;
  type: "door" | "window";
  center: number;
  start: number;
  end: number;
}

/** Anti-corruption translator from semantic-plan coordinates to scene space. */
export class BuildSceneModel {
  execute(blueprint: Blueprint): SceneModel {
    const coordinates = blueprint.walls.flatMap((wall) => [wall.start, wall.end]);
    const minX = Math.min(...coordinates.map(([x]) => x));
    const maxX = Math.max(...coordinates.map(([x]) => x));
    const minY = Math.min(...coordinates.map(([, y]) => y));
    const maxY = Math.max(...coordinates.map(([, y]) => y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const scale = 86;

    const wallSegments: SceneWallSegment[] = [];
    const sceneOpenings: SceneOpening[] = [];
    const openings = [
      ...blueprint.doors.map((opening) => ({ opening, type: "door" as const })),
      ...blueprint.windows.map((opening) => ({ opening, type: "window" as const })),
    ];

    blueprint.walls.forEach((wall) => {
      const dx = wall.end[0] - wall.start[0];
      const dy = wall.end[1] - wall.start[1];
      const pixelLength = Math.hypot(dx, dy);
      const unitX = dx / pixelLength;
      const unitY = dy / pixelLength;
      const rotation = -Math.atan2(dy, dx);
      const onWall: ProjectedOpening[] = openings
        .filter(({ opening }) => opening.wallId === wall.id)
        .map(({ opening, type }) => {
          const center = (opening.x - wall.start[0]) * unitX + (opening.y - wall.start[1]) * unitY;
          return { opening, type, center, start: Math.max(0, center - opening.width / 2), end: Math.min(pixelLength, center + opening.width / 2) };
        })
        .sort((a, b) => a.start - b.start);

      const addSegment = (id: string, start: number, end: number, bottom: number, height: number) => {
        if (end - start < 1 || height <= 0) return;
        const midpoint = (start + end) / 2;
        wallSegments.push({
          id,
          length: (end - start) / scale,
          height,
          x: (wall.start[0] + unitX * midpoint - centerX) / scale,
          y: bottom + height / 2,
          z: (wall.start[1] + unitY * midpoint - centerY) / scale,
          rotation,
          thickness: Math.max(0.12, wall.thickness / scale),
        });
      };

      let cursor = 0;
      onWall.forEach(({ opening, type, start, end }, index) => {
        addSegment(`${wall.id}-solid-${index}`, cursor, start, 0, wall.height);
        const sillHeight = type === "window" ? 0.9 : 0;
        const openingHeight = type === "window" ? 1.05 : 2.12;
        if (sillHeight > 0) addSegment(`${wall.id}-${opening.id}-sill`, start, end, 0, sillHeight);
        addSegment(`${wall.id}-${opening.id}-lintel`, start, end, sillHeight + openingHeight, wall.height - sillHeight - openingHeight);

        sceneOpenings.push({
          id: opening.id,
          type,
          width: opening.width / scale,
          height: openingHeight,
          sillHeight,
          x: (opening.x - centerX) / scale,
          z: (opening.y - centerY) / scale,
          rotation,
        });
        cursor = end;
      });
      addSegment(`${wall.id}-solid-end`, cursor, pixelLength, 0, wall.height);
    });

    return {
      centerX,
      centerY,
      scale,
      width: (maxX - minX) / scale,
      depth: (maxY - minY) / scale,
      wallSegments,
      openings: sceneOpenings,
    };
  }
}

export const buildSceneModel = new BuildSceneModel();
