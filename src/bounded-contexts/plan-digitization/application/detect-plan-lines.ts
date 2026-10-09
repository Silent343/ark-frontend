import type { Blueprint, Opening, PlanDiscipline, PlanReview, ServiceKind, ServicePoint, Stair, Wall } from "../domain/entities/blueprint";

interface Run {
  axis: number;
  start: number;
  end: number;
  count: number;
}

/** Conservative, bounded baseline for orthogonal drawings. No trained detector or fabricated confidence. */
export function detectPlanLines(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 145,
): Wall[] {
  if (
    width < 1 ||
    height < 1 ||
    width * height > 2_000_000 ||
    pixels.length !== width * height * 4
  )
    throw new Error("Invalid analysis image (maximum 2 megapixels).");
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      pixels[i + 3] > 128 &&
      pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114 <
        threshold
    );
  };
  const minimum = Math.max(35, Math.round(Math.max(width, height) * 0.045));
  const walls: Wall[] = [];
  for (const horizontal of [true, false]) {
    const across = horizontal ? width : height,
      down = horizontal ? height : width;
    let active: Run[] = [];
    const finish = (run: Run) => {
      // Reject hairline dimensions and large solid blocks; both are common false positives.
      if (run.count < 2 || run.count > Math.max(36, minimum / 2)) return;
      const axis = run.axis - (run.count - 1) / 2;
      walls.push({
        id: `wall-import-${walls.length + 1}`,
        start: horizontal ? [run.start, axis] : [axis, run.start],
        end: horizontal ? [run.end, axis] : [axis, run.end],
        thickness: run.count,
        height: 2.8,
      });
    };
    for (let y = 0; y < down; y++) {
      const next: Run[] = [];
      for (let x = 0; x < across;) {
        if (!ink(horizontal ? x : y, horizontal ? y : x)) {
          x++;
          continue;
        }
        const start = x;
        while (x < across && ink(horizontal ? x : y, horizontal ? y : x)) x++;
        const end = x;
        if (end - start < minimum) continue;
        const previous = active.find(
          (run) =>
            Math.abs(run.start - start) < 8 && Math.abs(run.end - end) < 8,
        );
        if (previous) {
          active = active.filter((run) => run !== previous);
          next.push({
            axis: y,
            start: Math.round(
              (previous.start * previous.count + start) / (previous.count + 1),
            ),
            end: Math.round(
              (previous.end * previous.count + end) / (previous.count + 1),
            ),
            count: previous.count + 1,
          });
        } else next.push({ axis: y, start, end, count: 1 });
      }
      active.forEach(finish);
      active = next;
    }
    active.forEach(finish);
  }
  // 45° runs are proposals too; incomplete sloped rooms remain unclassified.
  const bounded = [...walls, ...detectDiagonalWalls(ink, width, height, minimum)].slice(0, 400);
  return bounded.map((wall) => ({
    ...wall,
    start: snap(wall.start, wall, bounded),
    end: snap(wall.end, wall, bounded),
  }));
}

/** Groups parallel dark runs into conservative 45° wall centerlines. */
function detectDiagonalWalls(ink: (x: number, y: number) => boolean, width: number, height: number, minimum: number): Wall[] {
  const found: Wall[] = [];
  for (const direction of [1, -1]) {
    const runs: Array<{ offset: number; startX: number; startY: number; endX: number; endY: number }> = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!ink(x, y) || (x > 0 && y - direction >= 0 && y - direction < height && ink(x - 1, y - direction))) continue;
      let endX = x, endY = y;
      while (endX + 1 < width && endY + direction >= 0 && endY + direction < height && ink(endX + 1, endY + direction)) {
        endX++;
        endY += direction;
      }
      if (endX - x + 1 >= minimum)
        runs.push({ offset: y - direction * x, startX: x, startY: y, endX, endY });
    }
    runs.sort((a, b) => a.offset - b.offset);
    let group: typeof runs = [];
    const flush = () => {
      if (group.length < 2 || group.length > Math.max(36, minimum / 2)) { group = []; return; }
      const average = (key: "startX" | "startY" | "endX" | "endY") =>
        group.reduce((sum, run) => sum + run[key], 0) / group.length;
      found.push({
        id: `wall-diagonal-${found.length + 1}`,
        start: [average("startX"), average("startY")],
        end: [average("endX"), average("endY")],
        thickness: Math.max(2, group.length / Math.SQRT2), height: 2.8,
      });
      group = [];
    };
    for (const run of runs) {
      const previous = group.at(-1);
      if (previous && (run.offset - previous.offset > 1 ||
        Math.abs(run.startX - previous.startX) > 9 || Math.abs(run.endX - previous.endX) > 9)) flush();
      group.push(run);
    }
    flush();
  }
  return found.slice(0, 100);
}

