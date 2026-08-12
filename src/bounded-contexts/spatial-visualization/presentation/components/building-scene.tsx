"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Grid, OrbitControls, PerspectiveCamera, Sky } from "@react-three/drei";
import type { Group, MeshStandardMaterialParameters } from "three";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import { buildSceneModel } from "@/bounded-contexts/spatial-visualization/application/use-cases/build-scene-model";
import type { CameraPreset, LightingPreset, MaterialPreset } from "@/bounded-contexts/spatial-visualization/domain/value-objects/scene-preferences";

export type { CameraPreset, LightingPreset, MaterialPreset } from "@/bounded-contexts/spatial-visualization/domain/value-objects/scene-preferences";

interface BuildingSceneProps {
  blueprint: Blueprint;
  floors: number;
  material: MaterialPreset;
  lighting: LightingPreset;
  cameraPreset: CameraPreset;
  showRoof: boolean;
  simulation?: { active: boolean; intensity: number; direction: "X" | "Y" };
}

const materialMap: Record<MaterialPreset, MeshStandardMaterialParameters> = {
  Concrete: { color: "#d5d2c9", roughness: .82, metalness: .03 },
  Brick: { color: "#a95e43", roughness: .9, metalness: 0 },
  Wood: { color: "#98704c", roughness: .76, metalness: 0 },
  Glass: { color: "#b8d9dc", roughness: .18, metalness: .05, transparent: true, opacity: .72 },
};

function CameraController({ preset }: { preset: CameraPreset }) {
  const { camera } = useThree();
  useEffect(() => {
    const positions: Record<CameraPreset, [number, number, number]> = { Isometric: [11,9,12], Top: [0,18,.01], Walkthrough: [0,2.1,8] };
    camera.position.set(...positions[preset]); camera.lookAt(0,2,0); camera.updateProjectionMatrix();
  }, [camera,preset]);
  return null;
}

function Building({ blueprint, floors, material, showRoof, simulation }: Omit<BuildingSceneProps,"lighting"|"cameraPreset">) {
  const group = useRef<Group>(null);
  const finish = materialMap[material];
  const normalizedFloors = Math.min(floors, 6);
  const scene = useMemo(() => buildSceneModel.execute(blueprint), [blueprint]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    if (!simulation?.active) { group.current.position.x *= .82; group.current.position.z *= .82; return; }
    const movement = Math.sin(clock.elapsedTime * (8 + simulation.intensity * .7)) * simulation.intensity * .012;
    if (simulation.direction === "X") group.current.position.x = movement;
    else group.current.position.z = movement;
  });

  return (
    <group ref={group}>
      {Array.from({length:normalizedFloors}).map((_,floor)=><group key={floor} position-y={floor*2.85}>
        <mesh receiveShadow position={[0,-.08,0]}><boxGeometry args={[scene.width+.2,.16,scene.depth+.2]}/><meshStandardMaterial color="#c4c5bd" roughness={.95}/></mesh>
        {blueprint.rooms.map((room, roomIndex)=>{
          const roomName=room.name.toLowerCase();
          const color=roomName.includes("garden") ? "#789164" : roomName.includes("garage") ? "#b48e72" : roomName.includes("bath") ? "#d8ddd8" : roomIndex % 2 === 0 ? "#d8d5cb" : "#cecfc7";
          return <mesh key={`${floor}-${room.id}-finish`} receiveShadow position={[(room.x+room.width/2-scene.centerX)/scene.scale,.012,(room.y+room.height/2-scene.centerY)/scene.scale]}><boxGeometry args={[Math.max(.05,(room.width-18)/scene.scale),.025,Math.max(.05,(room.height-18)/scene.scale)]}/><meshStandardMaterial color={color} roughness={.88}/></mesh>;
        })}
        {scene.wallSegments.map((wall)=><mesh key={`${floor}-${wall.id}`} castShadow receiveShadow position={[wall.x,wall.y,wall.z]} rotation-y={wall.rotation}><boxGeometry args={[wall.length,wall.height,wall.thickness]}/><meshStandardMaterial {...finish}/></mesh>)}
        {blueprint.columns.map((column)=><mesh key={`${floor}-${column.id}`} castShadow position={[(column.x-scene.centerX)/scene.scale,1.4,(column.y-scene.centerY)/scene.scale]}><boxGeometry args={[column.size/scene.scale,2.8,column.size/scene.scale]}/><meshStandardMaterial color="#69716a" roughness={.75}/></mesh>)}
        {scene.openings.map((opening)=><OpeningAssembly key={`${floor}-${opening.id}`} opening={opening}/>) }
        {blueprint.stairs?.map((stair)=><SpiralStair key={`${floor}-${stair.id}`} x={(stair.x-scene.centerX)/scene.scale} z={(stair.y-scene.centerY)/scene.scale} radius={stair.radius/scene.scale}/>)}
      </group>)}
      {showRoof && <mesh castShadow position={[0,normalizedFloors*2.85+.05,0]}><boxGeometry args={[scene.width+.34,.18,scene.depth+.34]}/><meshStandardMaterial color="#777d75" roughness={.88}/></mesh>}
    </group>
  );
}

