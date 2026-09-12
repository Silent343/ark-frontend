import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Resource } from "@/kernel/domain/resource";
export type StoredRecord = Resource & Record<string, unknown>;
export interface WorkspaceDatabase {
  schema_version: number;
  [table: string]: StoredRecord[] | number;
}
export const collectionNames = [
  "projects",
  "tasks",
  "milestones",
  "documents",
  "issues",
  "budget_items",
  "approvals",
  "activities",
  "users",
  "sessions",
  "members",
  "invitations",
  "calendar_events",
  "task_dependencies",
  "comments",
  "deliverable_packages",
  "notifications",
  "blueprints",
] as const;
const directory =
  process.env.TELURIA_TEST_MODE === "1"
    ? path.join(process.cwd(), ".data", "qa")
    : path.join(process.cwd(), ".data");
const globals = globalThis as typeof globalThis & {
  collaborationQueue?: Promise<unknown>;
  collaborationConnection?: Promise<DatabaseSync>;
};
/** Migrates the legacy JSON once, preserving its source file as a recovery snapshot. */
async function connection() {
  if (!globals.collaborationConnection)
    globals.collaborationConnection = (async () => {
      await mkdir(directory, { recursive: true });
      const sql = new DatabaseSync(path.join(directory, "teluria.sqlite"));
      sql.exec(
        "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)",
      );
      for (const name of collectionNames) {
        sql.exec(
          `CREATE TABLE IF NOT EXISTS ${name}(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data))); CREATE INDEX IF NOT EXISTS idx_${name}_project_id ON ${name}(project_id)`,
        );
      }
      sql.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(json_extract(data,'$.email')); CREATE UNIQUE INDEX IF NOT EXISTS idx_members_identity ON members(project_id,json_extract(data,'$.user_id'));",
      );
      if (
        !sql
          .prepare("SELECT version FROM schema_migrations WHERE version=2")
          .get()
      ) {
        let raw: string;
        try {
          raw = await readFile(
            path.join(directory, "workspace-db.json"),
            "utf8",
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          raw = await readFile(
            path.join(process.cwd(), "data", "workspace-db.json"),
            "utf8",
          );
        }
        const source = JSON.parse(raw) as WorkspaceDatabase;
        sql.exec("BEGIN IMMEDIATE");
        try {
          for (const name of collectionNames)
            for (const item of (Array.isArray(source[name])
              ? source[name]
              : []) as StoredRecord[]) {
              if (name === "budget_items") {
                item.supplier ??= "";
                item.stage ??= "design";
              }
              if (name === "tasks") {
                item.start_date ??= item.due_date;
                item.assignee_id ??= "";
              }
              if (name === "approvals") item.reviewer_id ??= "";
              sql
                .prepare(`INSERT OR IGNORE INTO ${name} VALUES(?,?,?,?,?)`)
                .run(
                  item.id,
                  item.project_id ?? "",
                  item.created_at,
                  item.updated_at,
                  JSON.stringify(item),
                );
            }
          sql
            .prepare("INSERT INTO schema_migrations VALUES(2,?)")
            .run(new Date().toISOString());
          sql.exec("COMMIT");
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      }
      return sql;
    })().catch((error) => {
      globals.collaborationConnection = undefined;
      throw error;
    });
  return globals.collaborationConnection;
}
/** A transaction loads the working set and persists only modified records; SQLite serializes writers. */
export async function withDatabase<T>(
  action: (db: WorkspaceDatabase) => T | Promise<T>,
  write = false,
): Promise<T> {
  const result = (globals.collaborationQueue ?? Promise.resolve()).then(
    async () => {
      const sql = await connection();
      sql.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
      try {
        const db: WorkspaceDatabase = { schema_version: 2 };
        const originals = new Map<string, Map<string, string>>();
        for (const name of collectionNames) {
          const rows = sql
            .prepare(`SELECT data FROM ${name} ORDER BY rowid`)
            .all() as { data: string }[];
          db[name] = rows.map((r) => JSON.parse(r.data) as StoredRecord);
          originals.set(
            name,
            new Map(table(db, name).map((r) => [r.id, JSON.stringify(r)])),
          );
        }
        const result = await action(db);
        if (write)
          for (const name of collectionNames) {
            const old = originals.get(name)!;
            const current = table(db, name);
            const ids = new Set(current.map((r) => r.id));
            for (const id of old.keys())
              if (!ids.has(id))
                sql.prepare(`DELETE FROM ${name} WHERE id=?`).run(id);
            for (const row of current) {
              const serialized = JSON.stringify(row);
              if (old.get(row.id) !== serialized)
                sql
                  .prepare(
                    `INSERT INTO ${name} VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,updated_at=excluded.updated_at,data=excluded.data`,
                  )
                  .run(
                    row.id,
                    row.project_id ?? "",
                    row.created_at,
                    row.updated_at,
                    serialized,
                  );
            }
          }
        sql.exec("COMMIT");
        return result;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  );
  globals.collaborationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
export function table(db: WorkspaceDatabase, name: string): StoredRecord[] {
  const value = db[name];
  if (!Array.isArray(value)) throw new Error("Unknown storage collection.");
  return value;
}
export function record(
  projectId: string,
  values: Record<string, unknown>,
): StoredRecord {
  const now = new Date().toISOString();
  return {
    ...values,
    id: crypto.randomUUID(),
    project_id: projectId,
    created_at: now,
    updated_at: now,
  } as StoredRecord;
}
