"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Activity,
  Box,
  ChevronDown,
  DraftingCompass,
  FolderKanban,
  HelpCircle,
  Layers3,
  Menu,
  Settings,
  Sparkles,
  X,
} from "lucide-react";

const navigation = [
  { label: "Proyectos", href: "/", icon: FolderKanban, match: (path: string) => path === "/" || path === "/projects/new" },
  { label: "Editor 2D", href: "/projects/casa-miraflores/editor", icon: DraftingCompass, match: (path: string) => path.includes("/editor") },
  { label: "Estudio 3D", href: "/projects/casa-miraflores/model", icon: Box, match: (path: string) => path.includes("/model") },
  { label: "Simulación", href: "/projects/casa-miraflores/simulation", icon: Activity, match: (path: string) => path.includes("/simulation") },
];

/** Persistent responsive navigation shell shared by every product screen. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f4f4ef] lg:pl-[272px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col overflow-hidden bg-[#111815] text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-[.06] technical-grid" />
        <div className="relative flex h-[88px] items-center gap-3 border-b border-white/10 px-7">
          <div className="grid size-10 place-items-center rounded-xl bg-[#f5f4ec] text-[#30382f] shadow-[0_0_0_1px_rgba(255,255,255,.15)]">
            <Layers3 size={20} strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center gap-2"><span className="text-lg font-semibold tracking-[-.03em]">Teluria</span><span className="rounded-full bg-[#ff6a2b] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">Beta</span></div>
            <p className="mt-0.5 text-[10px] uppercase tracking-[.18em] text-white/45">Inteligencia espacial</p>
          </div>
        </div>

        <nav className="relative flex-1 px-4 py-7">
          <p className="mb-3 px-3 font-mono text-[9px] font-semibold uppercase tracking-[.2em] text-white/35">Espacio de trabajo</p>
          <div className="space-y-1.5">
            {navigation.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} className={`group flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] transition ${active ? "bg-white/[.09] text-white shadow-[inset_3px_0_0_#ff6a2b]" : "text-white/55 hover:bg-white/[.05] hover:text-white"}`}>
                  <Icon size={17} className={active ? "text-[#ff8b5a]" : "text-white/40 group-hover:text-white/70"} />
                  <span className="font-medium">{item.label}</span>
                  {active && <span className="ml-auto size-1.5 rounded-full bg-[#ff6a2b]" />}
                </Link>
              );
            })}
          </div>
          <p className="mb-3 mt-8 px-3 font-mono text-[9px] font-semibold uppercase tracking-[.2em] text-white/35">Soporte</p>
          <Link href="#" className="flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] text-white/50 hover:bg-white/[.05] hover:text-white"><HelpCircle size={17} /> Centro de ayuda</Link>
          <Link href="#" className="flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] text-white/50 hover:bg-white/[.05] hover:text-white"><Settings size={17} /> Preferencias</Link>
        </nav>

        <div className="relative m-4 rounded-2xl border border-white/10 bg-white/[.04] p-3.5">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#f3c4a8] to-[#8ea9a1] text-xs font-bold text-[#111815]">GR</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">Gabriel R.</p><p className="mt-0.5 truncate text-[10px] text-white/40">Espacio de arquitectura</p></div>
            <ChevronDown size={14} className="text-white/35" />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#dfe2d9] bg-[#f7f7f2]/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-[#30382f] text-white"><Layers3 size={18} /></div><span className="font-semibold">Teluria</span></div>
        <div className="flex items-center gap-2"><Link href="/projects/new" className="grid size-9 place-items-center rounded-xl bg-[#ff6a2b] text-white"><Sparkles size={17} /></Link><button aria-label="Abrir navegación" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)} className="grid size-9 place-items-center rounded-xl border border-[#dfe2d9] bg-white"><Menu size={18} /></button></div>
      </header>

      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Cerrar navegación" onClick={()=>setMobileOpen(false)} className="absolute inset-0 bg-[#111815]/55 backdrop-blur-sm"/><aside className="absolute inset-y-0 right-0 w-[min(86vw,320px)] bg-[#111815] p-5 text-white shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 pb-5"><div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-white text-[#30382f]"><Layers3 size={18}/></div><span className="font-semibold">Teluria</span></div><button aria-label="Cerrar menú" onClick={()=>setMobileOpen(false)} className="grid size-9 place-items-center rounded-xl border border-white/10 text-white/70"><X size={17}/></button></div><nav className="mt-6 space-y-2">{navigation.map((item)=>{const Icon=item.icon;const active=item.match(pathname);return <Link key={item.label} href={item.href} onClick={()=>setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${active ? "bg-white/10 text-white" : "text-white/55"}`}><Icon size={17} className={active ? "text-[#ff8755]" : ""}/>{item.label}</Link>;})}</nav><div className="absolute inset-x-5 bottom-6 rounded-2xl border border-white/10 bg-white/[.04] p-4"><p className="text-xs font-semibold">Gabriel R.</p><p className="mt-1 text-[10px] text-white/40">Espacio de arquitectura</p></div></aside></div>}

      <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10 lg:py-9 xl:px-12">{children}</main>
    </div>
  );
}
