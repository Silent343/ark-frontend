"use client";

import type { MouseEvent } from "react";
import type { Blueprint } from "@/bounded-contexts/plan-digitization/domain/entities/blueprint";

export type EditorTool = "select" | "wall" | "door" | "window" | "column" | "delete";
export interface CanvasAddition { id: string; type: Exclude<EditorTool, "select" | "delete">; x: number; y: number; }

interface BlueprintCanvasProps {
  blueprint: Blueprint;
  tool?: EditorTool;
  selectedId?: string | null;
  additions?: CanvasAddition[];
  removedIds?: Set<string>;
  overlayOpacity?: number;
  onSelect?: (id: string) => void;
  onCanvasClick?: (x: number, y: number) => void;
}

/** Semantic SVG plan shared by editor and comparison views. */
export function BlueprintCanvas({ blueprint, tool = "select", selectedId, additions = [], removedIds = new Set(), overlayOpacity = 0, onSelect, onCanvasClick }: BlueprintCanvasProps) {
  const handleCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!onCanvasClick || tool === "select" || tool === "delete") return;
    const rect = event.currentTarget.getBoundingClientRect();
    onCanvasClick(((event.clientX - rect.left) / rect.width) * blueprint.width, ((event.clientY - rect.top) / rect.height) * blueprint.height);
  };
  const select = (event: MouseEvent, id: string) => { event.stopPropagation(); onSelect?.(id); };

  return (
    <svg viewBox={`0 0 ${blueprint.width} ${blueprint.height}`} onClick={handleCanvasClick} className={`h-full w-full ${tool !== "select" && tool !== "delete" ? "cursor-crosshair" : "cursor-default"}`} role="img" aria-label="Editable architectural floor plan">
      <defs>
        <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#cdd2ca" strokeWidth=".7" opacity=".5"/></pattern>
        <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#smallGrid)"/><path d="M100 0H0V100" fill="none" stroke="#afb7ad" strokeWidth="1" opacity=".5"/></pattern>
        <filter id="selectionGlow"><feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ff6a2b" floodOpacity=".45"/></filter>
      </defs>
      <rect width={blueprint.width} height={blueprint.height} fill="#f8f8f4"/>
      {blueprint.sourceImage && overlayOpacity > 0 && <image href={blueprint.sourceImage} x="0" y="0" width={blueprint.width} height={blueprint.height} preserveAspectRatio="none" opacity={Math.min(.92, overlayOpacity * 2.35)}/>} 
      <rect width={blueprint.width} height={blueprint.height} fill="url(#grid)" opacity={blueprint.sourceImage ? .35 : 1}/>

      {!blueprint.sourceImage && overlayOpacity > 0 && <g opacity={overlayOpacity} transform="translate(7 4)" stroke="#648aa1" fill="none" strokeDasharray="8 5">
        {blueprint.walls.map((wall)=><line key={`source-${wall.id}`} x1={wall.start[0]} y1={wall.start[1]} x2={wall.end[0]} y2={wall.end[1]} strokeWidth={wall.thickness + 4}/>)}</g>}

      <g>
        {blueprint.rooms.map((room)=><g key={room.id} onClick={(event)=>select(event,room.id)} className="cursor-pointer"><rect x={room.x+9} y={room.y+9} width={room.width-18} height={room.height-18} fill={selectedId === room.id ? "#fff0e8" : "#f3f4ee"} fillOpacity={blueprint.sourceImage ? .16 : 1} stroke={selectedId === room.id ? "#ff6a2b" : "transparent"} strokeWidth="3"/><text x={room.x+room.width/2} y={room.y+room.height/2-6} textAnchor="middle" fontSize="17" fontWeight="700" fill="#59645e" stroke={blueprint.sourceImage ? "#ffffff" : "none"} strokeWidth={blueprint.sourceImage ? 4 : 0} paintOrder="stroke" letterSpacing="1.4">{room.name.toUpperCase()}</text><text x={room.x+room.width/2} y={room.y+room.height/2+20} textAnchor="middle" fontSize="12" fill="#56635d" stroke={blueprint.sourceImage ? "#ffffff" : "none"} strokeWidth={blueprint.sourceImage ? 3 : 0} paintOrder="stroke">{room.area} m²</text></g>)}
      </g>

      <g strokeLinecap="square">
        {blueprint.walls.filter((wall)=>!removedIds.has(wall.id)).map((wall)=><line key={wall.id} x1={wall.start[0]} y1={wall.start[1]} x2={wall.end[0]} y2={wall.end[1]} stroke={selectedId === wall.id ? "#ff6a2b" : "#303a35"} strokeWidth={wall.thickness} onClick={(event)=>select(event,wall.id)} className="cursor-pointer" filter={selectedId === wall.id ? "url(#selectionGlow)" : undefined}/>) }
      </g>

      <g>
        {blueprint.windows.filter((item)=>!removedIds.has(item.id)).map((item)=><g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} onClick={(event)=>select(event,item.id)} className="cursor-pointer"><rect x={-item.width/2} y="-9" width={item.width} height="18" fill="#d9edf2" stroke={selectedId === item.id ? "#ff6a2b" : "#357586"} strokeWidth="4"/><line x1={-item.width/2+8} x2={item.width/2-8} stroke="#fff" strokeWidth="3"/></g>)}
        {blueprint.doors.filter((item)=>!removedIds.has(item.id)).map((item)=><g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} onClick={(event)=>select(event,item.id)} className="cursor-pointer"><path d={`M0 0 L${item.width} 0 A${item.width} ${item.width} 0 0 0 0 ${item.width}`} fill="none" stroke={selectedId === item.id ? "#ff6a2b" : "#7b694e"} strokeWidth="5"/><path d={`M0 0 L0 ${item.width}`} stroke="#f8f8f4" strokeWidth="20"/></g>)}
        {blueprint.columns.filter((item)=>!removedIds.has(item.id)).map((item)=><rect key={item.id} x={item.x-item.size/2} y={item.y-item.size/2} width={item.size} height={item.size} rx="2" fill={selectedId === item.id ? "#ff6a2b" : "#303a35"} onClick={(event)=>select(event,item.id)} className="cursor-pointer"/>)}
        {blueprint.stairs?.map((stair)=><g key={stair.id} transform={`translate(${stair.x} ${stair.y})`} onClick={(event)=>select(event,stair.id)} className="cursor-pointer"><circle r={stair.radius} fill="#f7f6f0" fillOpacity={blueprint.sourceImage ? .28 : .9} stroke={selectedId === stair.id ? "#ff6a2b" : "#3f4a44"} strokeWidth="4"/>{Array.from({length:14}).map((_,index)=>{const angle=(-Math.PI*.88)+(index/13)*Math.PI*1.72;return <line key={index} x1="0" y1="0" x2={Math.cos(angle)*stair.radius} y2={Math.sin(angle)*stair.radius} stroke="#59645e" strokeWidth="2"/>;})}<circle r="5" fill="#303a35"/></g>)}
      </g>

      <g>
        {additions.filter((item)=>!removedIds.has(item.id)).map((item)=> item.type === "wall" ? <line key={item.id} x1={item.x-70} x2={item.x+70} y1={item.y} y2={item.y} stroke={selectedId === item.id ? "#ff6a2b" : "#303a35"} strokeWidth="14" onClick={(event)=>select(event,item.id)}/> : item.type === "column" ? <rect key={item.id} x={item.x-14} y={item.y-14} width="28" height="28" fill={selectedId === item.id ? "#ff6a2b" : "#303a35"} onClick={(event)=>select(event,item.id)}/> : <g key={item.id} onClick={(event)=>select(event,item.id)}><circle cx={item.x} cy={item.y} r="22" fill={item.type === "window" ? "#d9edf2" : "#f4e6cf"} stroke={selectedId === item.id ? "#ff6a2b" : "#596151"} strokeWidth="4"/><text x={item.x} y={item.y+5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#303a35">{item.type === "door" ? "D" : "W"}</text></g>)}
      </g>

      <g fill="#606b65" fontFamily="monospace" fontSize="11"><text x="32" y="38">N ↑</text><text x={blueprint.width-145} y={blueprint.height-28}>SCALE {blueprint.scale}</text></g>
    </svg>
  );
}