function SpiralStair({ x, z, radius }: { x: number; z: number; radius: number }) {
  const steps = 15;
  return <group position={[x,0,z]}><mesh castShadow position={[0,1.35,0]}><cylinderGeometry args={[.055,.055,2.7,14]}/><meshStandardMaterial color="#4b4f4a" metalness={.45} roughness={.45}/></mesh>{Array.from({length:steps}).map((_,index)=>{const angle=-Math.PI*.85+(index/(steps-1))*Math.PI*1.7;const stepWidth=radius*.92;return <mesh key={index} castShadow position={[Math.cos(angle)*radius*.48,.14+index*.16,Math.sin(angle)*radius*.48]} rotation-y={-angle}><boxGeometry args={[stepWidth,.07,radius*.34]}/><meshStandardMaterial color="#a89b88" roughness={.72}/></mesh>;})}<mesh castShadow position={[0,2.5,0]}><torusGeometry args={[radius,.035,8,48,Math.PI*1.7]}/><meshStandardMaterial color="#4b4f4a" metalness={.5} roughness={.4}/></mesh></group>;
}

function OpeningAssembly({ opening }: { opening: ReturnType<typeof buildSceneModel.execute>["openings"][number] }) {
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
      </> : <group position={[-opening.width/2+.035,opening.height/2,0]} rotation-y={-.16}>
        <mesh castShadow position={[opening.width/2,0,0]}><boxGeometry args={[opening.width-.08,opening.height-.08,.055]}/><meshStandardMaterial color="#8a6a4d" roughness={.76}/></mesh>
        <mesh position={[opening.width-.16,0,.045]}><sphereGeometry args={[.035,12,12]}/><meshStandardMaterial color="#c8a76e" metalness={.55} roughness={.3}/></mesh>
      </group>}
    </group>
  );
}

/** Procedural R3F scene generated from the semantic blueprint JSON. */
export function BuildingScene(props: BuildingSceneProps) {
  const night = props.lighting === "Night";
  const sunset = props.lighting === "Sunset";
  return (
    <Canvas shadows dpr={[1,1.6]} gl={{ antialias: true }}>
      <color attach="background" args={[night ? "#11181b" : sunset ? "#e7c7a9" : "#e9eeeb"]}/>
      <fog attach="fog" args={[night ? "#11181b" : "#e9eeeb",18,38]}/>
      <PerspectiveCamera makeDefault fov={42} position={[11,9,12]}/>
      <CameraController preset={props.cameraPreset}/>
      {!night && <Sky distance={450000} sunPosition={sunset ? [-5,2,-4] : [6,8,5]} turbidity={sunset ? 8 : 4} rayleigh={sunset ? 2.6 : 1.2}/>} 
      <ambientLight intensity={night ? .32 : .72} color={night ? "#7d98c5" : "#fff6e8"}/>
      <directionalLight castShadow position={sunset ? [-7,6,-5] : [8,12,7]} intensity={night ? .45 : 2.1} color={sunset ? "#ff9a58" : "#fff8e8"} shadow-mapSize={[1024,1024]}/>
      {night && <pointLight position={[0,5,1]} intensity={26} distance={14} color="#ffbe78"/>}
      <Building blueprint={props.blueprint} floors={props.floors} material={props.material} showRoof={props.showRoof} simulation={props.simulation}/>
      <Grid infiniteGrid fadeDistance={26} fadeStrength={3} cellSize={.5} sectionSize={2.5} cellColor={night ? "#36434a" : "#aeb7af"} sectionColor={night ? "#53636a" : "#828e84"} position={[0,-.17,0]}/>
      <ContactShadows position={[0,-.15,0]} opacity={night ? .25 : .42} scale={24} blur={2.5} far={15}/>
      <OrbitControls makeDefault enableDamping dampingFactor={.08} minDistance={3.5} maxDistance={28} maxPolarAngle={Math.PI/2.03} target={[0,2,0]}/>
    </Canvas>
  );
}
