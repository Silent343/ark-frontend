"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Box, CalendarDays, CheckCircle2, Clock3, FileScan, MapPin, Plus, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import type { Project, ProjectStatus } from "@/bounded-contexts/project-management/domain/entities/project";
import { useProjects } from "@/bounded-contexts/project-management/presentation/hooks/use-projects";
import { PageHeader, Panel, Skeleton, ErrorState } from "@/shared/presentation/components/ui";

const statusStyles: Record<ProjectStatus, string> = {
  Ready: "bg-[#e2f2e9] text-[#27704d]",
  Processing: "bg-[#fff0d4] text-[#9a6417]",
  Draft: "bg-[#e8eae5] text-[#5d6862]",
};

const statusLabels: Record<ProjectStatus, string> = { Ready: "Listo", Processing: "Procesando", Draft: "Borrador" };

function ProjectThumbnail({ project }: { project: Project }) {
  return (
    <div className={`relative h-44 overflow-hidden bg-[#e9ebe6] fine-grid ${project.thumbnailVariant === "tower" ? "bg-[#dce2df]" : ""}`}>
      <div className="absolute left-4 top-4 rounded-lg border border-white/70 bg-white/75 px-2 py-1 font-mono text-[8px] uppercase tracking-[.16em] text-[#596159] backdrop-blur">{project.floors} niveles · {project.progress}%</div>
      <svg viewBox="0 0 420 220" className="absolute inset-x-3 bottom-0 h-[88%] w-[calc(100%-1.5rem)]" aria-hidden="true">
        <g fill="none" stroke={project.thumbnailVariant === "blueprint" ? "#356b76" : "#4f5f58"} strokeWidth="1.5">
          {project.thumbnailVariant === "tower" ? (
            <>
              <path d="M118 184V54l95-26 91 45v111M118 54l91 46 95-27M209 100v84M145 69v115M273 79v105" />
              {[0,1,2,3].map((row) => <path key={row} d={`M118 ${82 + row * 27}l91 40 95-23`} opacity={.35 + row * .12} />)}
              <path d="M92 184h244M73 198h282" stroke="#8b958f" opacity=".5" />
            </>
          ) : (
            <>
              <path d="M74 181V82l119-54 151 65v88M74 82l135 59 135-48M209 141v40M125 104v77M286 118v63" />
              <path d="M96 181v-77M164 181v-48M244 181v-47M317 181v-76" opacity=".65" />
              <path d="M52 181h316M33 199h354" stroke="#8b958f" opacity=".5" />
              <path d="M111 116l23 10v31l-23-9zM265 131l29-10v35l-29 9z" fill="#dce6e4" />
            </>
          )}
        </g>
        <g fill="#ff6a2b"><circle cx="74" cy="181" r="3"/><circle cx="344" cy="181" r="3"/></g>
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#e9ebe6] to-transparent" />
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link href={`/projects/${project.id}/editor`} className="group overflow-hidden rounded-2xl border border-[#dfe2d9] bg-[#fbfbf7] transition duration-300 hover:-translate-y-1 hover:border-[#bfc6ba] hover:shadow-[0_16px_38px_rgba(17,24,21,.09)]">
      <ProjectThumbnail project={project} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="font-semibold tracking-[-.02em] text-[#17201c]">{project.name}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-[#78837d]"><MapPin size={12} /> {project.location}</p></div>
          <ArrowRight size={17} className="mt-1 text-[#a5aca6] transition group-hover:translate-x-1 group-hover:text-[#ff6a2b]" />
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-[#e5e7e1] pt-4">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyles[project.status]}`}>{statusLabels[project.status]}</span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#87918c]"><CalendarDays size={11} /> {new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short" }).format(new Date(project.updatedAt))}</span>
        </div>
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[.13em] text-[#8b958f]">{project.structureType}</p>
      </div>
    </Link>
  );
}

function DashboardSkeleton() {
  return <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map((item) => <div key={item} className="overflow-hidden rounded-2xl border border-[#dfe2d9] bg-white"><Skeleton className="h-44 rounded-none"/><div className="space-y-4 p-5"><Skeleton className="h-5 w-3/5"/><Skeleton className="h-3 w-2/5"/><Skeleton className="mt-6 h-9 w-full"/></div></div>)}</div>;
}

/** Main project portfolio and prototype entry point. */
export function DashboardScreen() {
  const { data: projects, loading, error, reload } = useProjects();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => (projects ?? []).filter((project) => `${project.name} ${project.location} ${project.structureType}`.toLowerCase().includes(query.toLowerCase())), [projects, query]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader eyebrow="Portafolio arquitectónico" title="Tus proyectos" description="Convierte planos no estructurados en modelos semánticos, experiencias 3D y simulaciones visuales trazables." actions={<Link href="/projects/new" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#ff6a2b] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(255,106,43,.2)] transition hover:bg-[#ea5b20]"><Plus size={17}/> Nuevo proyecto</Link>} />

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        {[{label:"Proyectos activos",value:projects?.length ?? 3,icon:Box},{label:"Modelos listos",value:projects?.filter((p)=>p.status === "Ready").length ?? 1,icon:CheckCircle2},{label:"En análisis",value:projects?.filter((p)=>p.status === "Processing").length ?? 1,icon:Clock3}].map(({label,value,icon:Icon}) => <Panel key={label} className="flex items-center gap-4 p-4"><div className="grid size-10 place-items-center rounded-xl bg-[#e8eae4] text-[#596151]"><Icon size={18}/></div><div><p className="text-xl font-semibold tracking-[-.03em]">{value}</p><p className="mt-0.5 text-[11px] text-[#7b8680]">{label}</p></div></Panel>)}
      </div>

      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <section>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b958f]" size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar por nombre, ubicación o sistema..." className="h-11 w-full rounded-xl border border-[#dfe2d9] bg-[#fbfbf7] pl-10 pr-4 text-sm outline-none transition focus:border-[#7e897d] focus:ring-4 focus:ring-[#596151]/10"/></label>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe2d9] bg-[#fbfbf7] px-4 text-xs font-semibold text-[#4b5751]"><SlidersHorizontal size={15}/> Filtros</button>
          </div>
          {loading && <DashboardSkeleton />}
          {error && <div className="mt-8"><ErrorState message={error} onRetry={reload}/></div>}
          {!loading && !error && <div className="mt-5 grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">{filtered.map((project)=><ProjectCard key={project.id} project={project}/>)}</div>}
          {!loading && !error && filtered.length === 0 && <Panel className="mt-5 grid min-h-72 place-items-center p-8 text-center"><div><Search className="mx-auto text-[#9aa39e]"/><h2 className="mt-3 font-semibold">Sin coincidencias</h2><p className="mt-1 text-sm text-[#78837d]">Prueba con otro nombre o ubicación.</p></div></Panel>}
        </section>

        <aside className="xl:sticky xl:top-9 xl:self-start">
          <Panel className="overflow-hidden p-5">
            <div className="relative grid h-52 place-items-center overflow-hidden rounded-2xl bg-[#171f1b] text-white technical-grid"><div className="absolute right-4 top-4"><Sparkles size={17} className="text-[#ff8755]"/></div><FileScan size={58} strokeWidth={1} className="text-white/75"/><div className="absolute inset-x-7 bottom-6 h-px bg-gradient-to-r from-transparent via-[#ff6a2b] to-transparent"/></div>
            <p className="mt-5 font-mono text-[9px] font-semibold uppercase tracking-[.2em] text-[#ff6a2b]">Primer flujo recomendado</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-.03em]">De plano a espacio digital</h2>
            <p className="mt-2 text-xs leading-5 text-[#71807a]">Sube un PDF o imagen. Teluria preparará un modelo editable de demostración con trazabilidad visual.</p>
            <Link href="/projects/new" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#cfd4ca] py-2.5 text-xs font-semibold transition hover:border-[#596151] hover:bg-[#f1f2ec]">Crear proyecto <ArrowRight size={14}/></Link>
          </Panel>
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#e6d8c6] bg-[#fff8ee] p-4"><div className="mt-0.5 size-2 shrink-0 rounded-full bg-[#e9a23b]"/><p className="text-[11px] leading-5 text-[#78664e]"><strong className="font-semibold">Modo prototipo.</strong> La detección IA y las exportaciones IFC/DXF se conectarán en una fase posterior.</p></div>
        </aside>
      </div>
    </div>
  );
}
