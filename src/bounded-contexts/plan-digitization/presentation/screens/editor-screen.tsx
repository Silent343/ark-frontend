"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Box, BrickWall, Columns3, DoorOpen, Image as ImageIcon, Layers, MousePointer2, Plus, Ruler, ScanLine, Trash2, Undo2, WandSparkles, X } from "lucide-react";
import type { CanvasAddition, EditorTool } from "@/bounded-contexts/plan-digitization/presentation/components/blueprint-canvas";
import { useProjectWorkspace } from "@/composition/presentation/hooks/use-project-workspace";
import { ErrorState, PageHeader, Panel, Skeleton } from "@/shared/presentation/components/ui";

const BlueprintCanvas = dynamic(() => import("@/bounded-contexts/plan-digitization/presentation/components/blueprint-canvas").then((module)=>module.BlueprintCanvas), { loading: () => <Skeleton className="h-full w-full rounded-none"/> });

const tools: { id: EditorTool; label: string; icon: typeof MousePointer2 }[] = [
  { id: "select", label: "Seleccionar", icon: MousePointer2 },
  { id: "wall", label: "Muro", icon: BrickWall },
  { id: "door", label: "Puerta", icon: DoorOpen },
  { id: "window", label: "Ventana", icon: Columns3 },
  { id: "column", label: "Columna", icon: Plus },
  { id: "delete", label: "Eliminar", icon: Trash2 },
];

