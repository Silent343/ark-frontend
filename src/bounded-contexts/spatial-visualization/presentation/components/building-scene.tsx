"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls, PerspectiveCamera, PointerLockControls, Sky } from "@react-three/drei";
import { MathUtils, Vector3, type Group, type MeshStandardMaterialParameters } from "three";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import { buildSceneModel } from "@/bounded-contexts/spatial-visualization/application/use-cases/build-scene-model";
import type { CameraPreset, LightingPreset, MaterialPreset, ModelViewMode } from "@/bounded-contexts/spatial-visualization/domain/value-objects/scene-preferences";

export type { CameraPreset, LightingPreset, MaterialPreset, ModelViewMode } from "@/bounded-contexts/spatial-visualization/domain/value-objects/scene-preferences";

interface BuildingSceneProps {
  blueprint: Blueprint;
  floors: number;
  material: MaterialPreset;
  lighting: LightingPreset;
  cameraPreset: CameraPreset;
  modelViewMode?: ModelViewMode;
  showRoof: boolean;
  isolatedLevel?: number | "All";
  simulation?: { active: boolean; intensity: number; direction: "X" | "Y"; showStressZones?: boolean };
}

const materialMap: Record<MaterialPreset, MeshStandardMaterialParameters> = {
  Concrete: { color: "#d5d2c9", roughness: .82, metalness: .03, transparent: false, opacity: 1, depthWrite: true },
  Brick: { color: "#a95e43", roughness: .9, metalness: 0, transparent: false, opacity: 1, depthWrite: true },
  Wood: { color: "#98704c", roughness: .76, metalness: 0, transparent: false, opacity: 1, depthWrite: true },
  Glass: { color: "#b8d9dc", roughness: .18, metalness: .05, transparent: true, opacity: .58, depthWrite: false },
};

function responseColor(floor: number, floors: number, intensity: number) {
  const floorRatio = floor / Math.max(floors - 1, 1);
  const demand = intensity / 10 * 1.05 + (1 - floorRatio) * .34;
  if (demand >= .72) return "#ef3d32";
  if (demand >= .54) return "#ff9d2e";
  return "#35b977";
}

function CameraController({ preset, floors, modelViewMode }: { preset: CameraPreset; floors: number; modelViewMode: ModelViewMode }) {
  const { camera } = useThree();
  useEffect(() => {
    const height = Math.min(floors, 6) * 2.85;
    const distance = Math.max(12, height * 1.35);
    const positions: Record<CameraPreset, [number, number, number]> = { Isometric: [distance*.8,Math.max(9,height*.72),distance], Top: [0,Math.max(18,height+10),.01], Walkthrough: [0,2.1,8] };
    camera.position.set(...positions[preset]); camera.lookAt(0,preset==="Walkthrough"?1.7:modelViewMode === "Structure" ? height*.48 : Math.min(2.8,height*.42),0); camera.updateProjectionMatrix();
  }, [camera,floors,modelViewMode,preset]);
  return null;
}

