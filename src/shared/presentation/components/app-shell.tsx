"use client";

import Link from "next/link";
import { useAuth } from "@/bounded-contexts/identity-access/presentation/auth-provider";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  FolderKanban,
  HelpCircle,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useActiveProject } from "@/shared/presentation/hooks/use-active-project";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

interface NavigationItem {
  key: string;
  label: string;
  href?: string;
  workspace?: "overview";
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const navigation: NavigationItem[] = [
  {
    key: "pm.portfolio",
    label: "Portafolio",
    href: "/projects",
    icon: FolderKanban,
    match: (path) =>
      path === "/" || path === "/projects" || path === "/projects/new",
  },
  {
    key: "pm.workspace",
    label: "Espacio de trabajo",
    workspace: "overview",
    icon: FolderKanban,
    match: (path) =>
      /^\/projects\/[^/]+/.test(path) && path !== "/projects/new",
  },
];

/** Persistent responsive navigation shell shared by every product screen. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const activeProjectId = useActiveProject(pathname);
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div data-app-shell className="min-h-screen bg-[#f4f4ef] lg:pl-[272px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col overflow-hidden bg-[#111815] text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-[.06] technical-grid" />
        <div className="relative flex h-[88px] items-center gap-3 border-b border-white/10 px-7">
          <div className="relative size-11 overflow-hidden rounded-xl bg-[#f5f4ec] shadow-[0_0_0_1px_rgba(255,255,255,.15)]">
            <Image
              src="/teluria-logo.png"
              alt="Logo de Teluria"
              fill
              sizes="44px"
              className="scale-125 object-cover"
              priority
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-[-.03em]">
                Teluria
              </span>
              <span className="rounded-full bg-[#ff6a2b] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">
                Beta
              </span>
            </div>
            <p className="mt-0.5 text-[10px] uppercase tracking-[.18em] text-white/45">
              Inteligencia espacial
            </p>
          </div>
        </div>

        <nav className="relative flex-1 px-4 py-7">
          <p className="mb-3 px-3 font-mono text-[9px] font-semibold uppercase tracking-[.2em] text-white/35">
            {t("nav.workspace", "Espacio de trabajo")}
          </p>
          <div className="space-y-1.5">
            {navigation.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              const href = item.workspace
                ? activeProjectId
                  ? `/projects/${activeProjectId}`
                  : null
                : item.href;
              if (!href)
                return (
                  <button
                    key={item.label}
                    disabled
                    title={t(
                      "nav.chooseProject",
                      "Selecciona primero un proyecto",
                    )}
                    className="flex h-11 w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 text-left text-[13px] text-white/25"
                  >
                    <Icon size={17} />
                    <span className="font-medium">
                      {t(item.key, item.label)}
                    </span>
                    <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 font-mono text-[7px] uppercase">
                      {t("nav.chooseProject", "Elige proyecto")}
                    </span>
                  </button>
                );
              return (
                <Link
                  key={item.label}
                  href={href}
                  className={`group flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] transition ${active ? "bg-white/[.09] text-white" : "text-white/55 hover:bg-white/[.05] hover:text-white"}`}
                >
                  <Icon
                    size={17}
                    className={
                      active
                        ? "text-[#ff8b5a]"
                        : "text-white/40 group-hover:text-white/70"
                    }
                  />
                  <span className="font-medium">{t(item.key, item.label)}</span>
                </Link>
              );
            })}
          </div>
          <p className="mb-3 mt-8 px-3 font-mono text-[9px] font-semibold uppercase tracking-[.2em] text-white/35">
            {t("nav.support", "Soporte")}
          </p>
          <Link
            href="/support"
            className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] transition ${pathname === "/support" ? "bg-white/[.09] text-white" : "text-white/50 hover:bg-white/[.05] hover:text-white"}`}
          >
            <HelpCircle size={17} /> {t("nav.help", "Centro de ayuda")}
          </Link>
          <Link
            href="/preferences"
            className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] transition ${pathname === "/preferences" ? "bg-white/[.09] text-white" : "text-white/50 hover:bg-white/[.05] hover:text-white"}`}
          >
            <Settings size={17} /> {t("nav.preferences", "Preferencias")}
          </Link>
        </nav>

        <div className="relative m-4 rounded-2xl border border-white/10 bg-white/[.04] p-2">
          <Link
            href="/profile"
            className={`flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[.06] ${pathname === "/profile" ? "bg-white/[.08]" : ""}`}
          >
            <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#f3c4a8] to-[#8ea9a1] text-xs font-bold text-[#111815]">
              GR
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{user.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-white/40">
                {t("nav.architectureWorkspace", "Espacio de arquitectura")}
              </p>
            </div>
            <ChevronDown size={14} className="text-white/35" />
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-xl text-[11px] font-semibold text-white/55 transition hover:bg-white/[.07] hover:text-white"
          >
            <LogOut size={14} />
            {t("c.signOut", "Cerrar sesión")}
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#dfe2d9] bg-[#f7f7f2]/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="relative size-10 overflow-hidden rounded-xl bg-white">
            <Image
              src="/teluria-logo.png"
              alt="Logo de Teluria"
              fill
              sizes="40px"
              className="scale-125 object-cover"
              priority
            />
          </div>
          <span className="font-semibold">Teluria</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/projects/new"
            aria-label={t("pm.newProject")}
            className="grid size-9 place-items-center rounded-xl bg-[#ff6a2b] text-white"
          >
            <Sparkles size={17} />
          </Link>
          <button
            aria-label="Abrir navegación"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
            className="grid size-9 place-items-center rounded-xl border border-[#dfe2d9] bg-white text-[#18283d]"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Cerrar navegación"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-[#111815]/55 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 right-0 w-[min(86vw,320px)] overflow-y-auto bg-[#111815] p-5 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div className="flex items-center gap-2.5">
                <div className="relative size-10 overflow-hidden rounded-xl bg-white">
                  <Image
                    src="/teluria-logo.png"
                    alt="Logo de Teluria"
                    fill
                    sizes="40px"
                    className="scale-125 object-cover"
                  />
                </div>
                <span className="font-semibold">Teluria</span>
              </div>
              <button
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
                className="grid size-9 place-items-center rounded-xl border border-white/10 text-white/70"
              >
                <X size={17} />
              </button>
            </div>
            <nav className="mt-6 space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                const href = item.workspace
                  ? activeProjectId
                    ? `/projects/${activeProjectId}`
                    : null
                  : item.href;
                if (!href)
                  return (
                    <button
                      key={item.label}
                      disabled
                      className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/25"
                    >
                      <Icon size={17} />
                      {t(item.key, item.label)}
                      <span className="ml-auto font-mono text-[7px]">
                        {t("nav.chooseProject", "Elige proyecto").toUpperCase()}
                      </span>
                    </button>
                  );
                return (
                  <Link
                    key={item.label}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${active ? "bg-white/10 text-white" : "text-white/55"}`}
                  >
                    <Icon
                      size={17}
                      className={active ? "text-[#ff8755]" : ""}
                    />
                    {t(item.key, item.label)}
                  </Link>
                );
              })}
              <div className="my-4 border-t border-white/10" />
              <Link
                href="/support"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/55"
              >
                <HelpCircle size={17} /> {t("nav.help", "Centro de ayuda")}
              </Link>
              <Link
                href="/preferences"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/55"
              >
                <Settings size={17} /> {t("nav.preferences", "Preferencias")}
              </Link>
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/55"
              >
                <UserRound size={17} /> Mi perfil
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-white/55"
              >
                <LogOut size={17} /> {t("c.signOut", "Cerrar sesión")}
              </button>
            </nav>
          </aside>
        </div>
      )}

      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-9 xl:px-12">
        {children}
      </main>
    </div>
  );
}
