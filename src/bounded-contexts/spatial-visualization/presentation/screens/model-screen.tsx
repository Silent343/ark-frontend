"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Activity, BoxSelect, Building2, Check, CircleGauge, Eye, EyeOff, Footprints, Layers3, Moon, Orbit, Palette, Rotate3D, Sun, Sunset } from "lucide-react";
import type { CameraPreset, LightingPreset, MaterialPreset, ModelViewMode } from "@/bounded-contexts/spatial-visualization/presentation/components/building-scene";
import { useProjectWorkspace } from "@/composition/presentation/hooks/use-project-workspace";
import { ErrorState, PageHeader, Panel, Skeleton } from "@/shared/presentation/components/ui";

const BuildingScene = dynamic(() => import("@/bounded-contexts/spatial-visualization/presentation/components/building-scene").then((module)=>module.BuildingScene), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none"/> });

const materials: MaterialPreset[] = ["Concrete","Brick","Wood","Glass"];
const materialLabels: Record<MaterialPreset,string> = { Concrete:"Concreto", Brick:"Ladrillo", Wood:"Madera", Glass:"Vidrio" };
const lightingOptions: {id:LightingPreset;label:string;icon:typeof Sun}[] = [{id:"Day",label:"Día",icon:Sun},{id:"Sunset",label:"Atardecer",icon:Sunset},{id:"Night",label:"Noche",icon:Moon}];
const cameraOptions: {id:CameraPreset;label:string;icon:typeof Orbit}[] = [{id:"Isometric",label:"Isométrica",icon:Orbit},{id:"Top",label:"Superior",icon:BoxSelect},{id:"Walkthrough",label:"Recorrido",icon:Footprints}];

/** Navigable procedural 3D presentation studio. */
export function ModelScreen({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useProjectWorkspace(projectId);
  const [material,setMaterial] = useState<MaterialPreset>("Concrete");
  const [lighting,setLighting] = useState<LightingPreset>("Day");
  const [camera,setCamera] = useState<CameraPreset>("Isometric");
  const [viewMode,setViewMode] = useState<ModelViewMode>("Architecture");
  const [showRoof,setShowRoof] = useState(false);
  const [isolatedLevel,setIsolatedLevel] = useState<number|"All">("All");
  if (loading) return <ModelSkeleton/>;
  if (error || !data) return <ErrorState message={error ?? "No project data was returned."} onRetry={reload}/>;
  const levelCount=Math.max(1,data.blueprint.levels.length);

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader eyebrow={`Modelo 3D · ${data.project.name}`} title="Estudio espacial" description="Navega el modelo generado desde el plano semántico, compara acabados y prepara una presentación arquitectónica." actions={<Link href={`/projects/${projectId}/simulation`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff6a2b] px-4 text-xs font-semibold text-white"><Activity size={15}/> Simular sismo</Link>}/>
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Panel className="overflow-hidden">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#dfe2d9] px-4 py-3"><div className="flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-[#4d9a6a]"/><span className="font-mono text-[10px] font-semibold uppercase tracking-[.14em]">Render en tiempo real</span></div><button onClick={()=>setShowRoof((value)=>!value)} className="inline-flex items-center gap-2 rounded-lg border border-[#dce0d8] bg-white px-2.5 py-1.5 text-[10px] font-semibold">{showRoof ? <Eye size={13}/> : <EyeOff size={13}/>} Techo</button></div>
          <div className="relative h-[66vh] min-h-[560px]"><BuildingScene blueprint={data.blueprint} floors={levelCount} material={material} lighting={lighting} cameraPreset={camera} modelViewMode={viewMode} showRoof={showRoof} isolatedLevel={isolatedLevel}/><div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/40 bg-[#111815]/75 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-white backdrop-blur">{camera === "Walkthrough" ? "Haz clic para entrar · WASD · apunta y haz clic en una puerta · Esc" : "Órbita · rueda para zoom · arrastra para rotar"}</div><div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/40 bg-white/75 px-3 py-2 text-[10px] font-semibold text-[#3f4a44] backdrop-blur">{viewMode === "Structure" ? "Estructura portante · vigas · columnas · nodos" : `${levelCount} ${levelCount===1?"nivel":"niveles"} · ${data.blueprint.rooms.length} ambientes · ${data.blueprint.walls.length} muros`}</div></div>
        </Panel>

        <aside className="space-y-5">
          <Panel className="p-5"><div className="flex items-center gap-2"><Layers3 size={16} className="text-[#65716b]"/><h2 className="text-sm font-semibold">Capa del modelo</h2></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>setViewMode("Architecture")} className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-[10px] font-semibold transition ${viewMode === "Architecture" ? "border-[#596151] bg-[#30382f] text-white" : "border-[#e0e3dc] bg-white text-[#758079]"}`}><Building2 size={17}/> Arquitectura</button><button onClick={()=>setViewMode("Structure")} className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-[10px] font-semibold transition ${viewMode === "Structure" ? "border-[#3268e8] bg-[#0d1830] text-white" : "border-[#e0e3dc] bg-white text-[#758079]"}`}><Layers3 size={17}/> Estructura</button></div><p className="mt-3 text-[9px] leading-4 text-[#849089]">La vista portante aísla columnas, vigas y nodos generados desde la geometría semántica.</p></Panel>
          <Panel className="p-5"><div className="flex items-center gap-2"><Layers3 size={16} className="text-[#65716b]"/><h2 className="text-sm font-semibold">Nivel visible</h2></div><p className="mt-2 text-[9px] leading-4 text-[#849089]">Los niveles provienen del plano semántico, no de pisos inventados por el visor.</p><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>setIsolatedLevel("All")} className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${isolatedLevel==="All"?"border-[#596151] bg-[#30382f] text-white":"border-[#e0e3dc] bg-white text-[#758079]"}`}>Todos</button>{Array.from({length:levelCount},(_,index)=>index+1).map((level)=><button key={level} onClick={()=>setIsolatedLevel(level)} className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${isolatedLevel===level?"border-[#596151] bg-[#30382f] text-white":"border-[#e0e3dc] bg-white text-[#758079]"}`}>Piso {level}</button>)}</div></Panel>
          <Panel className="p-5"><div className="flex items-center gap-2"><Rotate3D size={16} className="text-[#65716b]"/><h2 className="text-sm font-semibold">Cámara</h2></div><div className="mt-4 grid gap-2">{cameraOptions.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setCamera(id)} className={`flex items-center gap-3 rounded-xl border p-3 text-xs font-semibold transition ${camera === id ? "border-[#596151] bg-[#eef0e9] text-[#30382f]" : "border-[#e0e3dc] bg-white text-[#758079] hover:border-[#b8c0b6]"}`}><Icon size={16}/>{label}{camera === id && <Check size={14} className="ml-auto"/>}</button>)}</div></Panel>
          <Panel className="p-5"><div className="flex items-center gap-2"><Palette size={16} className="text-[#65716b]"/><h2 className="text-sm font-semibold">Material principal</h2></div><div className="mt-4 grid grid-cols-2 gap-2">{materials.map((item)=><button key={item} onClick={()=>setMaterial(item)} className={`rounded-xl border p-3 text-left transition ${material === item ? "border-[#596151] bg-[#eef0e9]" : "border-[#e0e3dc] bg-white"}`}><span className={`block size-7 rounded-lg ${item === "Concrete" ? "bg-[#d5d2c9]" : item === "Brick" ? "bg-[#a95e43]" : item === "Wood" ? "bg-[#98704c]" : "bg-[#b8d9dc]"}`}/><span className="mt-2 block text-[10px] font-semibold">{materialLabels[item]}</span></button>)}</div></Panel>
          <Panel className="p-5"><div className="flex items-center gap-2"><CircleGauge size={16} className="text-[#65716b]"/><h2 className="text-sm font-semibold">Ambiente</h2></div><div className="mt-4 flex gap-2">{lightingOptions.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setLighting(id)} className={`flex flex-1 flex-col items-center gap-2 rounded-xl border py-3 text-[9px] font-semibold ${lighting === id ? "border-[#596151] bg-[#30382f] text-white" : "border-[#e0e3dc] bg-white text-[#758079]"}`}><Icon size={15}/>{label}</button>)}</div></Panel>
          <div className="rounded-2xl border border-[#d7dcd3] bg-[#eef0e9] p-4"><div className="flex items-center gap-2"><Layers3 size={14}/><p className="text-[10px] font-semibold">Modelo procedural</p></div><p className="mt-1.5 text-[10px] leading-5 text-[#66736d]">La geometría se reconstruye desde el JSON. IFC, GLB y acabados PBR se incorporarán como adaptadores posteriores.</p></div>
        </aside>
      </div>
    </div>
  );
}

function ModelSkeleton(){return <div className="mx-auto max-w-[1600px]"><Skeleton className="h-10 w-72"/><Skeleton className="mt-3 h-4 w-[36rem] max-w-full"/><div className="mt-8 grid gap-5 xl:grid-cols-[1fr_310px]"><Skeleton className="h-[680px]"/><div className="space-y-5"><Skeleton className="h-64"/><Skeleton className="h-56"/><Skeleton className="h-40"/></div></div></div>;}