function snap(
  point: [number, number],
  own: Wall,
  walls: Wall[],
): [number, number] {
  let result = point,
    nearest = 7;
  for (const wall of walls) {
    if (wall.id === own.id) continue;
    const dx = wall.end[0] - wall.start[0],
      dy = wall.end[1] - wall.start[1];
    const denominator = dx * dx + dy * dy;
    if (!denominator) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - wall.start[0]) * dx + (point[1] - wall.start[1]) * dy) /
          denominator,
      ),
    );
    const projected: [number, number] = [
      wall.start[0] + t * dx,
      wall.start[1] + t * dy,
    ];
    const distance = Math.hypot(
      projected[0] - point[0],
      projected[1] - point[1],
    );
    if (distance < nearest) {
      nearest = distance;
      result = projected;
    }
  }
  return result;
}

/** Flood-fill enclosed regions; reject non-rectangular rooms rather than silently distorting them. */
export function findRectangularRooms(
  walls: Wall[],
  width: number,
  height: number,
): Blueprint["rooms"] {
  const step = 4,
    w = Math.ceil(width / step),
    h = Math.ceil(height / step);
  if (w * h > 150_000) throw new Error("Room analysis bounds exceeded.");
  const occupied = new Uint8Array(w * h);
  walls.forEach((wall) => {
    const half = Math.max(2, wall.thickness / 2);
    for (
      let y = Math.max(
        0,
        Math.floor((Math.min(wall.start[1], wall.end[1]) - half) / step),
      );
      y <
      Math.min(
        h,
        Math.ceil((Math.max(wall.start[1], wall.end[1]) + half) / step),
      );
      y++
    )
      for (
        let x = Math.max(
          0,
          Math.floor((Math.min(wall.start[0], wall.end[0]) - half) / step),
        );
        x <
        Math.min(
          w,
          Math.ceil((Math.max(wall.start[0], wall.end[0]) + half) / step),
        );
        x++
      )
        occupied[y * w + x] = 1;
  });
  const rooms: Blueprint["rooms"] = [],
    queue = new Int32Array(w * h);
  for (let seed = 0; seed < occupied.length; seed++) {
    if (occupied[seed]) continue;
    let head = 0,
      tail = 1,
      minX = w,
      maxX = 0,
      minY = h,
      maxY = 0,
      edge = false;
    queue[0] = seed;
    occupied[seed] = 1;
    while (head < tail) {
      const index = queue[head++],
        x = index % w,
        y = Math.floor(index / w);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const neighbor of [
        x > 0 ? index - 1 : -1,
        x < w - 1 ? index + 1 : -1,
        y > 0 ? index - w : -1,
        y < h - 1 ? index + w : -1,
      ])
        if (neighbor >= 0 && !occupied[neighbor]) {
          occupied[neighbor] = 1;
          queue[tail++] = neighbor;
        }
    }
    const roomWidth = (maxX - minX + 1) * step,
      roomHeight = (maxY - minY + 1) * step;
    if (
      !edge &&
      roomWidth >= 40 &&
      roomHeight >= 40 &&
      tail / ((maxX - minX + 1) * (maxY - minY + 1)) > 0.92
    )
      rooms.push({
        id: `room-import-${rooms.length + 1}`,
        name: `Room ${rooms.length + 1}`,
        x: minX * step,
        y: minY * step,
        width: roomWidth,
        height: roomHeight,
        area: 0,
      });
  }
  return rooms.slice(0, 100);
}

/** Labels remain reviewable OCR evidence, never authority for dimensions or structural use. */
export function suggestRoomNames(
  rooms: Blueprint["rooms"],
  text: PlanReview["text"],
): Blueprint["rooms"] {
  return rooms.map((room) => {
    const labels = text.filter(
      (line) =>
        line.confidence >= 50 &&
        /[a-záéíóúñãç]{3}/i.test(line.text) &&
        line.x + line.width / 2 > room.x &&
        line.x + line.width / 2 < room.x + room.width &&
        line.y + line.height / 2 > room.y &&
        line.y + line.height / 2 < room.y + room.height,
    );
    return {
      ...room,
      name:
        labels
          .map((line) => line.text.trim())
          .join(" ")
          .slice(0, 100) || room.name,
    };
  });
}

