"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Database, Download, Gauge, MonitorCog, RotateCcw, Save, Settings2, Trash2 } from "lucide-react";
import type { WorkspacePreferences } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";
import { useWorkspacePreferences } from "@/bounded-contexts/workspace-administration/presentation/hooks/use-workspace-administration";
import { workspaceAdministration } from "@/bounded-contexts/workspace-administration/public";
import { applyWorkspacePreferences } from "@/bounded-contexts/workspace-administration/presentation/lib/apply-workspace-preferences";
import { ErrorState, PageHeader, Panel, Skeleton } from "@/shared/presentation/components/ui";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

/** User preference controls persisted by the workspace administration adapter. */
export function PreferencesScreen() {
  const { data, loading, error, reload } = useWorkspacePreferences();
  if (loading) return <PreferencesSkeleton />;
  if (error || !data) return <ErrorState message={error ?? "No se encontraron las preferencias."} onRetry={reload} />;
  return <PreferencesContent key={`${data.language}-${data.unitSystem}`} initialPreferences={data} />;
}

function PreferencesContent({ initialPreferences }: { initialPreferences: WorkspacePreferences }) {
  const {t}=useI18n();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [saveState, setSaveState] = useState<"Idle"|"Saving"|"Saved">("Idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const initialized = useRef(false);

  const persist = useCallback(async (next: WorkspacePreferences, message = t("preferences.applied","Preferencias aplicadas y guardadas en este navegador.")) => {
    setSaveState("Saving");
    await workspaceAdministration.savePreferences.execute(next);
    applyWorkspacePreferences(next);
    setSaveState("Saved");
    setFeedback(message);
    window.setTimeout(() => setSaveState("Idle"), 2200);
  },[t]);
  const persistRef = useRef(persist);

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  const update = <K extends keyof WorkspacePreferences>(field: K, value: WorkspacePreferences[K]) => {
    const next = { ...preferences, [field]: value };
    setPreferences(next);
    applyWorkspacePreferences(next);
  };

  useEffect(() => {
    if (!initialized.current) { initialized.current = true; return; }
    const timer = window.setTimeout(() => { void persistRef.current(preferences); }, 280);
    return () => window.clearTimeout(timer);
  }, [preferences]);

  const save = () => void persist(preferences);
  const resetPreferences = async () => {
    setSaveState("Saving");
    const defaults = await workspaceAdministration.resetPreferences.execute();
    setPreferences(defaults);
    applyWorkspacePreferences(defaults);
    setSaveState("Saved");
    setFeedback("Preferencias restablecidas a los valores predeterminados.");
  };
  const exportData = () => {
    const file = new Blob([JSON.stringify({ exportedAt:new Date().toISOString(),preferences },null,2)],{type:"application/json"});
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href=url; anchor.download="teluria-preferences.json"; anchor.click();
    URL.revokeObjectURL(url);
    setFeedback("Archivo de preferencias exportado.");
  };

  const storageRatio = Math.min(preferences.cloudStorageUsedGb / preferences.cloudStorageLimitGb * 100, 100);
  return (
    <div className="mx-auto max-w-[1460px]">
      <PageHeader eyebrow={t("preferences.eyebrow","Configuración del espacio")} title={t("preferences.title","Preferencias")} description={t("preferences.description","Ajusta la interfaz, las notificaciones y los valores predeterminados de análisis. Los cambios se guardan automáticamente.")} actions={<><button onClick={resetPreferences} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9ddd4] bg-white px-4 text-xs font-semibold"><RotateCcw size={14}/> {t("preferences.reset","Restablecer")}</button><button onClick={save} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#30382f] px-4 text-xs font-semibold text-white">{saveState === "Saved" ? <Check size={15}/> : <Save size={15}/>} {saveState === "Saving" ? t("preferences.saving","Guardando...") : saveState === "Saved" ? t("preferences.saved","Guardado") : t("preferences.save","Guardar ahora")}</button></>} />

      {feedback && <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#b9dec8] bg-[#edf8f1] px-4 py-3 text-xs font-semibold text-[#28704c]"><Check size={15}/><span className="flex-1">{feedback}</span><button aria-label="Cerrar confirmación" onClick={()=>setFeedback(null)} className="rounded-lg px-2 py-1 text-[#28704c]/70">×</button></div>}

      <div className="mt-6 space-y-5">
        <PreferencePanel icon={Settings2} title={t("preferences.general","General")} description={t("preferences.generalDescription","Idioma, unidades y zona horaria")}><div className="grid gap-4 lg:grid-cols-3"><SelectField label={t("preferences.language","Idioma del sistema")} value={preferences.language} onChange={(value)=>update("language",value)} options={[{value:"Español (Latinoamérica)",label:t("language.es","Español (Latinoamérica)")},{value:"English",label:t("language.en","English")},{value:"Português",label:t("language.pt","Português")}]}/><div><Label>{t("preferences.units","Sistema de unidades de cálculo")}</Label><div className="grid h-11 grid-cols-2 rounded-xl border border-[#dce0d8] bg-white p-1">{(["Metric","Imperial"] as const).map((unit)=><button key={unit} onClick={()=>update("unitSystem",unit)} className={`rounded-lg text-[10px] font-semibold ${preferences.unitSystem === unit ? "bg-[#30382f] text-white" : "text-[#6f7b75]"}`}>{unit === "Metric" ? t("preferences.metric","Métrico") : t("preferences.imperial","Imperial")}</button>)}</div></div><SelectField label={t("preferences.timezone","Zona horaria")} value={preferences.timezone} onChange={(value)=>update("timezone",value)} options={["(UTC-05:00) Bogotá, Lima, Quito","(UTC-06:00) Ciudad de México","(UTC-03:00) Buenos Aires"]}/></div></PreferencePanel>

        <PreferencePanel icon={MonitorCog} title={t("preferences.appearance","Apariencia")} description={t("preferences.appearanceDescription","Preferencias visuales del entorno de trabajo")}><div className="grid gap-4 md:grid-cols-2"><ToggleRow title={t("preferences.darkMode","Tema oscuro")} description={t("preferences.darkModeDescription","Aplica una paleta oscura a las vistas de trabajo.")} checked={preferences.darkMode} onChange={(value)=>update("darkMode",value)}/><ToggleRow title={t("preferences.compact","Densidad compacta")} description={t("preferences.compactDescription","Reduce espacios para mostrar más información.")} checked={preferences.compactDensity} onChange={(value)=>update("compactDensity",value)}/></div></PreferencePanel>

        <PreferencePanel icon={Gauge} title={t("preferences.notifications","Notificaciones del sistema")} description={t("preferences.notificationsDescription","Eventos que generan avisos dentro del prototipo")}><div className="divide-y divide-[#e3e5df]"><ToggleRow title={t("preferences.email","Notificaciones por correo electrónico")} description={t("preferences.emailDescription","Resúmenes semanales de proyectos calculados.")} checked={preferences.emailNotifications} onChange={(value)=>update("emailNotifications",value)}/><ToggleRow title={t("preferences.simulationAlerts","Alertas de simulación completada")} description={t("preferences.simulationAlertsDescription","Aviso local cuando termina un análisis visual.")} checked={preferences.simulationAlerts} onChange={(value)=>update("simulationAlerts",value)}/><ToggleRow title={t("preferences.sharedUpdates","Actualizaciones de proyectos compartidos")} description={t("preferences.sharedUpdatesDescription","Novedades sobre planos compartidos.")} checked={preferences.sharedProjectUpdates} onChange={(value)=>update("sharedProjectUpdates",value)}/></div></PreferencePanel>

        <PreferencePanel icon={Gauge} title={t("preferences.analysis","Análisis y simulación")} description={t("preferences.analysisDescription","Valores usados al abrir nuevas sesiones")}><div className="grid gap-4 lg:grid-cols-3"><SelectField label={t("preferences.renderQuality","Calidad de renderizado 3D")} value={preferences.renderQuality} onChange={(value)=>update("renderQuality",value)} options={["Alta (recomendada para GPU)","Equilibrada","Baja (ahorro de energía)"]}/><SelectField label={t("preferences.seismicStandard","Norma sísmica predeterminada")} value={preferences.seismicStandard} onChange={(value)=>update("seismicStandard",value)} options={["NTE E.030 (Perú)","NEC-SE-DS (Ecuador)","NSR-10 (Colombia)"]}/><ToggleRow title={t("preferences.autosave","Autoguardado de simulaciones")} description={t("preferences.autosaveDescription","Conserva resultados referenciales en este navegador.")} checked={preferences.simulationAutosave} onChange={(value)=>update("simulationAutosave",value)}/></div></PreferencePanel>

        <PreferencePanel icon={Database} title={t("preferences.storage","Almacenamiento y datos")} description={t("preferences.storageDescription","Uso simulado del espacio local")}><div className="flex flex-col gap-5 lg:flex-row lg:items-end"><div className="flex-1"><div className="flex justify-between text-[10px] font-semibold"><span>{t("preferences.cloudStorage","Almacenamiento en la nube")}</span><span className="font-mono text-[#7b8781]">{preferences.cloudStorageUsedGb.toFixed(1)} GB de {preferences.cloudStorageLimitGb} GB</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e3e6df]"><div className="h-full rounded-full bg-[#3268e8]" style={{width:`${storageRatio}%`}}/></div></div><div className="flex flex-wrap gap-2"><button onClick={exportData} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#b9c1b8] bg-white px-4 text-xs font-semibold"><Download size={14}/> {t("preferences.export","Exportar mis datos")}</button><button onClick={()=>setFeedback("La eliminación de cuenta requiere un backend y confirmación de identidad; no se ejecutó ninguna acción.")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#efb9b2] bg-[#fff7f5] px-4 text-xs font-semibold text-[#c3483c]"><Trash2 size={14}/> {t("preferences.deleteAccount","Eliminar cuenta")}</button></div></div></PreferencePanel>
      </div>
    </div>
  );
}

function PreferencePanel({icon:Icon,title,description,children}:{icon:typeof Settings2;title:string;description:string;children:React.ReactNode}){return <Panel className="p-5 sm:p-6"><div className="mb-5 flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[#edf0ea] text-[#596151]"><Icon size={16}/></div><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-[10px] text-[#849089]">{description}</p></div></div>{children}</Panel>;}
function Label({children}:{children:React.ReactNode}){return <span className="mb-1.5 block text-[10px] font-semibold text-[#59665f]">{children}</span>;}
function SelectField({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:Array<string|{value:string;label:string}>}){return <label><Label>{label}</Label><select value={value} onChange={(event)=>onChange(event.target.value)} className="h-11 w-full rounded-xl border border-[#dce0d8] bg-white px-3 text-[11px] text-[#33413b] outline-none focus:border-[#596151]">{options.map((option)=>{const value=typeof option==="string"?option:option.value;const label=typeof option==="string"?option:option.label;return <option key={value} value={value}>{label}</option>;})}</select></label>;}
function ToggleRow({title,description,checked,onChange}:{title:string;description:string;checked:boolean;onChange:(value:boolean)=>void}){return <div className="flex min-h-16 items-center justify-between gap-4 py-2"><div><p className="text-[11px] font-semibold">{title}</p><p className="mt-1 text-[9px] leading-4 text-[#87918c]">{description}</p></div><button type="button" role="switch" aria-label={title} aria-checked={checked} onClick={()=>onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3268e8] ${checked ? "bg-[#3268e8]" : "bg-[#cbd3dd]"}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${checked ? "left-6" : "left-1"}`}/></button></div>;}
function PreferencesSkeleton(){return <div className="mx-auto max-w-[1460px]"><Skeleton className="h-10 w-64"/><Skeleton className="mt-3 h-4 w-[36rem] max-w-full"/><div className="mt-8 space-y-5"><Skeleton className="h-48"/><Skeleton className="h-44"/><Skeleton className="h-64"/><Skeleton className="h-48"/></div></div>;}