function WalkthroughController({width,depth}:{width:number;depth:number}){
  const {camera}=useThree(); const cameraRef=useRef(camera); const keys=useRef(new Set<string>());
  const forward=useRef(new Vector3()); const right=useRef(new Vector3()); const up=useRef(new Vector3(0,1,0));
  useEffect(()=>{const down=(event:KeyboardEvent)=>keys.current.add(event.code);const release=(event:KeyboardEvent)=>keys.current.delete(event.code);window.addEventListener("keydown",down);window.addEventListener("keyup",release);return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",release);};},[]);
  useFrame((_,delta)=>{const walkCamera=cameraRef.current;walkCamera.getWorldDirection(forward.current);forward.current.y=0;forward.current.normalize();right.current.crossVectors(forward.current,up.current).normalize();const speed=Math.min(delta,.05)*3.4;if(keys.current.has("KeyW"))walkCamera.position.addScaledVector(forward.current,speed);if(keys.current.has("KeyS"))walkCamera.position.addScaledVector(forward.current,-speed);if(keys.current.has("KeyD"))walkCamera.position.addScaledVector(right.current,speed);if(keys.current.has("KeyA"))walkCamera.position.addScaledVector(right.current,-speed);walkCamera.position.x=MathUtils.clamp(walkCamera.position.x,-width/2-2,width/2+2);walkCamera.position.z=MathUtils.clamp(walkCamera.position.z,-depth/2-2,depth/2+2);walkCamera.position.y=1.7;});
  return <PointerLockControls makeDefault/>;
}

function Building({ blueprint, floors, material, showRoof, simulation, modelViewMode = "Architecture", isolatedLevel = "All", interactive = false }: Omit<BuildingSceneProps,"lighting"|"cameraPreset"> & { interactive?: boolean }) {
  const floorGroups = useRef<Array<Group | null>>([]);
  const roofGroup = useRef<Group>(null);
  const finish = materialMap[material];
  const [openDoors,setOpenDoors]=useState<Set<string>>(new Set());
  const normalizedFloors = Math.min(floors, 6);
  const scene = useMemo(() => buildSceneModel.execute(blueprint), [blueprint]);
  const structuralPoints = useMemo(() => {
    const points = [...blueprint.columns.map((column)=>[column.x,column.y] as const),...blueprint.walls.flatMap((wall)=>[wall.start,wall.end])];
    const unique = new Map<string, readonly [number,number]>();
    points.forEach((point)=>unique.set(`${Math.round(point[0])}-${Math.round(point[1])}`,point));
    return [...unique.values()].slice(0,30).map(([x,y])=>({x:(x-scene.centerX)/scene.scale,z:(y-scene.centerY)/scene.scale}));
  },[blueprint,scene]);

  useFrame(({ clock }) => {
    const active = simulation?.active ?? false;
    const wave = Math.sin(clock.elapsedTime * (6.5 + (simulation?.intensity ?? 0) * .72));
    floorGroups.current.forEach((level,index)=>{
      if (!level) return;
      const ratio = (index+1)/normalizedFloors;
      const movement = active ? wave * (simulation?.intensity ?? 0) * .022 * Math.pow(ratio,1.35) : 0;
      const rotation = active ? wave * (simulation?.intensity ?? 0) * .0017 * ratio : 0;
      const xTarget = simulation?.direction === "X" ? movement : 0;
      const zTarget = simulation?.direction === "Y" ? movement : 0;
      level.position.x += (xTarget-level.position.x)*.34;
      level.position.z += (zTarget-level.position.z)*.34;
      level.rotation.z += ((simulation?.direction === "X" ? -rotation : 0)-level.rotation.z)*.28;
      level.rotation.x += ((simulation?.direction === "Y" ? rotation : 0)-level.rotation.x)*.28;
    });
    if (roofGroup.current) {
      const movement = active ? wave * (simulation?.intensity ?? 0) * .024 : 0;
      roofGroup.current.position.x += ((simulation?.direction === "X" ? movement : 0)-roofGroup.current.position.x)*.34;
      roofGroup.current.position.z += ((simulation?.direction === "Y" ? movement : 0)-roofGroup.current.position.z)*.34;
    }
  });

  return (
    <group>
      {Array.from({length:normalizedFloors}).map((_,floor)=>{if(isolatedLevel!=="All"&&floor!==isolatedLevel-1)return null;const zoneColor=simulation?.showStressZones ? responseColor(floor,normalizedFloors,simulation.intensity) : undefined;return <group key={floor} ref={(node)=>{floorGroups.current[floor]=node;}} position-y={isolatedLevel==="All"?floor*2.85:0}>
        {modelViewMode === "Architecture" ? <>
        <mesh receiveShadow position={[0,-.08,0]}><boxGeometry args={[scene.width+.2,.16,scene.depth+.2]}/><meshStandardMaterial color={zoneColor ?? "#c4c5bd"} roughness={.95} emissive={zoneColor ?? "#000000"} emissiveIntensity={zoneColor ? .1 : 0}/></mesh>
        {blueprint.rooms.map((room, roomIndex)=>{
          const roomName=room.name.toLowerCase();
          const color=roomName.includes("garden") ? "#789164" : roomName.includes("garage") ? "#b48e72" : roomName.includes("bath") ? "#d8ddd8" : roomIndex % 2 === 0 ? "#d8d5cb" : "#cecfc7";
          return <mesh key={`${floor}-${room.id}-finish`} receiveShadow position={[(room.x+room.width/2-scene.centerX)/scene.scale,.012,(room.y+room.height/2-scene.centerY)/scene.scale]}><boxGeometry args={[Math.max(.05,(room.width-18)/scene.scale),.025,Math.max(.05,(room.height-18)/scene.scale)]}/><meshStandardMaterial color={color} roughness={.88}/></mesh>;
        })}
        {scene.wallSegments.map((wall)=><mesh key={`${floor}-${wall.id}`} castShadow receiveShadow position={[wall.x,wall.y,wall.z]} rotation-y={wall.rotation}><boxGeometry args={[wall.length,wall.height,wall.thickness]}/><meshStandardMaterial key={`${material}-${wall.id}`} {...finish} color={zoneColor ?? finish.color} emissive={zoneColor ?? "#000000"} emissiveIntensity={zoneColor ? .12 : 0}/></mesh>)}
        {blueprint.columns.map((column)=><mesh key={`${floor}-${column.id}`} castShadow position={[(column.x-scene.centerX)/scene.scale,1.4,(column.y-scene.centerY)/scene.scale]}><boxGeometry args={[column.size/scene.scale,2.8,column.size/scene.scale]}/><meshStandardMaterial color={zoneColor ?? "#69716a"} roughness={.75}/></mesh>)}
        {scene.openings.map((opening)=>{const doorKey=`${floor}-${opening.id}`;return <OpeningAssembly key={doorKey} opening={opening} interactive={interactive} open={openDoors.has(doorKey)} onToggle={()=>setOpenDoors((current)=>{const next=new Set(current);if(next.has(doorKey))next.delete(doorKey);else next.add(doorKey);return next;})}/>;}) }
        {blueprint.stairs?.map((stair)=><SpiralStair key={`${floor}-${stair.id}`} x={(stair.x-scene.centerX)/scene.scale} z={(stair.y-scene.centerY)/scene.scale} radius={stair.radius/scene.scale}/>)}
        </> : <StructuralLevel scene={scene} points={structuralPoints} floor={floor} zoneColor={zoneColor}/>}
      </group>})}
      {showRoof && isolatedLevel === "All" && modelViewMode === "Architecture" && <group ref={roofGroup}><mesh castShadow position={[0,normalizedFloors*2.85+.05,0]}><boxGeometry args={[scene.width+.34,.18,scene.depth+.34]}/><meshStandardMaterial color="#777d75" roughness={.88}/></mesh></group>}
    </group>
  );
}

function StructuralLevel({scene,points,floor,zoneColor}:{scene:ReturnType<typeof buildSceneModel.execute>;points:Array<{x:number;z:number}>;floor:number;zoneColor?:string}) {
  const beamColor=zoneColor ?? "#38a875";
  const columnColor=zoneColor ?? "#8b9690";
  return <>
    <mesh position={[0,-.08,0]}><boxGeometry args={[scene.width+.16,.08,scene.depth+.16]}/><meshStandardMaterial color="#1e2a27" transparent opacity={.42} wireframe/></mesh>
    {points.map((point,index)=><group key={`${floor}-column-${index}`}><mesh castShadow position={[point.x,1.4,point.z]}><boxGeometry args={[.16,2.8,.16]}/><meshStandardMaterial color={columnColor} metalness={.25} roughness={.52} emissive={zoneColor ?? "#000000"} emissiveIntensity={zoneColor ? .16 : 0}/></mesh><mesh position={[point.x,2.8,point.z]}><sphereGeometry args={[.1,10,10]}/><meshStandardMaterial color="#4f7dff" emissive="#284cb7" emissiveIntensity={.35}/></mesh></group>)}
    {scene.wallSegments.map((wall)=><mesh key={`${floor}-beam-${wall.id}`} castShadow position={[wall.x,2.73,wall.z]} rotation-y={wall.rotation}><boxGeometry args={[wall.length,.18,.18]}/><meshStandardMaterial color={beamColor} metalness={.28} roughness={.46} emissive={zoneColor ?? "#143326"} emissiveIntensity={zoneColor ? .18 : .08}/></mesh>)}
  </>;
}

function SpiralStair({ x, z, radius }: { x: number; z: number; radius: number }) {
  const steps = 15;
  return <group position={[x,0,z]}><mesh castShadow position={[0,1.35,0]}><cylinderGeometry args={[.055,.055,2.7,14]}/><meshStandardMaterial color="#4b4f4a" metalness={.45} roughness={.45}/></mesh>{Array.from({length:steps}).map((_,index)=>{const angle=-Math.PI*.85+(index/(steps-1))*Math.PI*1.7;const stepWidth=radius*.92;return <mesh key={index} castShadow position={[Math.cos(angle)*radius*.48,.14+index*.16,Math.sin(angle)*radius*.48]} rotation-y={-angle}><boxGeometry args={[stepWidth,.07,radius*.34]}/><meshStandardMaterial color="#a89b88" roughness={.72}/></mesh>;})}<mesh castShadow position={[0,2.5,0]}><torusGeometry args={[radius,.035,8,48,Math.PI*1.7]}/><meshStandardMaterial color="#4b4f4a" metalness={.5} roughness={.4}/></mesh></group>;
}

function DoorLeaf({width,height,open,interactive,onToggle}:{width:number;height:number;open:boolean;interactive:boolean;onToggle:()=>void}){
  const group=useRef<Group>(null); const [hovered,setHovered]=useState(false);
  useFrame(()=>{if(group.current)group.current.rotation.y=MathUtils.lerp(group.current.rotation.y,open?-Math.PI/2:-.06,.16);});
  return <group ref={group} position={[-width/2+.035,height/2,0]} onClick={(event)=>{if(!interactive)return;event.stopPropagation();onToggle();}} onPointerOver={()=>interactive&&setHovered(true)} onPointerOut={()=>setHovered(false)}>
    <mesh castShadow position={[width/2,0,0]}><boxGeometry args={[width-.08,height-.08,.055]}/><meshStandardMaterial color={hovered?"#b48860":"#8a6a4d"} emissive={hovered?"#51311b":"#000000"} emissiveIntensity={hovered ? .22 : 0} roughness={.76}/></mesh>
    <mesh position={[width-.16,0,.045]}><sphereGeometry args={[.035,12,12]}/><meshStandardMaterial color="#c8a76e" metalness={.55} roughness={.3}/></mesh>
  </group>;
}

function OpeningAssembly({ opening, interactive, open, onToggle }: { opening: ReturnType<typeof buildSceneModel.execute>["openings"][number]; interactive:boolean; open:boolean; onToggle:()=>void }) {
  const frameColor = opening.type === "window" ? "#52666a" : "#59483b";
  const frameThickness = .075;
  const centerY = opening.sillHeight + opening.height / 2;
  return (
    <group position={[opening.x,0,opening.z]} rotation-y={opening.rotation}>
      <mesh castShadow position={[-opening.width/2,centerY,0]}><boxGeometry args={[frameThickness,opening.height+.08,.18]}/><meshStandardMaterial color={frameColor} roughness={.68}/></mesh>
      <mesh castShadow position={[opening.width/2,centerY,0]}><boxGeometry args={[frameThickness,opening.height+.08,.18]}/><meshStandardMaterial color={frameColor} roughness={.68}/></mesh>
      <mesh castShadow position={[0,opening.sillHeight+opening.height,0]}><boxGeometry args={[opening.width+frameThickness,.075,.18]}/><meshStandardMaterial color={frameColor} roughness={.68}/></mesh>
      {opening.type === "window" ? <>
        <mesh position={[0,centerY,0]}><boxGeometry args={[Math.max(.05,opening.width-.1),opening.height-.1,.035]}/><meshPhysicalMaterial color="#9cc7d3" transmission={.72} transparent opacity={.48} roughness={.08}/></mesh>
        <mesh position={[0,opening.sillHeight,0]}><boxGeometry args={[opening.width+.08,.08,.22]}/><meshStandardMaterial color={frameColor} roughness={.68}/></mesh>
        <mesh position={[0,centerY,.015]}><boxGeometry args={[.045,opening.height-.12,.05]}/><meshStandardMaterial color={frameColor}/></mesh>
      </> : <DoorLeaf width={opening.width} height={opening.height} open={open} interactive={interactive} onToggle={onToggle}/>}
    </group>
  );
}

/** Procedural R3F scene generated from the semantic blueprint JSON. */
export function BuildingScene(props: BuildingSceneProps) {
  const night = props.lighting === "Night";
  const sunset = props.lighting === "Sunset";
  const modelViewMode = props.modelViewMode ?? "Architecture";
  const structural = modelViewMode === "Structure";
  const scene=useMemo(()=>buildSceneModel.execute(props.blueprint),[props.blueprint]);
  const cameraFloors=props.isolatedLevel&&props.isolatedLevel!=="All"?1:props.floors;
  const background = structural ? "#050b17" : night ? "#11181b" : sunset ? "#e7c7a9" : "#e9eeeb";
  return (
    <Canvas shadows dpr={[1,1.6]} gl={{ antialias: true }}>
      <color attach="background" args={[background]}/>
      <fog attach="fog" args={[background,18,structural ? 52 : 38]}/>
      <PerspectiveCamera makeDefault fov={42} position={[11,9,12]}/>
      <CameraController preset={props.cameraPreset} floors={cameraFloors} modelViewMode={modelViewMode}/>
      {!night && !structural && <Sky distance={450000} sunPosition={sunset ? [-5,2,-4] : [6,8,5]} turbidity={sunset ? 8 : 4} rayleigh={sunset ? 2.6 : 1.2}/>}
      <ambientLight intensity={structural ? .62 : night ? .32 : .72} color={structural ? "#7fa7d9" : night ? "#7d98c5" : "#fff6e8"}/>
      <directionalLight castShadow position={sunset ? [-7,6,-5] : [8,12,7]} intensity={night ? .45 : 2.1} color={sunset ? "#ff9a58" : "#fff8e8"} shadow-mapSize={[1024,1024]}/>
      {night && <pointLight position={[0,5,1]} intensity={26} distance={14} color="#ffbe78"/>}
      <Building blueprint={props.blueprint} floors={props.floors} material={props.material} modelViewMode={modelViewMode} showRoof={props.showRoof} simulation={props.simulation} isolatedLevel={props.isolatedLevel} interactive={props.cameraPreset==="Walkthrough"}/>
      <Grid infiniteGrid fadeDistance={32} fadeStrength={3} cellSize={.5} sectionSize={2.5} cellColor={structural ? "#153149" : night ? "#36434a" : "#aeb7af"} sectionColor={structural ? "#20547b" : night ? "#53636a" : "#828e84"} position={[0,-.17,0]}/>
      <ContactShadows position={[0,-.15,0]} opacity={night ? .25 : .42} scale={24} blur={2.5} far={15}/>
      {props.cameraPreset==="Walkthrough"?<WalkthroughController width={scene.width} depth={scene.depth}/>:<OrbitControls makeDefault enableDamping dampingFactor={.08} minDistance={3.5} maxDistance={48} maxPolarAngle={Math.PI/2.03} target={[0,Math.min(cameraFloors,6)*1.35,0]}/>}
    </Canvas>
  );
}
