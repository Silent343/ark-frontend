"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Gauge, Pause, Play, RotateCcw, Timer, Waves, Wind } from "lucide-react";
import { BuildingScene } from "@/bounded-contexts/spatial-visualization";
import { calculateVisualResponse } from "@/bounded-contexts/seismic-simulation/application/use-cases/calculate-visual-response";
import { useProjectWorkspace } from "@/composition/presentation/hooks/use-project-workspace";
import { ErrorState, PageHeader, Panel, Skeleton } from "@/shared/presentation/components/ui";

/** Educational seismic-response visualization with bounded, non-safety language. */
export function SimulationScreen({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useProjectWorkspace(projectId);
  const [intensity,setIntensity] = useState(5);
  const [duration,setDuration] = useState(12);
  const [direction,setDirection] = useState<"X"|"Y">("X");
  const [running,setRunning] = useState(false);
  const [elapsed,setElapsed] = useState(0);

  useEffect(()=>{
    if (!running) return;
    const startedAt = performance.now()-elapsed*1000;
    const interval = window.setInterval(()=>{
      const next = (performance.now()-startedAt)/1000;
      if (next >= duration) { setElapsed(duration); setRunning(false); window.clearInterval(interval); }
      else setElapsed(next);
    },80);
    return ()=>window.clearInterval(interval);
  },[running,duration,elapsed]);

  const metrics = calculateVisualResponse.execute({ intensity, durationSeconds: duration, direction }, elapsed / duration);
  const responseLevel = metrics.level;
  const response = responseLevel === "Low" ? {label:"Baja",color:"#2f8f62",bg:"#e5f4eb"} : responseLevel === "Moderate" ? {label:"Moderada",color:"#b47720",bg:"#fff1d8"} : {label:"Alta",color:"#c3483c",bg:"#fbe7e3"};
  const displacement = metrics.displacementMillimeters.toFixed(1);
  const drift = metrics.interstoryDrift.toFixed(4);
  const points = useMemo(()=>Array.from({length:96},(_,index)=>{const x=index/95*600;const activeRatio=Math.min(elapsed/duration,1);const envelope=Math.exp(-index/155);const wave=Math.sin(index*.48+elapsed*7)*intensity*3.4*envelope*activeRatio;return `${x},${85-wave}`;}).join(" "),[elapsed,duration,intensity]);
  if (loading) return <SimulationSkeleton/>;
  if (error || !data) return <ErrorState message={error ?? "No project data was returned."} onRetry={reload}/>;

  const reset = () => { setRunning(false); setElapsed(0); };
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader eyebrow={`Simulación · ${data.project.name}`} title="Respuesta sísmica visual" description="Explora cómo varían el movimiento lateral y los indicadores referenciales al ajustar parámetros de excitación." actions={<Link href={`/projects/${projectId}/model`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9ddd4] bg-[#fbfbf7] px-3.5 text-xs font-semibold"><ArrowLeft size={14}/> Volver al modelo</Link>}/>

      <div className="mt-6 rounded-2xl border border-[#efc7bf] bg-[#fff4f1] p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-[#c3483c]" size={17}/><div><p className="text-xs font-semibold text-[#8f332b]">Aviso de alcance</p><p className="mt-1 text-[11px] leading-5 text-[#9e5a53]">Simulación referencial y educativa. No sustituye un análisis estructural ni la evaluación de un ingeniero civil colegiado.</p></div></div></div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <Panel className="p-5"><div className="flex items-center gap-2"><Waves size={16} className="text-[#5f6b65]"/><h2 className="text-sm font-semibold">Parámetros de entrada</h2></div><div className="mt-6 space-y-6"><Control label="Intensidad" value={`${intensity}/10`}><input type="range" min="1" max="10" value={intensity} onChange={(event)=>setIntensity(Number(event.target.value))} disabled={running} className="w-full accent-[#ff6a2b]"/></Control><Control label="Duración" value={`${duration} s`}><input type="range" min="4" max="30" value={duration} onChange={(event)=>{setDuration(Number(event.target.value));setElapsed(0);}} disabled={running} className="w-full accent-[#596151]"/></Control><div><div className="mb-2.5 flex items-center justify-between"><span className="text-[11px] font-semibold text-[#5d6963]">Dirección</span><span className="font-mono text-[10px] text-[#87918c]">Eje {direction}</span></div><div className="grid grid-cols-2 gap-2">{(["X","Y"] as const).map((axis)=><button key={axis} onClick={()=>setDirection(axis)} disabled={running} className={`rounded-xl border py-2.5 text-xs font-semibold ${direction === axis ? "border-[#596151] bg-[#30382f] text-white" : "border-[#dfe2d9] bg-white text-[#748079]"}`}>Dirección {axis}</button>)}</div></div></div><button onClick={()=>setRunning((value)=>!value)} className={`mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition ${running ? "bg-[#8f5e28]" : "bg-[#ff6a2b] hover:bg-[#ea5b20]"}`}>{running ? <><Pause size={17}/> Pausar simulación</> : <><Play size={17}/> {elapsed > 0 && elapsed < duration ? "Continuar" : "Iniciar simulación"}</>}</button><button onClick={reset} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#dce0d8] bg-white text-xs font-semibold text-[#65716b]"><RotateCcw size={14}/> Restablecer</button></Panel>

          <Panel className="p-5"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-[#8b958f]">Estado de ejecución</p><div className="mt-4 flex items-end justify-between"><div><p className="text-2xl font-semibold tracking-[-.04em]">{elapsed.toFixed(1)}<span className="ml-1 text-xs font-normal text-[#89938e]">s</span></p><p className="mt-1 text-[10px] text-[#7d8882]">de {duration} segundos</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${running ? "bg-[#e2f2e9] text-[#27704d]" : "bg-[#eceee8] text-[#647069]"}`}>{running ? "En curso" : elapsed === duration ? "Finalizada" : "En espera"}</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e6e8e2]"><div className="h-full rounded-full bg-[#ff6a2b] transition-all" style={{width:`${elapsed/duration*100}%`}}/></div></Panel>
        </aside>

        <section className="space-y-5">
          <Panel className="overflow-hidden"><div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#dfe2d9] px-4 py-3"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${running ? "animate-pulse bg-[#ff6a2b]" : "bg-[#8d9791]"}`}/><span className="font-mono text-[10px] font-semibold uppercase tracking-[.14em]">Respuesta del modelo · Eje {direction}</span></div><span className="rounded-lg px-2.5 py-1 text-[9px] font-semibold" style={{color:response.color,background:response.bg}}>Respuesta {response.label.toLowerCase()}</span></div><div className="relative h-[52vh] min-h-[430px]"><BuildingScene blueprint={data.blueprint} floors={data.project.floors} material="Concrete" lighting="Day" cameraPreset="Isometric" showRoof simulation={{active:running,intensity,direction}}/><div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/40 bg-[#111815]/75 px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-white backdrop-blur">Movimiento amplificado para visualización</div></div></Panel>

          <div className="grid gap-4 sm:grid-cols-3"><Metric icon={Wind} label="Desplazamiento máximo" value={`${displacement} mm`} color={response.color}/><Metric icon={Gauge} label="Deriva por piso" value={drift} color={response.color}/><Metric icon={Waves} label="Nivel de respuesta" value={response.label} color={response.color}/></div>

          <Panel className="p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Historial de desplazamiento</h2><p className="mt-1 text-[10px] text-[#7f8a84]">Señal sintética para presentación visual</p></div><Timer size={16} className="text-[#7a8680]"/></div><div className="mt-4 overflow-hidden rounded-xl border border-[#e0e3dc] bg-[#f7f7f3] fine-grid"><svg viewBox="0 0 600 170" className="h-44 w-full"><line x1="0" y1="85" x2="600" y2="85" stroke="#aeb6af" strokeDasharray="4 6"/><polyline points={points} fill="none" stroke={response.color} strokeWidth="3" vectorEffect="non-scaling-stroke"/><path d={`M${elapsed/duration*600} 0V170`} stroke="#ff6a2b" strokeWidth="1.5" opacity=".7"/></svg></div><div className="mt-2 flex justify-between font-mono text-[8px] text-[#949d98]"><span>0 s</span><span>{Math.round(duration/2)} s</span><span>{duration} s</span></div></Panel>
        </section>
      </div>
    </div>
  );
}

function Control({label,value,children}:{label:string;value:string;children:React.ReactNode}){return <label><div className="mb-2.5 flex items-center justify-between"><span className="text-[11px] font-semibold text-[#5d6963]">{label}</span><span className="rounded-md bg-[#eceee8] px-2 py-1 font-mono text-[9px] font-semibold">{value}</span></div>{children}</label>;}
function Metric({icon:Icon,label,value,color}:{icon:typeof Gauge;label:string;value:string;color:string}){return <Panel className="p-4"><div className="flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-[#eceee8]"><Icon size={16}/></div><span className="size-2 rounded-full" style={{background:color}}/></div><p className="mt-4 text-xl font-semibold tracking-[-.03em]">{value}</p><p className="mt-1 text-[10px] text-[#7d8882]">{label}</p></Panel>;}
function SimulationSkeleton(){return <div className="mx-auto max-w-[1600px]"><Skeleton className="h-10 w-96 max-w-full"/><Skeleton className="mt-3 h-4 w-[38rem] max-w-full"/><Skeleton className="mt-8 h-20"/><div className="mt-5 grid gap-5 xl:grid-cols-[320px_1fr]"><Skeleton className="h-[560px]"/><div className="space-y-5"><Skeleton className="h-[520px]"/><div className="grid grid-cols-3 gap-4"><Skeleton className="h-36"/><Skeleton className="h-36"/><Skeleton className="h-36"/></div></div></div></div>;}