/** Interactive semantic-plan correction workspace. */
export function EditorScreen({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useProjectWorkspace(projectId);
  const [tool, setTool] = useState<EditorTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(24);
  const [additions, setAdditions] = useState<CanvasAddition[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const selectedType = useMemo(() => {
    if (!selectedId || !data) return "Ninguno";
    if (selectedId.startsWith("wall")) return "Muro";
    if (selectedId.startsWith("door")) return "Puerta";
    if (selectedId.startsWith("window")) return "Ventana";
    if (selectedId.startsWith("column")) return "Columna";
    if (selectedId.includes("stair")) return "Escalera";
    if (selectedId.startsWith("room")) return "Habitación";
    return additions.find((item)=>item.id === selectedId)?.type ?? "Elemento";
  }, [selectedId, data, additions]);

  if (loading) return <EditorSkeleton/>;
  if (error || !data) return <ErrorState message={error ?? "No project data was returned."} onRetry={reload}/>;

  const addAt = (x: number, y: number) => {
    if (tool === "select" || tool === "delete") return;
    const addition: CanvasAddition = { id: `${tool}-local-${Date.now()}`, type: tool, x, y };
    setAdditions((current)=>[...current,addition]); setSelectedId(addition.id); setTool("select");
  };
  const selectElement = (id: string) => {
    if (tool === "delete") { setRemovedIds((current)=>new Set([...current,id])); setSelectedId(null); setTool("select"); return; }
    setSelectedId(id);
  };
  const undo = () => { const last = additions.at(-1); if (last) { setAdditions((current)=>current.slice(0,-1)); if (selectedId === last.id) setSelectedId(null); } else if (removedIds.size) { const copy = new Set(removedIds); copy.delete([...copy].at(-1)!); setRemovedIds(copy); } };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader eyebrow={`Proyecto · ${data.project.name}`} title="Editor semántico 2D" description="Corrige elementos detectados sobre el plano original y conserva la trazabilidad entre fuente, geometría y modelo." actions={<><button onClick={undo} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9ddd4] bg-[#fbfbf7] px-3.5 text-xs font-semibold"><Undo2 size={14}/> Deshacer</button><Link href={`/projects/${projectId}/model`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ff6a2b] px-4 text-xs font-semibold text-white"><Box size={15}/> Generar modelo 3D</Link></>}/>

      <div className="mt-6 grid gap-5 xl:grid-cols-[76px_minmax(0,1fr)_310px]">
        <Panel className="flex gap-2 overflow-x-auto p-2 xl:flex-col xl:overflow-visible">
          {tools.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setTool(id)} title={label} aria-label={label} className={`group flex min-w-14 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 transition xl:w-full ${tool === id ? "bg-[#30382f] text-white" : "text-[#647069] hover:bg-[#eef0e9]"}`}><Icon size={17}/><span className="text-[8px] font-semibold">{label}</span></button>)}
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#dfe2d9] px-4 py-3"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#5e8f6f]"/><span className="font-mono text-[10px] font-semibold uppercase tracking-[.14em]">Planta baja · Plano interactivo</span></div><div className="flex items-center gap-4"><label className="flex items-center gap-2 text-[10px] text-[#758079]"><ImageIcon size={13}/> Fuente <input aria-label="Original plan opacity" type="range" min="0" max="65" value={overlayOpacity} onChange={(event)=>setOverlayOpacity(Number(event.target.value))} className="w-20 accent-[#596151]"/></label><span className="rounded-lg bg-[#eceee8] px-2 py-1 font-mono text-[9px]">{data.blueprint.scale}</span></div></div>
          <div className={`relative min-h-[620px] overflow-hidden bg-[#f8f8f4] ${data.blueprint.height > data.blueprint.width ? "h-[76vh]" : "aspect-[1.55]"}`}><BlueprintCanvas blueprint={data.blueprint} tool={tool} selectedId={selectedId} additions={additions} removedIds={removedIds} overlayOpacity={overlayOpacity/100} onSelect={selectElement} onCanvasClick={addAt}/>{tool !== "select" && <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-[#111815]/90 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg">{tool === "delete" ? "Selecciona un elemento para eliminar" : `Haz clic para agregar: ${tools.find((item)=>item.id === tool)?.label}`}</div>}</div>
          <div className="flex items-center justify-between border-t border-[#dfe2d9] px-4 py-3"><p className="flex items-center gap-2 text-[10px] text-[#78837d]"><Ruler size={13}/> Área modelada: 89.5 m²</p><p className="font-mono text-[9px] uppercase tracking-wider text-[#87918c]">Grid 20 cm · Snap activo</p></div>
        </Panel>

        <div className="space-y-5">
          <Panel className="p-5"><div className="flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#8a948e]">Inspector</p><h2 className="mt-1 font-semibold">Elemento seleccionado</h2></div><Layers size={17} className="text-[#7c8781]"/></div>{selectedId ? <div className="mt-5"><div className="flex items-center justify-between rounded-xl border border-[#dedfd8] bg-white p-3"><div><span className="rounded-md bg-[#eceee8] px-2 py-1 font-mono text-[8px] font-semibold uppercase">{selectedType}</span><p className="mt-2 font-mono text-[11px] font-semibold text-[#3f4a44]">{selectedId}</p></div><button onClick={()=>setSelectedId(null)} className="grid size-8 place-items-center rounded-lg text-[#89938e] hover:bg-[#f1f2ed]"><X size={15}/></button></div><div className="mt-4 grid grid-cols-2 gap-2">{[{label:"Confianza",value:"96%"},{label:"Nivel",value:"Piso 1"},{label:"Altura",value:"2.80 m"},{label:"Fuente",value:"Detectado"}].map((item)=><div key={item.label} className="rounded-xl bg-[#f0f1ec] p-3"><p className="text-[9px] text-[#87918c]">{item.label}</p><p className="mt-1 text-xs font-semibold">{item.value}</p></div>)}</div><button onClick={()=>{setRemovedIds((current)=>new Set([...current,selectedId]));setSelectedId(null);}} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#efd0cb] bg-[#fff8f6] py-2.5 text-xs font-semibold text-[#b83c31]"><Trash2 size={14}/> Eliminar elemento</button></div> : <div className="grid min-h-44 place-items-center text-center"><div><MousePointer2 className="mx-auto text-[#a0a8a3]"/><p className="mt-3 text-xs text-[#7d8882]">Selecciona una geometría<br/>para ver sus propiedades.</p></div></div>}</Panel>
          <Panel className="p-5"><div className="flex items-center gap-2"><WandSparkles size={16} className="text-[#ff6a2b]"/><h2 className="text-sm font-semibold">Lectura semántica</h2></div><div className="mt-4 space-y-3">{[{label:"Muros",value:data.blueprint.walls.length,color:"bg-[#596151]"},{label:"Aberturas",value:data.blueprint.doors.length+data.blueprint.windows.length,color:"bg-[#578998]"},{label:"Ambientes",value:data.blueprint.rooms.length,color:"bg-[#d18c48]"}].map((item)=><div key={item.label} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-[#65716b]"><span className={`size-2 rounded-full ${item.color}`}/>{item.label}</span><strong>{item.value}</strong></div>)}</div><div className="mt-5 border-t border-[#e2e4de] pt-4"><div className="flex justify-between text-[10px]"><span>Modelo interpretado</span><strong>94%</strong></div><div className="mt-2 h-1.5 rounded-full bg-[#e7e9e3]"><div className="h-full w-[94%] rounded-full bg-[#596151]"/></div></div></Panel>
          <div className="rounded-2xl border border-[#d6e2de] bg-[#eff7f4] p-4"><p className="flex items-start gap-2 text-[10px] leading-5 text-[#537067]"><ScanLine size={14} className="mt-0.5 shrink-0"/><span><strong>Trazabilidad activa.</strong> La capa azul corresponde a la imagen fuente y permite validar cada corrección.</span></p></div>
        </div>
      </div>
    </div>
  );
}

function EditorSkeleton() { return <div className="mx-auto max-w-[1600px]"><Skeleton className="h-10 w-80"/><Skeleton className="mt-3 h-4 w-[38rem] max-w-full"/><div className="mt-8 grid gap-5 xl:grid-cols-[76px_1fr_310px]"><Skeleton className="h-[480px]"/><Skeleton className="h-[650px]"/><div className="space-y-5"><Skeleton className="h-80"/><Skeleton className="h-56"/></div></div></div>; }
