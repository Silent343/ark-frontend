/** Finish-to-start dependency scheduling uses whole calendar days, without resource leveling. */
export interface ScheduledTask {
  id: string;
  title: string;
  due_date: string;
  status: string;
  start_date?: string;
}
export interface Dependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  lag_days: number;
}
export function analyzeSchedule(
  tasks: ScheduledTask[],
  dependencies: Dependency[],
) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>(),
    visited = new Set<string>(),
    order: string[] = [];
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new Error("Dependencies cannot contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of dependencies.filter((e) => e.successor_id === id)) {
      if (!byId.has(edge.predecessor_id))
        throw new Error("Predecessor not found.");
      visit(edge.predecessor_id);
    }
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  tasks.forEach((t) => visit(t.id));
  const starts = new Map<string, number>(),
    finishes = new Map<string, number>(),
    durations = new Map<string, number>();
  const day = (date: string) =>
    Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
  const origin = Math.min(
    ...tasks.map((t) => day(t.start_date || t.due_date)),
    Math.floor(Date.now() / 86400000),
  );
  for (const id of order) {
    const task = byId.get(id)!;
    const duration = Math.max(
      1,
      day(task.due_date) - day(task.start_date || task.due_date) + 1,
    );
    durations.set(id, duration);
    const earliest = Math.max(
      day(task.start_date || task.due_date) - origin,
      ...dependencies
        .filter((e) => e.successor_id === id)
        .map((e) => finishes.get(e.predecessor_id)! + e.lag_days),
    );
    starts.set(id, earliest);
    finishes.set(id, earliest + duration);
  }
  const finish = Math.max(0, ...finishes.values()),
    latest = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const successors = dependencies.filter((e) => e.predecessor_id === id);
    const end = successors.length
      ? Math.min(
          ...successors.map((e) => latest.get(e.successor_id)! - e.lag_days),
        )
      : finish;
    latest.set(id, end - durations.get(id)!);
  }
  return tasks.map((task) => ({
    ...task,
    earliest_start: new Date((origin + starts.get(task.id)!) * 86400000)
      .toISOString()
      .slice(0, 10),
    earliest_finish: new Date((origin + finishes.get(task.id)! - 1) * 86400000)
      .toISOString()
      .slice(0, 10),
    duration: durations.get(task.id)!,
    critical: latest.get(task.id) === starts.get(task.id),
    blocked: dependencies.some(
      (e) =>
        e.successor_id === task.id &&
        byId.get(e.predecessor_id)?.status !== "done",
    ),
  }));
}
