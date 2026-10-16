"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";
import type { Blueprint } from "@/bounded-contexts/plan-digitization/domain/entities/blueprint";
import { roomPath } from "../../domain/room-geometry";

export type EditorTool = "select" | "pan" | "room" | "wall" | "door" | "window" | "column" | "roof" | "service" | "delete";
export type ResizeHandle = "n"|"ne"|"e"|"se"|"s"|"sw"|"w"|"nw"|"start"|"end";

interface BlueprintCanvasProps {
  blueprint: Blueprint;
  tool?: EditorTool;
  selectedId?: string | null;
  overlayOpacity?: number;
  onSelect?: (id: string) => void;
  onCanvasClick?: (x: number, y: number) => void;
  onMove?: (id: string, deltaX: number, deltaY: number) => void;
  onMoveStart?: () => void;
  onResize?: (id:string,handle:ResizeHandle,deltaX:number,deltaY:number)=>void;
  onResizeStart?:()=>void;
  onInteractionEnd?: () => void;
}

/** Semantic SVG plan shared by editor and comparison views. */
export function BlueprintCanvas({ blueprint, tool = "select", selectedId, overlayOpacity = 0, onSelect, onCanvasClick, onMove, onMoveStart, onResize, onResizeStart, onInteractionEnd }: BlueprintCanvasProps) {
  const drag = useRef<{ id: string; x: number; y: number; mode:"move"|"resize"; handle?:ResizeHandle } | null>(null);
  const toPlanPoint = (event: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * blueprint.width, y: ((event.clientY - rect.top) / rect.height) * blueprint.height };
  };
  const handleCanvasClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!onCanvasClick || tool === "select" || tool === "delete") return;
    const rect = event.currentTarget.getBoundingClientRect();
    onCanvasClick(((event.clientX - rect.left) / rect.width) * blueprint.width, ((event.clientY - rect.top) / rect.height) * blueprint.height);
  };
  const select = (event: MouseEvent, id: string) => { if(tool==="pan")return;event.stopPropagation(); onSelect?.(id); };
  const startDrag = (event: PointerEvent<SVGElement>, id: string) => {
    if(tool==="pan")return;
    event.stopPropagation();
    onSelect?.(id);
    if (tool !== "select" || !onMove) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const point = toPlanPoint({ clientX: event.clientX, clientY: event.clientY, currentTarget: svg });
    onMoveStart?.();
    drag.current = { id, ...point, mode:"move" };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const startResize=(event:PointerEvent<SVGElement>,id:string,handle:ResizeHandle)=>{
    event.stopPropagation(); onSelect?.(id); if(tool!=="select"||!onResize)return;
    const svg=event.currentTarget.ownerSVGElement;if(!svg)return;
    const point=toPlanPoint({clientX:event.clientX,clientY:event.clientY,currentTarget:svg});
    onResizeStart?.();drag.current={id,...point,mode:"resize",handle};event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveSelection = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const point = toPlanPoint(event);
    const deltaX=point.x-drag.current.x;const deltaY=point.y-drag.current.y;
    if(drag.current.mode==="move")onMove?.(drag.current.id,deltaX,deltaY);
    else if(drag.current.handle)onResize?.(drag.current.id,drag.current.handle,deltaX,deltaY);
    drag.current = { ...drag.current, ...point };
  };
  const stopDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    onInteractionEnd?.();
  };
  const selectedRoom=blueprint.rooms.find((item)=>item.id===selectedId);
  const selectedRoof=blueprint.roofs?.find((item)=>item.id===selectedId);
  const selectedColumn=blueprint.columns.find((item)=>item.id===selectedId);
  const selectedStair=blueprint.stairs?.find((item)=>item.id===selectedId);
  const selectedWall=blueprint.walls.find((item)=>item.id===selectedId);
  const selectedOpening=[...blueprint.windows,...blueprint.doors].find((item)=>item.id===selectedId);
  const selectedBox=selectedRoom?{x:selectedRoom.x,y:selectedRoom.y,width:selectedRoom.width,height:selectedRoom.height}:selectedRoof?{x:selectedRoof.x,y:selectedRoof.y,width:selectedRoof.width,height:selectedRoof.depth}:selectedColumn?{x:selectedColumn.x-selectedColumn.size/2,y:selectedColumn.y-selectedColumn.size/2,width:selectedColumn.size,height:selectedColumn.size}:selectedStair?.type==="spiral"?{x:selectedStair.x-selectedStair.radius,y:selectedStair.y-selectedStair.radius,width:selectedStair.radius*2,height:selectedStair.radius*2}:null;
  const boxHandles:Array<{handle:ResizeHandle;x:number;y:number;cursor:string}>=selectedBox?[
    {handle:"nw",x:selectedBox.x,y:selectedBox.y,cursor:"nwse-resize"},{handle:"n",x:selectedBox.x+selectedBox.width/2,y:selectedBox.y,cursor:"ns-resize"},{handle:"ne",x:selectedBox.x+selectedBox.width,y:selectedBox.y,cursor:"nesw-resize"},
    {handle:"e",x:selectedBox.x+selectedBox.width,y:selectedBox.y+selectedBox.height/2,cursor:"ew-resize"},{handle:"se",x:selectedBox.x+selectedBox.width,y:selectedBox.y+selectedBox.height,cursor:"nwse-resize"},{handle:"s",x:selectedBox.x+selectedBox.width/2,y:selectedBox.y+selectedBox.height,cursor:"ns-resize"},
    {handle:"sw",x:selectedBox.x,y:selectedBox.y+selectedBox.height,cursor:"nesw-resize"},{handle:"w",x:selectedBox.x,y:selectedBox.y+selectedBox.height/2,cursor:"ew-resize"},
  ]:[];
  const openingGeometry=selectedOpening?(()=>{const angle=selectedOpening.rotation*Math.PI/180;const dx=Math.cos(angle)*selectedOpening.width/2;const dy=Math.sin(angle)*selectedOpening.width/2;return{id:selectedOpening.id,x1:selectedOpening.x-dx,y1:selectedOpening.y-dy,x2:selectedOpening.x+dx,y2:selectedOpening.y+dy};})():null;

  return (
    <svg viewBox={`0 0 ${blueprint.width} ${blueprint.height}`} onClick={handleCanvasClick} onPointerMove={moveSelection} onPointerUp={stopDrag} onPointerCancel={stopDrag} className={`h-full w-full touch-none ${tool === "pan" ? "cursor-grab" : tool !== "select" && tool !== "delete" ? "cursor-crosshair" : "cursor-default"}`} role="img" aria-label="Editable architectural floor plan">
      <defs>
        <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#cdd2ca" strokeWidth=".7" opacity=".5"/></pattern>
        <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#smallGrid)"/><path d="M100 0H0V100" fill="none" stroke="#afb7ad" strokeWidth="1" opacity=".5"/></pattern>
        <filter id="selectionGlow"><feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ff6a2b" floodOpacity=".45"/></filter>
      </defs>
      <rect width={blueprint.width} height={blueprint.height} fill="#f8f8f4"/>
      {blueprint.sourceImage && overlayOpacity > 0 && <image href={blueprint.sourceImage} x={blueprint.sourceOffset?.x ?? 0} y={blueprint.sourceOffset?.y ?? 0} width={blueprint.sourceSize?.width ?? blueprint.width} height={blueprint.sourceSize?.height ?? blueprint.height} preserveAspectRatio="none" opacity={Math.min(.92, overlayOpacity * 2.35)}/>}
      <rect width={blueprint.width} height={blueprint.height} fill="url(#grid)" opacity={blueprint.sourceImage ? .35 : 1}/>

      {/* A source overlay must come from a real imported file, never offset copies of geometry. */}

      <g>
        {blueprint.rooms.map((room)=><g key={room.id} onClick={(event)=>select(event,room.id)} className="cursor-pointer"><path d={roomPath(room)} fillRule="evenodd" fill={selectedId === room.id ? "#fff0e8" : "#d9e8dd"} fillOpacity={blueprint.sourceImage ? .3 : 1} stroke={selectedId === room.id ? "#ff6a2b" : "transparent"} strokeWidth="3"/><text x={room.x+room.width/2} y={room.y+room.height/2-6} textAnchor="middle" fontSize="17" fontWeight="700" fill="#59645e" stroke={blueprint.sourceImage ? "#ffffff" : "none"} strokeWidth={blueprint.sourceImage ? 4 : 0} paintOrder="stroke" letterSpacing="1.4">{room.name.toUpperCase()}</text><text x={room.x+room.width/2} y={room.y+room.height/2+20} textAnchor="middle" fontSize="12" fill="#56635d" stroke={blueprint.sourceImage ? "#ffffff" : "none"} strokeWidth={blueprint.sourceImage ? 3 : 0} paintOrder="stroke">{room.area.toFixed(1)} m²</text></g>)}
      </g>
      <g aria-label="Zonas de cubierta">
        {blueprint.roofs?.map((roof)=><g key={roof.id} onClick={(event)=>select(event,roof.id)} className="cursor-pointer">
          <rect x={roof.x} y={roof.y} width={roof.width} height={roof.depth} fill="#467798" fillOpacity=".12" stroke={selectedId===roof.id?"#ff6a2b":"#467798"} strokeDasharray="9 6" strokeWidth="3"/>
          <text x={roof.x+roof.width/2} y={roof.y+roof.depth/2} textAnchor="middle" fontSize="13" fontWeight="700" fill="#305b72">{roof.name}</text>
        </g>)}
      </g>
      <g aria-label="Puntos de instalaciones">
        {blueprint.routes?.map((route) => {
          const from = blueprint.services?.find((point) => point.id === route.fromId);
          const to = blueprint.services?.find((point) => point.id === route.toId);
          if (!from || !to) return null;
          return <line key={route.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke={route.kind === "plumbing" ? "#1885b5" : "#d59a28"}
            strokeWidth="5" strokeDasharray="11 7" opacity=".85" />;
        })}
        {blueprint.services?.map((point)=><g key={point.id} onClick={(event)=>select(event,point.id)} className="cursor-pointer">
          <circle cx={point.x} cy={point.y} r="12" fill={["water","drain"].includes(point.kind)?"#1885b5":"#d59a28"} stroke={selectedId===point.id?"#ff6a2b":"white"} strokeWidth="3"/>
          <text x={point.x+16} y={point.y+4} fontSize="12" fontWeight="700" fill="#37494f" stroke="white" strokeWidth="3" paintOrder="stroke">{point.name}</text>
        </g>)}
      </g>

      <g strokeLinecap="square">
        {blueprint.walls.map((wall)=><line key={wall.id} x1={wall.start[0]} y1={wall.start[1]} x2={wall.end[0]} y2={wall.end[1]} stroke={selectedId === wall.id ? "#ff6a2b" : blueprint.review && !blueprint.review.reviewedIds.includes(wall.id) ? "#ad701e" : "#303a35"} strokeWidth={wall.thickness} onClick={(event)=>select(event,wall.id)} className="cursor-pointer" filter={selectedId === wall.id ? "url(#selectionGlow)" : undefined}/>) }
      </g>

      <g>
        {blueprint.windows.map((item)=><g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} onClick={(event)=>select(event,item.id)} className="cursor-pointer"><rect x={-item.width/2} y="-9" width={item.width} height="18" fill="#d9edf2" stroke={selectedId === item.id ? "#ff6a2b" : "#357586"} strokeWidth="4"/><line x1={-item.width/2+8} x2={item.width/2-8} stroke="#fff" strokeWidth="3"/></g>)}
        {blueprint.doors.map((item)=><g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} onClick={(event)=>select(event,item.id)} className="cursor-pointer"><path d={`M0 0 L${item.width} 0 A${item.width} ${item.width} 0 0 0 0 ${item.width}`} fill="none" stroke={selectedId === item.id ? "#ff6a2b" : "#7b694e"} strokeWidth="5"/><path d={`M0 0 L0 ${item.width}`} stroke="#f8f8f4" strokeWidth="20"/></g>)}
        {blueprint.columns.map((item)=><rect key={item.id} x={item.x-item.size/2} y={item.y-item.size/2} width={item.size} height={item.size} rx="2" fill={selectedId === item.id ? "#ff6a2b" : "#303a35"} onClick={(event)=>select(event,item.id)} className="cursor-pointer"/>)}
        {blueprint.stairs?.map((stair)=><g key={stair.id} transform={`translate(${stair.x} ${stair.y}) rotate(${stair.type === "straight" ? stair.rotation ?? 0 : 0})`} onClick={(event)=>select(event,stair.id)} className="cursor-pointer">{stair.type === "straight" ? <><rect x={-stair.radius} y={-(stair.length ?? stair.radius*4)/2} width={stair.radius*2} height={stair.length ?? stair.radius*4} fill="#f7f6f0" fillOpacity={blueprint.sourceImage ? .28 : .9} stroke={selectedId === stair.id ? "#ff6a2b" : "#3f4a44"} strokeWidth="4"/>{Array.from({length:12}).map((_,index)=><line key={index} x1={-stair.radius} x2={stair.radius} y1={-(stair.length ?? stair.radius*4)/2+(index+1)*(stair.length ?? stair.radius*4)/13} y2={-(stair.length ?? stair.radius*4)/2+(index+1)*(stair.length ?? stair.radius*4)/13} stroke="#59645e" strokeWidth="2"/>)}</> : <><circle r={stair.radius} fill="#f7f6f0" fillOpacity={blueprint.sourceImage ? .28 : .9} stroke={selectedId === stair.id ? "#ff6a2b" : "#3f4a44"} strokeWidth="4"/>{Array.from({length:14}).map((_,index)=>{const angle=(-Math.PI*.88)+(index/13)*Math.PI*1.72;return <line key={index} x1="0" y1="0" x2={Math.cos(angle)*stair.radius} y2={Math.sin(angle)*stair.radius} stroke="#59645e" strokeWidth="2"/>;})}<circle r="5" fill="#303a35"/></>}</g>)}
      </g>

      <g fill="transparent" stroke="transparent" className={tool === "select" ? "cursor-move" : "cursor-pointer"}>
        {blueprint.rooms.map((room)=><path key={`hit-${room.id}`} d={roomPath(room)} fillRule="evenodd" onPointerDown={(event)=>startDrag(event,room.id)}/>) }
        {blueprint.walls.map((wall)=><line key={`hit-${wall.id}`} x1={wall.start[0]} y1={wall.start[1]} x2={wall.end[0]} y2={wall.end[1]} strokeWidth={Math.max(28,wall.thickness+12)} onPointerDown={(event)=>startDrag(event,wall.id)}/>) }
        {[...blueprint.windows,...blueprint.doors].map((item)=><circle key={`hit-${item.id}`} cx={item.x} cy={item.y} r={Math.max(24,item.width/2)} onPointerDown={(event)=>startDrag(event,item.id)}/>) }
        {blueprint.columns.map((item)=><rect key={`hit-${item.id}`} x={item.x-Math.max(18,item.size/2)} y={item.y-Math.max(18,item.size/2)} width={Math.max(36,item.size)} height={Math.max(36,item.size)} onPointerDown={(event)=>startDrag(event,item.id)}/>) }
        {blueprint.stairs?.map((stair)=>stair.type === "straight" ? <rect key={`hit-${stair.id}`} x={-stair.radius} y={-(stair.length ?? stair.radius*4)/2} width={stair.radius*2} height={stair.length ?? stair.radius*4} transform={`translate(${stair.x} ${stair.y}) rotate(${stair.rotation ?? 0})`} onPointerDown={(event)=>startDrag(event,stair.id)}/> : <circle key={`hit-${stair.id}`} cx={stair.x} cy={stair.y} r={stair.radius} onPointerDown={(event)=>startDrag(event,stair.id)}/>) }
        {blueprint.roofs?.map((roof)=><rect key={`hit-${roof.id}`} x={roof.x+12} y={roof.y+12} width={Math.max(1,roof.width-24)} height={Math.max(1,roof.depth-24)} onPointerDown={(event)=>startDrag(event,roof.id)}/>)}
        {blueprint.services?.map((point)=><circle key={`hit-${point.id}`} cx={point.x} cy={point.y} r="17" onPointerDown={(event)=>startDrag(event,point.id)}/>)}
      </g>

      {tool==="select"&&selectedBox&&<g aria-label="Controles de tamaño del elemento seleccionado">
        <rect x={selectedBox.x} y={selectedBox.y} width={selectedBox.width} height={selectedBox.height} fill="none" stroke="#ff6a2b" strokeWidth="3" strokeDasharray="9 6" vectorEffect="non-scaling-stroke"/>
        {boxHandles.map((item)=><rect key={item.handle} x={item.x-8} y={item.y-8} width="16" height="16" rx="3" fill="#ffffff" stroke="#ff6a2b" strokeWidth="3" vectorEffect="non-scaling-stroke" style={{cursor:item.cursor}} onPointerDown={(event)=>startResize(event,selectedId!,item.handle)}/>) }
      </g>}
      {tool==="select"&&selectedWall&&<g aria-label="Controles de longitud y dirección del muro">
        <line x1={selectedWall.start[0]} y1={selectedWall.start[1]} x2={selectedWall.end[0]} y2={selectedWall.end[1]} stroke="#ff6a2b" strokeWidth="3" strokeDasharray="8 5" vectorEffect="non-scaling-stroke"/>
        <circle cx={selectedWall.start[0]} cy={selectedWall.start[1]} r="10" fill="#fff" stroke="#ff6a2b" strokeWidth="3" vectorEffect="non-scaling-stroke" className="cursor-crosshair" onPointerDown={(event)=>startResize(event,selectedWall.id,"start")}/>
        <circle cx={selectedWall.end[0]} cy={selectedWall.end[1]} r="10" fill="#fff" stroke="#ff6a2b" strokeWidth="3" vectorEffect="non-scaling-stroke" className="cursor-crosshair" onPointerDown={(event)=>startResize(event,selectedWall.id,"end")}/>
      </g>}
      {tool==="select"&&openingGeometry&&<g aria-label="Controles de ancho y dirección de la abertura"><line x1={openingGeometry.x1} y1={openingGeometry.y1} x2={openingGeometry.x2} y2={openingGeometry.y2} stroke="#ff6a2b" strokeWidth="3" strokeDasharray="8 5" vectorEffect="non-scaling-stroke"/><circle cx={openingGeometry.x1} cy={openingGeometry.y1} r="10" fill="#fff" stroke="#ff6a2b" strokeWidth="3" vectorEffect="non-scaling-stroke" className="cursor-crosshair" onPointerDown={(event)=>startResize(event,openingGeometry.id,"start")}/><circle cx={openingGeometry.x2} cy={openingGeometry.y2} r="10" fill="#fff" stroke="#ff6a2b" strokeWidth="3" vectorEffect="non-scaling-stroke" className="cursor-crosshair" onPointerDown={(event)=>startResize(event,openingGeometry.id,"end")}/></g>}

      <g fill="#606b65" fontFamily="monospace" fontSize="11"><text x="32" y="38">N ↑</text><text x={blueprint.width-145} y={blueprint.height-28}>SCALE {blueprint.scale}</text></g>
    </svg>
  );
}
