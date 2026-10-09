import type { Blueprint } from './entities/blueprint';

/** Legacy elements are assigned to ground level, even after a basement is inserted. */
export function geometryOnLevel(plan: Blueprint, levelId: string): Blueprint {
  const ground = plan.levels.find((level) => level.elevation === 0)?.id ?? plan.levels[0]?.id;
  const onLevel = (item: { levelId?: string }) => (item.levelId ?? ground) === levelId;
  return {
    ...plan,
    rooms: plan.rooms.filter(onLevel),
    walls: plan.walls.filter(onLevel),
    doors: plan.doors.filter(onLevel),
    windows: plan.windows.filter(onLevel),
    columns: plan.columns.filter(onLevel),
    stairs: plan.stairs?.filter(onLevel),
    roofs: plan.roofs?.filter(onLevel),
    services: plan.services?.filter(onLevel),
    routes: plan.routes?.filter(onLevel),
  };
}
