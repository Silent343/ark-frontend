import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  withDatabase,
  table,
} from "@/composition/infrastructure/workspace-store";
import {
  requireUser,
  projectRole,
} from "@/bounded-contexts/identity-access/server";
import { fail, HttpError } from "@/kernel/infrastructure/http-error";
import { renderProjectReport } from "@/bounded-contexts/reporting/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Project membership and locale are resolved before building the downloadable report read model. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params,
      requested = new URL(request.url).searchParams.get("locale"),
      locale = ["en", "es", "pt"].includes(requested ?? "") ? requested! : "es";
    const dictionaries = await Promise.all(
      ["workspace", "collaboration"].map((folder) =>
        readFile(
          path.join(process.cwd(), "public", "i18n", folder, locale + ".json"),
          "utf8",
        ).then((value) => JSON.parse(value) as Record<string, string>),
      ),
    );
    const translations = Object.assign({}, ...dictionaries) as Record<
        string,
        string
      >,
      t = (key: string) => translations[key] ?? key;
    const report = await withDatabase((db) => {
      const user = requireUser(db, request);
      if (projectRole(db, projectId, user.id) === "client")
        fail(403, "Internal project report.");
      const project = table(db, "projects").find((p) => p.id === projectId)!,
        rows = (name: string) =>
          table(db, name).filter((r) => r.project_id === projectId),
        costs = rows("budget_items");
      const money = (n: number) =>
          new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(project.currency),
          }).format(n),
        status = (s: unknown) => t("pm.status." + s);
      return {
        name: String(project.name),
        location: String(project.location),
        currency: String(project.currency),
        generated_at: new Date().toISOString(),
        sections: [
          {
            title: t("pm.overview"),
            rows: [
              t("pm.field.owner") + ": " + project.owner_name,
              t("pm.field.phase") + ": " + status(project.phase),
              t("pm.tasksComplete") +
                ": " +
                rows("tasks").filter((task) => task.status === "done").length +
                "/" +
                rows("tasks").length,
              t("pm.plannedCost") +
                ": " +
                money(
                  costs.reduce(
                    (s, c) => s + Number(c.quantity) * Number(c.unit_cost),
                    0,
                  ),
                ),
              t("pm.actualCost") +
                ": " +
                money(costs.reduce((s, c) => s + Number(c.actual_cost), 0)),
            ],
          },
          {
            title: t("pm.tasks"),
            rows: rows("tasks").map(
              (task) =>
                task.title +
                " | " +
                task.assignee +
                " | " +
                task.due_date +
                " | " +
                status(task.status),
            ),
          },
          {
            title: t("pm.milestones"),
            rows: rows("milestones").map(
              (m) => m.title + " | " + m.due_date + " | " + status(m.status),
            ),
          },
          {
            title: t("pm.budget"),
            rows: costs.map(
              (c) =>
                c.title +
                " | " +
                money(Number(c.quantity) * Number(c.unit_cost)) +
                " | " +
                (c.supplier ?? "") +
                " | " +
                status(c.stage),
            ),
          },
          {
            title: t("pm.issues"),
            rows: rows("issues").map(
              (i) => i.title + " | " + status(i.status) + " | " + i.assignee,
            ),
          },
          {
            title: t("pm.client"),
            rows: rows("approvals").map(
              (a) => a.title + " | " + status(a.status) + " | " + a.reviewer,
            ),
          },
        ],
      };
    });
    const pdf = await renderProjectReport(report);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="ark-project-report.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json(
      {
        error: {
          code: status,
          message:
            status === 500 ? "Report unavailable." : (e as Error).message,
        },
      },
      { status },
    );
  }
}
