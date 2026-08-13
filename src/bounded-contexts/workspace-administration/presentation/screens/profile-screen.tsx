"use client";

import { useState } from "react";
import { Check, Edit3, LogOut, Save, X } from "lucide-react";
import type { WorkspaceProfile } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";
import { useWorkspaceProfile } from "@/bounded-contexts/workspace-administration/presentation/hooks/use-workspace-administration";
import { workspaceAdministration } from "@/bounded-contexts/workspace-administration/public";
import { ErrorState, PageHeader, Panel, Skeleton } from "@/shared/presentation/components/ui";

const activityLabels = { Creation: "Creación", Analysis: "Análisis", Export: "Exportación", System: "Sistema", Edition: "Edición" } as const;

/** Editable profile and professional-activity view. */
export function ProfileScreen() {
  const { data, loading, error, reload } = useWorkspaceProfile();
  if (loading) return <ProfileSkeleton />;
  if (error || !data) return <ErrorState message={error ?? "No se encontró el perfil."} onRetry={reload} />;
  return <ProfileContent key={data.id} initialProfile={data} />;
}

function ProfileContent({ initialProfile }: { initialProfile: WorkspaceProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [draft, setDraft] = useState(initialProfile);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof WorkspaceProfile>(field: K, value: WorkspaceProfile[K]) => setDraft((current) => ({ ...current, [field]: value }));
  const cancel = () => { setDraft(profile); setEditing(false); };
  const save = async () => {
    const next = await workspaceAdministration.saveProfile.execute(draft);
    setProfile(next); setEditing(false); setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="mx-auto max-w-[1460px]">
      <PageHeader eyebrow="Cuenta profesional" title="Mi perfil" description="Administra tu información de cuenta y revisa la actividad reciente del espacio de trabajo." actions={<OnlineBadge />} />

      <Panel className="mt-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-[#3268e8] text-lg font-bold text-white shadow-[0_8px_24px_rgba(50,104,232,.2)]">{profile.initials}</div>
        <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{profile.fullName}</h2><p className="mt-1 truncate text-xs text-[#728079]">{profile.email}</p><span className="mt-2 inline-flex rounded-md bg-[#e6efff] px-2 py-1 text-[9px] font-semibold text-[#2459cb]">{profile.membership}</span></div>
        <div className="flex flex-wrap gap-2">
          {editing ? <><button onClick={cancel} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9ddd4] bg-white px-4 text-xs font-semibold"><X size={14}/> Cancelar</button><button onClick={save} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#30382f] px-4 text-xs font-semibold text-white"><Save size={14}/> Guardar cambios</button></> : <button onClick={() => setEditing(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#3268e8] bg-white px-4 text-xs font-semibold text-[#2459cb]"><Edit3 size={14}/> Editar perfil</button>}
        </div>
      </Panel>

      {saved && <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#b9dec8] bg-[#edf8f1] px-4 py-3 text-xs font-semibold text-[#28704c]"><Check size={15}/> Perfil guardado localmente.</div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel className="p-5 sm:p-6"><SectionTitle title="Información personal" description="Datos de contacto y organización"/><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Nombre completo" value={draft.fullName} editing={editing} onChange={(value)=>update("fullName",value)}/><Field label="Correo electrónico" value={draft.email} editing={editing} type="email" onChange={(value)=>update("email",value)}/><Field label="Número telefónico" value={draft.phone} editing={editing} onChange={(value)=>update("phone",value)}/><Field label="Organización / Empresa" value={draft.organization} editing={editing} onChange={(value)=>update("organization",value)}/><div className="sm:col-span-2"><Field label="Cargo" value={draft.position} editing={editing} onChange={(value)=>update("position",value)}/></div></div></Panel>
        <Panel className="p-5 sm:p-6"><SectionTitle title="Información profesional" description="Credenciales y preferencias técnicas"/><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Número de licencia profesional" value={draft.licenseNumber} editing={editing} onChange={(value)=>update("licenseNumber",value)}/><Field label="Especialidad principal" value={draft.specialty} editing={editing} onChange={(value)=>update("specialty",value)}/><Field label="Años de experiencia" value={String(draft.experienceYears)} editing={editing} type="number" onChange={(value)=>update("experienceYears",Number(value))}/><Field label="País / Región" value={draft.country} editing={editing} onChange={(value)=>update("country",value)}/><div className="sm:col-span-2"><Field label="Idioma técnico de análisis" value={draft.analysisLanguage} editing={editing} onChange={(value)=>update("analysisLanguage",value)}/></div></div></Panel>
      </div>

      <Panel className="mt-5 p-5 sm:p-6"><SectionTitle title="Actividad reciente" description="Cambios registrados en este prototipo local"/><div className="mt-4 divide-y divide-[#e3e5df]">{profile.recentActivity.map((activity)=><div key={activity.id} className="grid gap-2 py-3 sm:grid-cols-[110px_1fr_auto] sm:items-center"><span className="w-fit rounded-md bg-[#edf0ea] px-2 py-1 font-mono text-[8px] font-semibold uppercase tracking-wider text-[#66736d]">{activityLabels[activity.category]}</span><p className="text-xs text-[#33413b]">{activity.description}</p><time className="text-[10px] text-[#8a948f]">{activity.occurredAt}</time></div>)}</div></Panel>
      <button className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#c3483c]"><LogOut size={14}/> Cerrar sesión de esta cuenta</button>
    </div>
  );
}

function OnlineBadge(){return <span className="inline-flex items-center gap-2 rounded-full border border-[#dce2db] bg-[#fbfbf7] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#2f8f62]"><span className="size-2 rounded-full bg-[#39a76f]"/> Online</span>;}
function SectionTitle({title,description}:{title:string;description:string}){return <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[10px] text-[#849089]">{description}</p></div>;}
function Field({label,value,editing,onChange,type="text"}:{label:string;value:string;editing:boolean;onChange:(value:string)=>void;type?:string}){return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-[#59665f]">{label}</span><input type={type} value={value} readOnly={!editing} onChange={(event)=>onChange(event.target.value)} className={`h-11 w-full rounded-xl border px-3 text-xs outline-none transition ${editing ? "border-[#b9c2b8] bg-white focus:border-[#596151] focus:ring-4 focus:ring-[#596151]/10" : "border-[#e0e3dc] bg-[#f4f6f3] text-[#46534d]"}`}/></label>;}
function ProfileSkeleton(){return <div className="mx-auto max-w-[1460px]"><Skeleton className="h-10 w-52"/><Skeleton className="mt-3 h-4 w-[34rem] max-w-full"/><Skeleton className="mt-8 h-28"/><div className="mt-5 grid gap-5 xl:grid-cols-2"><Skeleton className="h-80"/><Skeleton className="h-80"/></div><Skeleton className="mt-5 h-72"/></div>;}
