import type { Room } from "./entities/blueprint";
export const roomPath = (room: Room) =>
  [
    room.polygon ?? [
      [room.x, room.y],
      [room.x + room.width, room.y],
      [room.x + room.width, room.y + room.height],
      [room.x, room.y + room.height],
    ],
    ...(room.holes ?? []),
  ]
    .map((r) => `M ${r.map((p) => p.join(",")).join(" L ")} Z`)
    .join(" ");
/** Preserve the actual footprint through the existing editor's move/resize handles. */
export function roomWithBounds(
  room: Room,
  bounds: Pick<Room, "x" | "y" | "width" | "height">,
): Room {
  const point = ([x, y]: [number, number]): [number, number] => [
    bounds.x + ((x - room.x) * bounds.width) / room.width,
    bounds.y + ((y - room.y) * bounds.height) / room.height,
  ];
  return {
    ...room,
    ...bounds,
    area:
      (room.area * bounds.width * bounds.height) / (room.width * room.height),
    ...(room.polygon
      ? {
          polygon: room.polygon.map(point),
          holes: (room.holes ?? []).map((h) => h.map(point)),
        }
      : {}),
  };
}