/** Only labelled, legible annotations become proposals; symbols require manual confirmation. */
export function suggestServicePoints(
  text: PlanReview["text"],
  discipline: PlanDiscipline,
  levelId: string,
  width: number,
  height: number,
): ServicePoint[] {
  if (discipline !== "electrical" && discipline !== "plumbing") return [];
  const electrical: Array<[ServiceKind, RegExp]> = [
    ["outlet", /tomacorriente|toma corriente|enchufe|outlet|receptacle|socket/i],
    ["switch", /interruptor|switch/i],
    ["light", /luminaria|lámpara|lamp|light/i],
    ["panel", /tablero|distribution board|electric panel/i],
  ];
  const plumbing: Array<[ServiceKind, RegExp]> = [
    ["drain", /desagüe|drenaje|drain|inodoro|sanitario/i],
    ["water", /grifo|lavamanos|lavabo|faucet|sink|agua potable/i],
  ];
  const patterns = discipline === "electrical" ? electrical : plumbing;
  return text.flatMap((line, index) => {
    if (line.confidence < 55) return [];
    const kind = patterns.find(([, pattern]) => pattern.test(line.text))?.[0];
    const x = line.x + line.width / 2;
    const y = line.y + line.height / 2;
    if (!kind || !Number.isFinite(x) || !Number.isFinite(y) ||
      x < 0 || y < 0 || x > width || y > height) return [];
    return [{
      id: `service-proposal-${index + 1}`, levelId, kind,
      name: line.text.trim().slice(0, 100), x, y,
    }];
  }).slice(0, 100);
}

/** Text labels near a wall suggest openings; a label alone never confirms a symbol. */
export function suggestOpeningsFromText(
  text: PlanReview["text"], walls: Wall[], levelId: string,
  metersPerPixel: number,
): { doors: Opening[]; windows: Opening[] } {
  const doors: Opening[] = [], windows: Opening[] = [];
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return { doors, windows };
  for (const [index, line] of text.entries()) {
    if (line.confidence < 65) continue;
    const type = /\b(puerta|door|porta)\b/i.test(line.text) ? "door" :
      /\b(ventana|window|janela)\b/i.test(line.text) ? "window" : null;
    if (!type) continue;
    const x = line.x + line.width / 2, y = line.y + line.height / 2;
    let nearest: { wall: Wall; x: number; y: number; distance: number; length: number } | null = null;
    for (const wall of walls) {
      const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1];
      const length = Math.hypot(dx, dy);
      if (length < 30) continue;
      const t = Math.max(0, Math.min(1, ((x - wall.start[0]) * dx + (y - wall.start[1]) * dy) / (length * length)));
      const projectedX = wall.start[0] + dx * t, projectedY = wall.start[1] + dy * t;
      const distance = Math.hypot(x - projectedX, y - projectedY);
      if (!nearest || distance < nearest.distance) nearest = { wall, x: projectedX, y: projectedY, distance, length };
    }
    if (!nearest || nearest.distance > Math.max(24, nearest.wall.thickness * 2)) continue;
    const width = Math.min(nearest.length * 0.45, (type === "door" ? 0.9 : 1.2) / metersPerPixel);
    const fromStart = Math.hypot(nearest.x - nearest.wall.start[0], nearest.y - nearest.wall.start[1]);
    if (width < 20 || fromStart < width / 2 || nearest.length - fromStart < width / 2) continue;
    const opening: Opening = {
      id: `${type}-proposal-${index + 1}`, levelId, wallId: nearest.wall.id,
      x: nearest.x, y: nearest.y, width,
      rotation: Math.atan2(nearest.wall.end[1] - nearest.wall.start[1], nearest.wall.end[0] - nearest.wall.start[0]) * 180 / Math.PI,
    };
    if (type === "door") doors.push(opening); else windows.push(opening);
  }
  return { doors: doors.slice(0, 40), windows: windows.slice(0, 40) };
}

/** Stair labels locate a proposal; flight shape and orientation still require confirmation. */
export function suggestStairsFromText(
  text: PlanReview["text"], levelId: string, metersPerPixel: number,
  width: number, height: number,
): Stair[] {
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return [];
  return text.flatMap((line, index) => {
    if (line.confidence < 70 || !/\b(escalera|escaleras|stair|stairs|staircase|escada)\b/i.test(line.text)) return [];
    const x = line.x + line.width / 2, y = line.y + line.height / 2;
    if (x < 0 || y < 0 || x > width || y > height) return [];
    const spiral = /caracol|spiral|helicoidal/i.test(line.text);
    return [{
      id: `stair-proposal-${index + 1}`, levelId, x, y,
      radius: Math.min(80, 0.55 / metersPerPixel),
      type: spiral ? "spiral" as const : "straight" as const,
      ...(!spiral ? { length: Math.min(200, 2.8 / metersPerPixel), rotation: 0 } : {}),
    }];
  }).slice(0, 30);
}
