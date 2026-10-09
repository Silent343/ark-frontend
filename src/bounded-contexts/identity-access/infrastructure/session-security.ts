import {
  randomBytes,
  createHash,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { SessionUser, ProjectRole } from "../domain/identity";
import {
  table,
  type WorkspaceDatabase,
  type StoredRecord,
} from "@/kernel/infrastructure/workspace-store";
import { fail } from "@/kernel/infrastructure/http-error";
const scrypt = promisify(derive);
export const token = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function sessionCookie(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("ark_session="))
    ?.slice("ark_session=".length);
}
/** Salted password derivation and hashed session tokens keep reusable secrets out of the database. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer,
    expected = Buffer.from(hash, "hex");
  return (
    expected.length === derived.length && timingSafeEqual(expected, derived)
  );
}
export function safeUser(
  user: StoredRecord,
): SessionUser & { can_import_legacy: boolean } {
  return {
    id: user.id,
    name: String(user.name),
    email: String(user.email),
    can_import_legacy: user.can_import_legacy === true,
  };
}
export function currentUser(
  db: WorkspaceDatabase,
  request: Request,
): SessionUser | null {
  const raw = sessionCookie(request);
  if (!raw) return null;
  const session = table(db, "sessions").find(
    (s) =>
      s.token_hash === digest(raw) &&
      String(s.expires_at) > new Date().toISOString(),
  );
  const user =
    session && table(db, "users").find((u) => u.id === session.user_id);
  return user ? safeUser(user) : null;
}
export function requireUser(db: WorkspaceDatabase, request: Request) {
  return currentUser(db, request) ?? fail(401, "Please sign in to continue.");
}
export function projectRole(
  db: WorkspaceDatabase,
  projectId: string,
  userId: string,
): ProjectRole {
  const member = table(db, "members").find(
    (m) => m.project_id === projectId && m.user_id === userId,
  );
  return member
    ? (member.role as ProjectRole)
    : fail(404, "Project not found.");
}
