"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Bell } from "lucide-react";
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
const groups = [
  {
    key: "pm.workspace",
    tabs: [
      ["", "pm.overview"],
      ["tasks", "pm.tasks"],
      ["schedule", "c.schedule"],
      ["milestones", "pm.milestones"],
      ["team", "c.team"],
    ],
  },
  {
    key: "pm.delivery",
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
      ["issues", "pm.issues"],
      ["budget-items", "pm.budget"],
      ["reports", "c.reports"],
      ["change-log", "c.history"],
      ["notifications", "c.notifications"],
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
];
const clientTabs = [
  ["client-portal", "c.clientPortal"],
  ["deliverables", "c.deliverables"],
  ["documents", "pm.documents"],
  ["comments", "c.comments"],
  ["model", "pm.model"],
  ["notifications", "c.notifications"],
];
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
  const visible = client
    ? [{ key: "c.clientPortal", tabs: clientTabs }]
    : groups;
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
          value={slug}
          onChange={(e) =>
            router.push(root + (e.target.value ? "/" + e.target.value : ""))
          }
        >
          {visible
            .flatMap((g) => g.tabs)
            .map(([path, key]) => (
              <option key={path} value={path}>
                {t(key)}
              </option>
            ))}
        </select>
      </label>
      <nav className="collab-module-nav" aria-label={t("pm.workspace")}>
        {visible.map((group) => (
          <div key={group.key} className="collab-module-group">
            {group.tabs.map(([path, key]) => (
              <Link
                key={path}
                href={root + (path ? "/" + path : "")}
                aria-current={slug === path ? "page" : undefined}
              >
                {t(key)}
              </Link>
            ))}
          </div>
        ))}
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
