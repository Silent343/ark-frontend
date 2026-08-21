"use client";

import { type ChangeEvent, type DragEvent, type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  FileImage,
  FileText,
  Layers3,
  LoaderCircle,
  MapPin,
  Mountain,
  Ruler,
  ScanLine,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CreateProjectInput } from "@/bounded-contexts/project-management/domain/entities/project";
import { createProjectWorkspace } from "@/composition/application/create-project-workspace";
import { PageHeader, Panel } from "@/shared/presentation/components/ui";

const initialForm: CreateProjectInput = {
  name: "",
  location: "Lima, Perú",
  floors: 1,
  floorHeight: 2.8,
  structureType: "Reinforced concrete",
  soilType: "Dense sand",
};

const analysisSteps = ["Preprocesando el plano", "Detectando muros y aberturas", "Construyendo el modelo semántico"];

/** Guided intake flow for the local AI-analysis prototype. */
export function CreateProjectScreen() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof CreateProjectInput, value: string | number) => setForm((current) => ({ ...current, [field]: value }));
  const selectFile = (selected?: File) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/") && selected.type !== "application/pdf") {
      setError("Selecciona una imagen o un archivo PDF válido.");
      return;
    }
    setError(null);
    setFile(selected);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  };
  const onInputFile = (event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0]);

  const analyze = async () => {
    if (!form.name.trim()) { setError("Escribe un nombre para el proyecto."); return; }
    if (!file) { setError("Sube un plano en formato imagen o PDF."); return; }
    setError(null);
    // TODO(ai-plan-detection): Replace this staged delay with the FastAPI analysis job.
    for (let step = 0; step < analysisSteps.length; step += 1) {
      setAnalysisStep(step);
      await new Promise((resolve) => window.setTimeout(resolve, 720));
    }
    const project = await createProjectWorkspace.execute(form);
    router.push(`/projects/${project.id}/editor`);
  };

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="Nuevo proyecto · Paso 01"
        title="Prepara tu plano"
        description="Define el contexto arquitectónico y carga el archivo fuente. Usaremos un modelo semántico de demostración para esta primera versión."
        actions={<Link href="/" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9ddd4] bg-[#fbfbf7] px-3.5 text-xs font-semibold text-[#56615b]"><ArrowLeft size={15}/> Volver</Link>}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(390px,.72fr)]">
        <Panel className="p-6 sm:p-8">
          <div className="mb-7 flex items-center justify-between">
            <div><p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#8b958f]">Información base</p><h2 className="mt-1 text-lg font-semibold tracking-[-.025em]">Datos del proyecto</h2></div>
            <span className="rounded-full bg-[#e8eae4] px-3 py-1 text-[10px] font-semibold text-[#5d675f]">6 campos</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nombre del proyecto" className="sm:col-span-2">
              <Control icon={Building2}><input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Ej. Casa Barranco" className="project-control project-control--leading"/></Control>
            </Field>
            <Field label="Ubicación" className="sm:col-span-2">
              <Control icon={MapPin}><input value={form.location} onChange={(event) => update("location", event.target.value)} className="project-control project-control--leading"/></Control>
            </Field>
            <Field label="Número de pisos">
              <Control icon={Layers3} trailing={<span className="project-control__suffix">pisos</span>}><input type="number" min="1" max="40" value={form.floors} onChange={(event) => update("floors", Number(event.target.value))} className="project-control project-control--leading project-control--trailing"/></Control>
            </Field>
            <Field label="Altura por piso">
              <Control icon={Ruler} trailing={<span className="project-control__suffix">m</span>}><input type="number" min="2" max="6" step="0.1" value={form.floorHeight} onChange={(event) => update("floorHeight", Number(event.target.value))} className="project-control project-control--leading project-control--trailing"/></Control>
            </Field>
            <Field label="Sistema estructural">
              <Control icon={Building2} trailing={<ChevronDown className="project-control__chevron" size={15}/>}><select value={form.structureType} onChange={(event) => update("structureType", event.target.value)} className="project-control project-control--leading project-control--trailing"><option value="Reinforced concrete">Concreto armado</option><option value="Confined masonry">Albañilería confinada</option><option value="Steel frame">Estructura de acero</option><option value="Dual system">Sistema dual</option></select></Control>
            </Field>
            <Field label="Tipo de suelo">
              <Control icon={Mountain} trailing={<ChevronDown className="project-control__chevron" size={15}/>}><select value={form.soilType} onChange={(event) => update("soilType", event.target.value)} className="project-control project-control--leading project-control--trailing"><option value="Dense sand">Arena densa</option><option value="Stiff soil">Suelo rígido</option><option value="Gravel">Grava</option><option value="Soft clay">Arcilla blanda</option></select></Control>
            </Field>
          </div>

          <div className="mt-8 rounded-2xl border border-[#e3dfd4] bg-[#f8f5ed] p-4">
            <p className="text-xs font-semibold text-[#625b4b]">Datos preparados para interoperabilidad</p>
            <p className="mt-1 text-[11px] leading-5 text-[#837966]">Estos campos conforman la base para futuras integraciones IFC, análisis estructural y georreferenciación.</p>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel className="p-6">
            <div className="mb-5"><p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#8b958f]">Archivo fuente</p><h2 className="mt-1 text-lg font-semibold tracking-[-.025em]">Sube el plano</h2></div>
            {!file ? (
              <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`relative grid min-h-72 place-items-center overflow-hidden rounded-2xl border border-dashed p-6 text-center transition ${dragging ? "border-[#ff6a2b] bg-[#fff5ef]" : "border-[#bfc6ba] bg-[#f6f7f2] hover:border-[#7e897d]"}`}>
                <div className="absolute inset-0 opacity-50 fine-grid"/>
                <div className="relative"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#30382f] text-white shadow-lg"><UploadCloud size={24}/></div><h3 className="mt-4 text-sm font-semibold">Arrastra tu imagen o PDF</h3><p className="mt-2 text-xs leading-5 text-[#7b8680]">PNG, JPG o PDF · Máximo 20 MB</p><label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#d3d8ce] bg-white px-4 py-2.5 text-xs font-semibold shadow-sm"><input type="file" accept="image/*,.pdf" className="sr-only" onChange={onInputFile}/> Explorar archivos</label></div>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border border-[#cfd4ca] bg-[#eef0e9] p-5 fine-grid">
                <button onClick={() => { setFile(null); setAnalysisStep(-1); }} aria-label="Quitar archivo" className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg bg-white text-[#69746e] shadow-sm"><X size={15}/></button>
                <div className="grid min-h-44 place-items-center"><div className="text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-[#596151] shadow-sm">{file.type === "application/pdf" ? <FileText size={26}/> : <FileImage size={26}/>}</div><p className="mt-4 max-w-[260px] truncate text-sm font-semibold">{file.name}</p><p className="mt-1 text-[10px] text-[#808b85]">{(file.size / 1024 / 1024).toFixed(2)} MB · Listo para analizar</p></div></div>
                {analysisStep >= 0 && <div className="absolute inset-x-4 bottom-4 rounded-xl border border-[#d7dbd2] bg-white/95 p-3 shadow-lg backdrop-blur"><div className="flex items-center gap-3"><LoaderCircle size={16} className="animate-spin text-[#ff6a2b]"/><div className="flex-1"><div className="flex justify-between text-[10px] font-semibold"><span>{analysisSteps[analysisStep]}</span><span>{Math.round(((analysisStep+1)/analysisSteps.length)*100)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8eae5]"><div className="h-full rounded-full bg-[#ff6a2b] transition-all duration-500" style={{width:`${((analysisStep+1)/analysisSteps.length)*100}%`}}/></div></div></div></div>}
              </div>
            )}
            {error && <p role="alert" className="mt-3 text-xs font-medium text-[#c44235]">{error}</p>}
            <button onClick={() => void analyze()} disabled={analysisStep >= 0} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#30382f] text-sm font-semibold text-white transition hover:bg-[#202720] disabled:cursor-wait disabled:opacity-60">{analysisStep >= 0 ? <><LoaderCircle size={17} className="animate-spin"/> Analizando plano</> : <><ScanLine size={17}/> Analizar plano con IA <ArrowRight size={16}/></>}</button>
          </Panel>

          <div className="grid grid-cols-3 gap-2">{["Plano", "Modelo", "Edición"].map((label, index) => <div key={label} className={`rounded-xl border px-3 py-3 text-center ${index === 0 ? "border-[#e9c7b6] bg-[#fff5ef] text-[#bc4c1c]" : "border-[#dfe2d9] bg-[#f8f8f4] text-[#919a95]"}`}><div className="mx-auto mb-1.5 grid size-5 place-items-center rounded-full border text-[9px] font-bold">{index === 0 ? <Check size={11}/> : index+1}</div><p className="text-[9px] font-semibold uppercase tracking-wider">{label}</p></div>)}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={className}><span className="mb-2 block text-[11px] font-semibold text-[#59655f]">{label}</span>{children}</label>;
}

function Control({ icon: Icon, children, trailing }: { icon: LucideIcon; children: ReactNode; trailing?: ReactNode }) {
  return <div className="project-control-frame"><Icon className="project-control__icon" size={16} aria-hidden="true"/>{children}{trailing}</div>;
}
