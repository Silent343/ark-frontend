import { NextResponse } from "next/server";
import { withDatabase, table, record } from "./workspace-store";
import {
  sessionCookie,
  currentUser,
  requireUser,
  safeUser,
  token,
  digest,
  hashPassword,
  verifyPassword,
} from "@/bounded-contexts/identity-access/server";
import {
  checkOrigin,
  fail,
  HttpError,
} from "@/kernel/infrastructure/http-error";
const attempts = new Map<string, { count: number; until: number }>();
/** Account and session delivery; invitation acceptance requires the invited account's email. */
export async function identityRequest(
  request: Request,
  resource: "users" | "sessions" | "invitations",
  invitationToken?: string,
) {
  try {
    checkOrigin(request);
    const method = request.method;
    const raw = method === "POST" ? await request.text() : "{}";
    if (raw.length > 16000) fail(413, "Request is too large.");
    const input = JSON.parse(raw);
    if (
      method === "POST" &&
      (!input || typeof input !== "object" || Array.isArray(input))
    )
      fail(400, "Invalid request.");
    const email = String(input.email ?? "")
        .trim()
        .toLowerCase(),
      password = String(input.password ?? "");
    let passwordHash = "";
    if (resource === "users" && method === "POST") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        fail(422, "Enter a valid email.");
      if (password.length < 12 || password.length > 128)
        fail(422, "Use a password with 12–128 characters.");
      if (
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.length > 100
      )
        fail(422, "Name is required.");
      passwordHash = await hashPassword(password);
    }
    if (resource === "sessions" && method === "POST") {
      if (password.length > 128) fail(422, "Invalid credentials.");
      const entry = attempts.get(email);
      if (entry && entry.until > Date.now() && entry.count >= 10)
        fail(429, "Too many attempts. Try again in 10 minutes.");
      attempts.set(email, {
        count: entry && entry.until > Date.now() ? entry.count + 1 : 1,
        until:
          entry && entry.until > Date.now() ? entry.until : Date.now() + 600000,
      });
    }
    let sessionToken: string | undefined;
    const result = await withDatabase(async (db) => {
      if (resource === "sessions" && method === "GET")
        return {
          user: currentUser(db, request),
          setup_required: table(db, "users").length === 0,
        };
      if (resource === "sessions" && method === "DELETE") {
        const raw = sessionCookie(request);
        if (raw)
          db.sessions = table(db, "sessions").filter(
            (s) => s.token_hash !== digest(raw),
          );
        return null;
      }
      if (resource === "invitations") {
        const invite = table(db, "invitations").find(
          (i) =>
            i.token_hash === digest(invitationToken ?? "") &&
            i.status === "pending" &&
            String(i.expires_at) > new Date().toISOString(),
        );
        if (!invite) fail(404, "Invitation unavailable or expired.");
        const project = table(db, "projects").find(
          (p) => p.id === invite.project_id,
        )!;
        if (method === "GET")
          return { project_name: project.name, role: invite.role };
        if (method !== "POST") fail(405, "Method not allowed.");
        const user = requireUser(db, request);
        if (user.email !== invite.email)
          fail(403, "Sign in using the invited email.");
        if (
          !table(db, "members").some(
            (m) => m.project_id === invite.project_id && m.user_id === user.id,
          )
        )
          table(db, "members").push(
            record(invite.project_id, {
              user_id: user.id,
              name: user.name,
              email: user.email,
              role: invite.role,
            }),
          );
        invite.status = "accepted";
        invite.updated_at = new Date().toISOString();
        return { project_id: invite.project_id };
      }
      if (method !== "POST") fail(405, "Method not allowed.");
      let user = table(db, "users").find((u) => u.email === email);
      if (resource === "users") {
        if (user) fail(409, "An account already exists for this email.");
        const first = table(db, "users").length === 0;
        user = record("", {
          name: input.name.trim(),
          email,
          password_hash: passwordHash,
          can_import_legacy: first,
        });
        table(db, "users").push(user);
        if (first)
          for (const project of table(db, "projects"))
            table(db, "members").push(
              record(project.id, {
                user_id: user.id,
                name: user.name,
                email,
                role: "owner",
              }),
            );
      } else {
        if (
          !user ||
          !(await verifyPassword(password, String(user.password_hash)))
        )
          fail(401, "Invalid email or password.");
        attempts.delete(email);
      }
      sessionToken = token();
      db.sessions = table(db, "sessions").filter(
        (s) => String(s.expires_at) > new Date().toISOString(),
      );
      table(db, "sessions").push(
        record("", {
          user_id: user!.id,
          token_hash: digest(sessionToken),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        }),
      );
      return { user: safeUser(user!) };
    }, method !== "GET");
    const response = NextResponse.json(
      { data: result },
      {
        status: method === "POST" && resource === "users" ? 201 : 200,
        headers: {
          "Cache-Control": "no-store",
          ...(process.env.TELURIA_TEST_MODE === "1"
            ? { "X-Teluria-Test-Mode": "1" }
            : {}),
        },
      },
    );
    if (sessionToken || method === "DELETE")
      response.cookies.set("teluria_session", sessionToken ?? "", {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(request.url).protocol === "https:",
        path: "/",
        maxAge: sessionToken ? 7 * 86400 : 0,
      });
    return response;
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof SyntaxError
          ? 400
          : 500;
    return NextResponse.json(
      {
        error: {
          code: status,
          message:
            status === 500
              ? "Could not complete authentication."
              : (error as Error).message,
        },
      },
      { status },
    );
  }
}
