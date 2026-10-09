"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, RefreshCw } from "lucide-react";
import { useWorkspace } from "./workspace-context";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { WorkspaceSkeleton } from "./workspace-ui";
const ClientPortal = dynamic(
  () =>
    import("@/bounded-contexts/client-approvals/presentation/approvals-screen").then(
      (m) => m.ApprovalsScreen,
    ),
  { loading: () => <WorkspaceSkeleton /> },
);
type WorkspaceTab = readonly [path: string, labelKey: string];

/** Each top-level destination answers one project question; its views stay visible in context. */
const projectAreas: Array<{ key: string; tabs: WorkspaceTab[] }> = [
  {
    key: "pm.nav.work",
    tabs: [
      ["tasks", "pm.kanban"],
      ["schedule", "c.schedule"],
      ["milestones", "pm.gantt"],
      ["team", "c.team"],
    ],
  },
  {
    key: "pm.design",
    tabs: [
      ["editor", "pm.plans"],
      ["model", "pm.model"],
      ["simulation", "pm.simulation"],
    ],
  },
  {
    key: "pm.nav.delivery",
    tabs: [
      ["documents", "pm.documents"],
      ["deliverables", "c.deliverables"],
      ["approvals", "pm.client"],
      ["comments", "c.comments"],
    ],
  },
  {
    key: "pm.control",
    tabs: [
      ["budget-items", "pm.budget"],
      ["issues", "pm.issues"],
      ["reports", "c.reports"],
      ["change-log", "c.history"],
      ["notifications", "c.notifications"],
    ],
  },
];
const clientTabs = [
  ["client-portal", "c.clientPortal"],
  ["deliverables", "c.deliverables"],
  ["documents", "pm.documents"],
  ["comments", "c.comments"],
  ["model", "pm.model"],
  ["notifications", "c.notifications"],
] satisfies WorkspaceTab[];
/** Navigation mirrors API capabilities. Hiding links is supplementary, not an authorization boundary. */
export function WorkspaceFrame({ children }: { children: React.ReactNode }) {
  const { data, loading, error, reload, busy, notice } = useWorkspace(),
    pathname = usePathname(),
    router = useRouter(),
    { t } = useI18n();
  if (loading) return <WorkspaceSkeleton />;
  if (!data)
    return (
      <div className="pm-card pm-empty">
        <h1>{t("pm.unavailable")}</h1>
        <p>{error}</p>
        <button className="pm-button" onClick={() => void reload()}>
          {t("pm.retry")}
        </button>
        <Link href="/projects">{t("pm.back")}</Link>
      </div>
    );
  const root = "/projects/" + data.project.id,
    client = data.project.role === "client",
    slug = pathname.slice(root.length).replace(/^\//, "");
  const activeArea = projectAreas.find((area) =>
    area.tabs.some(([path]) => path === slug),
  );
  const restricted = client && !clientTabs.some(([path]) => path === slug);
  const unread = data.coordination.notifications.filter(
    (n) => !n.read_at,
  ).length;
  return (
    <div className="pm-workspace">
      <div className="pm-breadcrumb">
        <Link href="/projects">
          <ArrowLeft size={14} />
          {t("pm.portfolio")}
        </Link>
        <span>/</span>
        <span>{data.project.name}</span>
        <span className="pm-local">{t("c." + data.project.role)}</span>
        <Link href={root + "/notifications"} aria-label={t("c.notifications")}>
          <Bell size={15} />
          {unread || ""}
        </Link>
        <button
          className="pm-icon-button"
          aria-label={t("c.refresh")}
          onClick={() => void reload()}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <label className="collab-mobile-nav">
        <span>{t("pm.workspace")}</span>
        <select
          value={client ? slug || "client-portal" : activeArea?.key ?? "pm.overview"}
          onChange={(event) => {
            const destination = event.currentTarget.value;
            if (client) return router.push(root + "/" + destination);
            if (destination === "pm.overview") return router.push(root);
            const area = projectAreas.find((item) => item.key === destination);
            if (area) router.push(root + "/" + area.tabs[0][0]);
          }}
        >
          {client
            ? clientTabs.map(([path, key]) => (
                <option key={path} value={path}>{t(key)}</option>
              ))
            : [
                <option key="overview" value="pm.overview">{t("pm.overview")}</option>,
                ...projectAreas.map((area) => (
                  <option key={area.key} value={area.key}>{t(area.key)}</option>
                )),
              ]}
        </select>
      </label>
      {!client && activeArea && (
        <label className="collab-mobile-subnav">
          <span>{t("pm.nav.view")}</span>
          <select
            value={slug}
            onChange={(event) => router.push(root + "/" + event.target.value)}
          >
            {activeArea.tabs.map(([path, key]) => (
              <option key={path} value={path}>{t(key)}</option>
            ))}
          </select>
        </label>
      )}
      <nav className="collab-module-nav" aria-label={t("pm.workspace")}>
        <div className="collab-primary-views">
          {client ? clientTabs.map(([path, key]) => (
            <Link key={path} href={root + "/" + path} aria-current={slug === path ? "page" : undefined}>{t(key)}</Link>
          )) : (
            <>
              <Link href={root} aria-current={!slug ? "page" : undefined}>{t("pm.overview")}</Link>
              {projectAreas.map((area) => (
                <Link
                  key={area.key}
                  href={root + "/" + area.tabs[0][0]}
                  data-active={activeArea?.key === area.key ? "true" : undefined}
                >
                  {t(area.key)}
                </Link>
              ))}
            </>
          )}
        </div>
        {!client && activeArea && (
          <div className="collab-context-views" role="group" aria-label={t("pm.nav.view")}>
            {activeArea.tabs.map(([path, key]) => (
              <Link
                key={path}
                href={root + "/" + path}
                aria-current={slug === path ? "page" : undefined}
              >
                {t(key)}
              </Link>
            ))}
          </div>
        )}
      </nav>
      {error && (
        <div role="alert" className="pm-alert pm-danger">
          {error}
          <button onClick={() => void reload()}>{t("pm.reload")}</button>
        </div>
      )}
      {(busy || notice) && !error && (
        <div role="status" className="pm-save-status">
          {t(busy ? "pm.saving" : "pm.saved")}
        </div>
      )}
      {client && !slug ? (
        <ClientPortal />
      ) : restricted ? (
        <div className="pm-card pm-empty">
          <h1>{t("c.clientPortal")}</h1>
          <p>{t("c.restricted")}</p>
          <Link className="pm-button pm-primary" href={root + "/client-portal"}>
            {t("c.goPortal")}
          </Link>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
