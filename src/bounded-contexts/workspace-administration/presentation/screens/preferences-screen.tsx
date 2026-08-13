"use client";

import { useState } from "react";
import { Check, Database, Download, Gauge, MonitorCog, Save, Settings2, Trash2 } from "lucide-react";
import type { WorkspacePreferences } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";
import { useWorkspacePreferences } from "@/bounded-contexts/workspace-administration/presentation/hooks/use-workspace-administration";
import { workspaceAdministration } from "@/bounded-contexts/workspace-administration/public";
import { ErrorState, PageHeader, Panel, Skeleton } from "@/shared/presentation/components/ui";

/** User preference controls persisted by the workspace administration adapter. */
export function PreferencesScreen() {
  const { data, loading, error, reload } = useWorkspacePreferences();
  if (loading) return <PreferencesSkeleton />;
  if (error || !data) return <ErrorState message={error ?? "No se encontraron las preferencias."} onRetry={reload} />;
  return <PreferencesContent key={`${data.language}-${data.unitSystem}`} initialPreferences={data} />;
}

function PreferencesContent({ initialPreferences }: { initialPreferences: WorkspacePreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [saveState, setSaveState] = useState<"Idle"|"Saving"|"Saved">("Idle");

  const update = <K extends keyof WorkspacePreferences>(field: K, value: WorkspacePreferences[K]) => setPreferences((current) => ({ ...current, [field]: value }));
  const save = async () => {
    setSaveState("Saving");
    await workspaceAdministration.savePreferences.execute(preferences);
    document.documentElement.dataset.theme = preferences.darkMode ? "dark" : "light";
    document.documentElement.dataset.density = preferences.compactDensity ? "compact" : "comfortable";
    setSaveState("Saved");
    window.setTimeout(() => setSaveState("Idle"), 2200);
  };

  const storageRatio = Math.min(preferences.cloudStorageUsedGb / preferences.cloudStorageLimitGb * 100, 100);
  return (
    <div className="mx-auto max-w-[1460px]">
      <PageHeader eyebrow="Configuración del espacio" title="Preferencias" description="Ajusta la interfaz, las notificaciones y los valores predeterminados de análisis." actions={<button onClick={save} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#30382f] px-4 text-xs font-semibold text-white">{saveState === "Saved" ? <Check size={15}/> : <Save size={15}/>} {saveState === "Saving" ? "Guardando..." : saveState === "Saved" ? "Guardado" : "Guardar cambios"}</button>} />

      <div className="mt-6 space-y-5">
        <PreferencePanel icon={Settings2} title="General" description="Idioma, unidades y zona horaria"><div className="grid gap-4 lg:grid-cols-3"><SelectField label="Idioma del sistema" value={preferences.language} onChange={(value)=>update("language",value)} options={["Español (Latinoamérica)","English","Português"]}/><div><Label>Sistema de unidades de cálculo</Label><div className="grid h-11 grid-cols-2 rounded-xl border border-[#dce0d8] bg-white p-1">{(["Metric","Imperial"] as const).map((unit)=><button key={unit} onClick={()=>update("unitSystem",unit)} className={`rounded-lg text-[10px] font-semibold ${preferences.unitSystem === unit ? "bg-[#30382f] text-white" : "text-[#6f7b75]"}`}>{unit === "Metric" ? "Métrico" : "Imperial"}</button>)}</div></div><SelectField label="Zona horaria" value={preferences.timezone} onChange={(value)=>update("timezone",value)} options={["(UTC-05:00) Bogotá, Lima, Quito","(UTC-06:00) Ciudad de México","(UTC-03:00) Buenos Aires"]}/></div></PreferencePanel>

        <PreferencePanel icon={MonitorCog} title="Apariencia" description="Preferencias visuales del entorno de trabajo"><div className="grid gap-4 md:grid-cols-2"><ToggleRow title="Tema oscuro" description="Aplica una paleta oscura a las vistas de trabajo." checked={preferences.darkMode} onChange={(value)=>update("darkMode",value)}/><ToggleRow title="Densidad compacta" description="Reduce espacios para mostrar más información." checked={preferences.compactDensity} onChange={(value)=>update("compactDensity",value)}/></div></PreferencePanel>

        <PreferencePanel icon={Gauge} title="Notificaciones del sistema" description="Eventos que generan avisos dentro del prototipo"><div className="divide-y divide-[#e3e5df]"><ToggleRow title="Notificaciones por correo electrónico" description="Resúmenes semanales de proyectos calculados." checked={preferences.emailNotifications} onChange={(value)=>update("emailNotifications",value)}/><ToggleRow title="Alertas de simulación completada" description="Aviso local cuando termina un análisis visual." checked={preferences.simulationAlerts} onChange={(value)=>update("simulationAlerts",value)}/><ToggleRow title="Actualizaciones de proyectos compartidos" description="Novedades sobre planos compartidos." checked={preferences.sharedProjectUpdates} onChange={(value)=>update("sharedProjectUpdates",value)}/></div></PreferencePanel>

        <PreferencePanel icon={Gauge} title="Análisis y simulación" description="Valores usados al abrir nuevas sesiones"><div className="grid gap-4 lg:grid-cols-3"><SelectField label="Calidad de renderizado 3D" value={preferences.renderQuality} onChange={(value)=>update("renderQuality",value)} options={["Alta (recomendada para GPU)","Equilibrada","Baja (ahorro de energía)"]}/><SelectField label="Norma sísmica predeterminada" value={preferences.seismicStandard} onChange={(value)=>update("seismicStandard",value)} options={["NTE E.030 (Perú)","NEC-SE-DS (Ecuador)","NSR-10 (Colombia)"]}/><ToggleRow title="Autoguardado de simulaciones" description="Conserva resultados referenciales en este navegador." checked={preferences.simulationAutosave} onChange={(value)=>update("simulationAutosave",value)}/></div></PreferencePanel>

        <PreferencePanel icon={Database} title="Almacenamiento y datos" description="Uso simulado del espacio local"><div className="flex flex-col gap-5 lg:flex-row lg:items-end"><div className="flex-1"><div className="flex justify-between text-[10px] font-semibold"><span>Almacenamiento en la nube</span><span className="font-mono text-[#7b8781]">{preferences.cloudStorageUsedGb.toFixed(1)} GB de {preferences.cloudStorageLimitGb} GB</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e3e6df]"><div className="h-full rounded-full bg-[#3268e8]" style={{width:`${storageRatio}%`}}/></div></div><div className="flex flex-wrap gap-2"><button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#b9c1b8] bg-white px-4 text-xs font-semibold"><Download size={14}/> Exportar mis datos</button><button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#efb9b2] bg-[#fff7f5] px-4 text-xs font-semibold text-[#c3483c]"><Trash2 size={14}/> Eliminar cuenta</button></div></div></PreferencePanel>
      </div>
    </div>
  );
}

function PreferencePanel({icon:Icon,title,description,children}:{icon:typeof Settings2;title:string;description:string;children:React.ReactNode}){return <Panel className="p-5 sm:p-6"><div className="mb-5 flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[#edf0ea] text-[#596151]"><Icon size={16}/></div><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[10px] text-[#849089]">{description}</p></div></div>{children}</Panel>;}
function Label({children}:{children:React.ReactNode}){return <span className="mb-1.5 block text-[10px] font-semibold text-[#59665f]">{children}</span>;}
function SelectField({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:string[]}){return <label><Label>{label}</Label><select value={value} onChange={(event)=>onChange(event.target.value)} className="h-11 w-full rounded-xl border border-[#dce0d8] bg-white px-3 text-[11px] text-[#33413b] outline-none focus:border-[#596151]">{options.map((option)=><option key={option}>{option}</option>)}</select></label>;}
function ToggleRow({title,description,checked,onChange}:{title:string;description:string;checked:boolean;onChange:(value:boolean)=>void}){return <div className="flex min-h-16 items-center justify-between gap-4 py-2"><div><p className="text-[11px] font-semibold">{title}</p><p className="mt-1 text-[9px] leading-4 text-[#87918c]">{description}</p></div><button type="button" role="switch" aria-checked={checked} onClick={()=>onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-[#3268e8]" : "bg-[#cbd3dd]"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${checked ? "left-6" : "left-1"}`}/></button></div>;}
function PreferencesSkeleton(){return <div className="mx-auto max-w-[1460px]"><Skeleton className="h-10 w-64"/><Skeleton className="mt-3 h-4 w-[36rem] max-w-full"/><div className="mt-8 space-y-5"><Skeleton className="h-48"/><Skeleton className="h-44"/><Skeleton className="h-64"/><Skeleton className="h-48"/></div></div>;}
