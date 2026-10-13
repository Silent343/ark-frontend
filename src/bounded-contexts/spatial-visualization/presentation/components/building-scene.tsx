"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyProps, Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  ContactShadows,
  Environment,
  Html,
  Lightformer,
  Grid,
  OrbitControls,
  PerspectiveCamera,
  PointerLockControls,
  Sky,
} from "@react-three/drei";
import { CadBuilding, FloorSurfaces } from "./cad-building";
import {
  ACESFilmicToneMapping,
  CatmullRomCurve3,
  MathUtils,
  Vector3,
  type Group,
  type MeshStandardMaterialParameters,
} from "three";
import { useRenderQuality, type RenderSettings } from "../use-render-settings";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import { geometryOnLevel } from "@/bounded-contexts/plan-digitization/domain/plan-levels";
import type { ConstructionSiteSelection } from "@/bounded-contexts/site-planning/public";
import { buildSceneModel } from "@/bounded-contexts/spatial-visualization/application/use-cases/build-scene-model";
import type {
  CameraPreset,
  LightingPreset,
  MaterialPreset,
  ModelViewMode,
} from "@/bounded-contexts/spatial-visualization/domain/value-objects/scene-preferences";

export type {
  CameraPreset,
  LightingPreset,
  MaterialPreset,
  ModelViewMode,
} from "@/bounded-contexts/spatial-visualization/domain/value-objects/scene-preferences";

interface BuildingSceneProps {
  selectedElementId?: string | null;
  onSelectElement?: (id: string) => void;
  blueprint: Blueprint;
  floors: number;
  material: MaterialPreset;
  lighting: LightingPreset;
  cameraPreset: CameraPreset;
  modelViewMode?: ModelViewMode;
  showRoof: boolean;
  isolatedLevel?: number | "All";
  siteSelection?: ConstructionSiteSelection;
  renderSettings?: RenderSettings;
  simulation?: {
    active: boolean;
    intensity: number;
    direction: "X" | "Y";
    showStressZones?: boolean;
  };
}

function LotTerrain({ selection }: { selection: ConstructionSiteSelection }) {
  // Site dimensions are metric; changing the camera is preferable to silently shrinking a lot.
  const width = selection.lotWidthM;
  const depth = selection.lotDepthM;
  const footprint = Math.min(
    Math.sqrt(selection.buildableAreaM2),
    width,
    depth,
  );
  return (
    <group position-y={-0.19}>
      <mesh receiveShadow rotation-x={-Math.PI / 2}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#638165" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <planeGeometry args={[footprint, footprint]} />
        <meshStandardMaterial
          color="#d98b55"
          transparent
          opacity={0.38}
          roughness={0.95}
        />
      </mesh>
    </group>
  );
}

const materialMap: Record<MaterialPreset, MeshStandardMaterialParameters> = {
  Concrete: {
    color: "#e1dfd8",
    roughness: 0.82,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  },
  Brick: {
    color: "#a95e43",
    roughness: 0.9,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  },
  Wood: {
    color: "#98704c",
    roughness: 0.76,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  },
  Glass: {
    color: "#b8d9dc",
    roughness: 0.18,
    metalness: 0.05,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  },
};

function responseColor(floor: number, floors: number, intensity: number) {
  const floorRatio = floor / Math.max(floors - 1, 1);
  const demand = (intensity / 10) * 1.05 + (1 - floorRatio) * 0.34;
  if (demand >= 0.72) return "#ef3d32";
  if (demand >= 0.54) return "#ff9d2e";
  return "#35b977";
}

function CameraController({
  preset,
  height,
  extent,
  baseElevation,
  modelViewMode,
}: {
  preset: CameraPreset;
  height: number;
  extent: number;
  baseElevation: number;
  modelViewMode: ModelViewMode;
}) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const distance = Math.max(8, height * 1.6, extent * 1.25);
    const positions: Record<CameraPreset, [number, number, number]> = {
      Isometric: [
        distance * 0.8,
        Math.max(distance * 0.7, height * 0.72),
        distance,
      ],
      Top: [0, Math.max(extent * 1.7, height + 10), 0.01],
      Walkthrough: [0, 1.7, Math.min(8, extent / 2)],
    };
    camera.position.set(...positions[preset]);
    camera.lookAt(
      0,
      preset === "Walkthrough"
        ? 1.7
        : modelViewMode === "Structure"
          ? baseElevation + height * 0.48
          : baseElevation + height * 0.42,
      0,
    );
    camera.updateProjectionMatrix();
    invalidate();
  }, [
    camera,
    height,
    extent,
    baseElevation,
    modelViewMode,
    preset,
    invalidate,
  ]);
  return null;
}

function WalkthroughController({
  width,
  depth,
}: {
  width: number;
  depth: number;
}) {
  const { camera } = useThree();
  const cameraRef = useRef(camera);
  const keys = useRef(new Set<string>());
  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());
  const up = useRef(new Vector3(0, 1, 0));
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current.add(event.code);
    const release = (event: KeyboardEvent) => keys.current.delete(event.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", release);
    };
  }, []);
  useFrame((_, delta) => {
    const walkCamera = cameraRef.current;
    walkCamera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    right.current.crossVectors(forward.current, up.current).normalize();
    const speed = Math.min(delta, 0.05) * 3.4;
    if (keys.current.has("KeyW"))
      walkCamera.position.addScaledVector(forward.current, speed);
    if (keys.current.has("KeyS"))
      walkCamera.position.addScaledVector(forward.current, -speed);
    if (keys.current.has("KeyD"))
      walkCamera.position.addScaledVector(right.current, speed);
    if (keys.current.has("KeyA"))
      walkCamera.position.addScaledVector(right.current, -speed);
    walkCamera.position.x = MathUtils.clamp(
      walkCamera.position.x,
      -width / 2 - 2,
      width / 2 + 2,
    );
    walkCamera.position.z = MathUtils.clamp(
      walkCamera.position.z,
      -depth / 2 - 2,
      depth / 2 + 2,
    );
    walkCamera.position.y = 1.7;
  });
  return <PointerLockControls makeDefault />;
}

function Building({
  blueprint,
  floors,
  material,
  showRoof,
  simulation,
  modelViewMode = "Architecture",
  isolatedLevel = "All",
  interactive = false,
  selectedElementId,
  onSelectElement,
}: Omit<BuildingSceneProps, "lighting" | "cameraPreset"> & {
  interactive?: boolean;
}) {
  const floorGroups = useRef<Array<Group | null>>([]);
  const finish = materialMap[material];
  const [openDoors, setOpenDoors] = useState<Set<string>>(new Set());
  const [hoveredService, setHoveredService] = useState<string | null>(null);
  const normalizedFloors = Math.max(
    1,
    Math.min(floors, blueprint.levels.length),
  );
  const scene = useMemo(() => buildSceneModel.execute(blueprint), [blueprint]);
  const levelScenes = useMemo(() => {
    return blueprint.levels.map((level) => {
      const plan = geometryOnLevel(blueprint, level.id);
      const model = buildSceneModel.execute(plan, scene);
      const points = [
        ...plan.columns.map((column) => [column.x, column.y] as const),
        ...plan.walls.flatMap((wall) => [wall.start, wall.end]),
      ];
      const unique = new Map<string, readonly [number, number]>();
      points.forEach((point) =>
        unique.set(`${Math.round(point[0])}-${Math.round(point[1])}`, point),
      );
      return {
        plan,
        model,
        points: [...unique.values()].slice(0, 30).map(([x, y]) => ({
          x: (x - scene.centerX) / scene.scale,
          z: (y - scene.centerY) / scene.scale,
        })),
      };
    });
  }, [blueprint, scene]);

  useFrame(({ clock }) => {
    const active = simulation?.active ?? false;
    const wave = Math.sin(
      clock.elapsedTime * (6.5 + (simulation?.intensity ?? 0) * 0.72),
    );
    floorGroups.current.forEach((level, index) => {
      if (!level) return;
      const ratio = (index + 1) / normalizedFloors;
      const movement = active
        ? wave * (simulation?.intensity ?? 0) * 0.022 * Math.pow(ratio, 1.35)
        : 0;
      const rotation = active
        ? wave * (simulation?.intensity ?? 0) * 0.0017 * ratio
        : 0;
      const xTarget = simulation?.direction === "X" ? movement : 0;
      const zTarget = simulation?.direction === "Y" ? movement : 0;
      level.position.x += (xTarget - level.position.x) * 0.34;
      level.position.z += (zTarget - level.position.z) * 0.34;
      level.rotation.z +=
        ((simulation?.direction === "X" ? -rotation : 0) - level.rotation.z) *
        0.28;
      level.rotation.x +=
        ((simulation?.direction === "Y" ? rotation : 0) - level.rotation.x) *
        0.28;
    });
  });

  return (
    <group>
      {Array.from({ length: normalizedFloors }).map((_, floor) => {
        if (isolatedLevel !== "All" && floor !== isolatedLevel - 1) return null;
        const { plan, model: levelScene, points } = levelScenes[floor];
        const zoneColor = simulation?.showStressZones
          ? responseColor(floor, normalizedFloors, simulation.intensity)
          : undefined;
        return (
          <group
            key={floor}
            ref={(node) => {
              floorGroups.current[floor] = node;
            }}
            position-y={
              isolatedLevel === "All" ? blueprint.levels[floor].elevation : 0
            }
          >
            {modelViewMode === "Architecture" ? (
              <>
                {!!plan.slabs?.length && (
                  <FloorSurfaces
                    plan={plan}
                    scene={scene}
                    selectedId={selectedElementId}
                    onSelectElement={onSelectElement}
                  />
                )}
                {!plan.slabs?.length &&
                  plan.rooms.map((room, roomIndex) => {
                    const roomName = room.name.toLowerCase();
                    const color = roomName.includes("garden")
                      ? "#789164"
                      : roomName.includes("garage")
                        ? "#b48e72"
                        : roomName.includes("bath")
                          ? "#d8ddd8"
                          : roomIndex % 2 === 0
                            ? "#d8d5cb"
                            : "#cecfc7";
                    const inset = blueprint.review ? 0 : 18;
                    return (
                      <mesh
                        key={`${floor}-${room.id}-finish`}
                        receiveShadow
                        position={[
                          (room.x + room.width / 2 - scene.centerX) /
                            scene.scale,
                          0.012,
                          (room.y + room.height / 2 - scene.centerY) /
                            scene.scale,
                        ]}
                      >
                        <boxGeometry
                          args={[
                            Math.max(0.05, (room.width - inset) / scene.scale),
                            0.025,
                            Math.max(0.05, (room.height - inset) / scene.scale),
                          ]}
                        />
                        <meshStandardMaterial color={color} roughness={0.88} />
                      </mesh>
                    );
                  })}
                {levelScene.wallSegments.map((wall) => (
                  <mesh
                    key={`${floor}-${wall.id}`}
                    castShadow
                    receiveShadow
                    position={[wall.x, wall.y, wall.z]}
                    rotation-y={wall.rotation}
                    onClick={
                      onSelectElement && wall.elementId
                        ? (event) => {
                            event.stopPropagation();
                            onSelectElement(wall.elementId!);
                          }
                        : undefined
                    }
                  >
                    <boxGeometry
                      args={[wall.length, wall.height, wall.thickness]}
                    />
                    <meshStandardMaterial
                      key={`${material}-${wall.id}`}
                      {...finish}
                      color={
                        wall.elementId === selectedElementId
                          ? "#44b8ff"
                          : (zoneColor ?? finish.color)
                      }
                      emissive={zoneColor ?? "#000000"}
                      emissiveIntensity={zoneColor ? 0.12 : 0}
                    />
                  </mesh>
                ))}
                {/* CAD furniture blocks stay linked to their source plan and active level. */}
                {plan.fixtures?.map((item) => (
                  <mesh
                    key={item.id}
                    onClick={
                      onSelectElement
                        ? (event) => {
                            event.stopPropagation();
                            onSelectElement(item.id);
                          }
                        : undefined
                    }
                    castShadow
                    receiveShadow
                    position={[
                      (item.x - scene.centerX) / scene.scale,
                      item.height / 2,
                      (item.y - scene.centerY) / scene.scale,
                    ]}
                  >
                    <boxGeometry
                      args={[
                        item.width / scene.scale,
                        item.height,
                        item.depth / scene.scale,
                      ]}
                    />
                    <meshStandardMaterial
                      color={
                        item.id === selectedElementId ? "#44b8ff" : "#b8a78e"
                      }
                      roughness={0.8}
                    />
                  </mesh>
                ))}
                {plan.columns.map((column) => (
                  <mesh
                    key={`${floor}-${column.id}`}
                    onClick={
                      onSelectElement
                        ? (event) => {
                            event.stopPropagation();
                            onSelectElement(column.id);
                          }
                        : undefined
                    }
                    castShadow
                    rotation-y={(-(column.rotation ?? 0) * Math.PI) / 180}
                    position={[
                      (column.x - scene.centerX) / scene.scale,
                      (column.height ?? blueprint.levels[floor].height ?? 2.8) /
                        2,
                      (column.y - scene.centerY) / scene.scale,
                    ]}
                  >
                    <boxGeometry
                      args={[
                        column.size / scene.scale,
                        column.height ?? blueprint.levels[floor].height ?? 2.8,
                        (column.depth ?? column.size) / scene.scale,
                      ]}
                    />
                    <meshStandardMaterial
                      color={
                        column.id === selectedElementId
                          ? "#44b8ff"
                          : (zoneColor ?? "#69716a")
                      }
                      roughness={0.75}
                    />
                  </mesh>
                ))}
                {levelScene.openings.map((opening) => {
                  const doorKey = `${floor}-${opening.id}`;
                  return (
                    <group
                      key={doorKey}
                      onClick={
                        onSelectElement
                          ? (event) => {
                              event.stopPropagation();
                              onSelectElement(opening.id);
                            }
                          : undefined
                      }
                    >
                      <OpeningAssembly
                        key={doorKey}
                        opening={opening}
                        interactive={interactive}
                        open={openDoors.has(doorKey)}
                        onToggle={() =>
                          setOpenDoors((current) => {
                            const next = new Set(current);
                            if (next.has(doorKey)) next.delete(doorKey);
                            else next.add(doorKey);
                            return next;
                          })
                        }
                      />
                    </group>
                  );
                })}
                {plan.stairs?.map((stair) =>
                  stair.type === "straight" ? (
                    <StraightStair
                      key={`${floor}-${stair.id}`}
                      x={(stair.x - scene.centerX) / scene.scale}
                      z={(stair.y - scene.centerY) / scene.scale}
                      width={(stair.radius * 2) / scene.scale}
                      length={(stair.length ?? stair.radius * 4) / scene.scale}
                      rotation={(-(stair.rotation ?? 0) * Math.PI) / 180}
                      rise={stair.rise ?? blueprint.levels[floor].height ?? 2.8}
                      steps={stair.stepCount}
                    />
                  ) : (
                    <SpiralStair
                      key={`${floor}-${stair.id}`}
                      x={(stair.x - scene.centerX) / scene.scale}
                      z={(stair.y - scene.centerY) / scene.scale}
                      radius={stair.radius / scene.scale}
                      rise={stair.rise ?? blueprint.levels[floor].height ?? 2.8}
                      steps={stair.stepCount}
                    />
                  ),
                )}
                {plan.routes?.map((route) => {
                  const from = plan.services?.find(
                    (point) => point.id === route.fromId,
                  );
                  const to = plan.services?.find(
                    (point) => point.id === route.toId,
                  );
                  if (!from || !to) return null;
                  const startY = from.kind === "drain" ? 0.1 : 1.15;
                  const endY = to.kind === "drain" ? 0.1 : 1.15;
                  const routeY = route.kind === "plumbing" ? 0.22 : 2.3;
                  const fromX = (from.x - scene.centerX) / scene.scale;
                  const fromZ = (from.y - scene.centerY) / scene.scale;
                  const toX = (to.x - scene.centerX) / scene.scale;
                  const toZ = (to.y - scene.centerY) / scene.scale;
                  // Straight schematic runs expose connectivity; no pipe routing or clash clearance is inferred.
                  const curve = new CatmullRomCurve3(
                    [
                      new Vector3(fromX, startY, fromZ),
                      new Vector3(fromX, routeY, fromZ),
                      new Vector3(toX, routeY, toZ),
                      new Vector3(toX, endY, toZ),
                    ],
                    false,
                    "centripetal",
                  );
                  return (
                    <mesh
                      key={route.id}
                      name={
                        route.kind === "plumbing"
                          ? "Conexión sanitaria esquemática"
                          : "Circuito eléctrico esquemático"
                      }
                    >
                      <tubeGeometry
                        args={[
                          curve,
                          20,
                          route.kind === "plumbing" ? 0.045 : 0.028,
                          8,
                          false,
                        ]}
                      />
                      <meshStandardMaterial
                        color={
                          route.kind === "plumbing" ? "#1885b5" : "#e5b546"
                        }
                        roughness={0.48}
                      />
                    </mesh>
                  );
                })}
                {plan.services?.map((point) => (
                  <group
                    key={point.id}
                    name={point.name}
                    onPointerOver={(event) => {
                      event.stopPropagation();
                      setHoveredService(point.id);
                    }}
                    onPointerOut={() => setHoveredService(null)}
                    position={[
                      (point.x - scene.centerX) / scene.scale,
                      point.kind === "drain" ? 0.1 : 1.15,
                      (point.y - scene.centerY) / scene.scale,
                    ]}
                  >
                    <mesh castShadow>
                      <boxGeometry args={[0.19, 0.19, 0.19]} />
                      <meshStandardMaterial
                        color={
                          ["water", "drain"].includes(point.kind)
                            ? "#1885b5"
                            : "#e5b546"
                        }
                        roughness={0.45}
                      />
                    </mesh>
                    {hoveredService === point.id && (
                      <Html center distanceFactor={12} position={[0, 0.34, 0]}>
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            background: "#15242e",
                            color: "white",
                            borderRadius: 6,
                            padding: "4px 8px",
                            fontSize: 12,
                            pointerEvents: "none",
                          }}
                        >
                          {point.name}
                        </span>
                      </Html>
                    )}
                  </group>
                ))}
                {showRoof &&
                  plan.roofs?.map((roof) => (
                    <mesh
                      key={roof.id}
                      name={roof.name}
                      castShadow
                      receiveShadow
                      position={[
                        (roof.x + roof.width / 2 - scene.centerX) / scene.scale,
                        roof.elevation + roof.thickness / 2,
                        (roof.y + roof.depth / 2 - scene.centerY) / scene.scale,
                      ]}
                    >
                      <boxGeometry
                        args={[
                          roof.width / scene.scale,
                          roof.thickness,
                          roof.depth / scene.scale,
                        ]}
                      />
                      <meshStandardMaterial color="#777d75" roughness={0.88} />
                    </mesh>
                  ))}
              </>
            ) : (
              plan.walls.length + plan.columns.length > 0 && (
                <StructuralLevel
                  scene={levelScene}
                  points={points}
                  floor={floor}
                  zoneColor={zoneColor}
                />
              )
            )}
          </group>
        );
      })}
    </group>
  );
}

function StructuralLevel({
  scene,
  points,
  floor,
  zoneColor,
}: {
  scene: ReturnType<typeof buildSceneModel.execute>;
  points: Array<{ x: number; z: number }>;
  floor: number;
  zoneColor?: string;
}) {
  const beamColor = zoneColor ?? "#38a875";
  const columnColor = zoneColor ?? "#8b9690";
  return (
    <>
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[scene.width + 0.16, 0.08, scene.depth + 0.16]} />
        <meshStandardMaterial
          color="#1e2a27"
          transparent
          opacity={0.42}
          wireframe
        />
      </mesh>
      {points.map((point, index) => (
        <group key={`${floor}-column-${index}`}>
          <mesh castShadow position={[point.x, 1.4, point.z]}>
            <boxGeometry args={[0.16, 2.8, 0.16]} />
            <meshStandardMaterial
              color={columnColor}
              metalness={0.25}
              roughness={0.52}
              emissive={zoneColor ?? "#000000"}
              emissiveIntensity={zoneColor ? 0.16 : 0}
            />
          </mesh>
          <mesh position={[point.x, 2.8, point.z]}>
            <sphereGeometry args={[0.1, 10, 10]} />
            <meshStandardMaterial
              color="#4f7dff"
              emissive="#284cb7"
              emissiveIntensity={0.35}
            />
          </mesh>
        </group>
      ))}
      {scene.wallSegments.map((wall) => (
        <mesh
          key={`${floor}-beam-${wall.id}`}
          castShadow
          position={[wall.x, 2.73, wall.z]}
          rotation-y={wall.rotation}
        >
          <boxGeometry args={[wall.length, 0.18, 0.18]} />
          <meshStandardMaterial
            color={beamColor}
            metalness={0.28}
            roughness={0.46}
            emissive={zoneColor ?? "#143326"}
            emissiveIntensity={zoneColor ? 0.18 : 0.08}
          />
        </mesh>
      ))}
    </>
  );
}

function SpiralStair({
  x,
  z,
  radius,
  rise = 2.8,
  steps = 15,
}: {
  x: number;
  z: number;
  radius: number;
  rise?: number;
  steps?: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow position={[0, rise / 2, 0]}>
        <cylinderGeometry args={[0.055, 0.055, rise, 14]} />
        <meshStandardMaterial
          color="#4b4f4a"
          metalness={0.45}
          roughness={0.45}
        />
      </mesh>
      {Array.from({ length: steps }).map((_, index) => {
        const angle = -Math.PI * 0.85 + (index / (steps - 1)) * Math.PI * 1.7;
        const stepWidth = radius * 0.92;
        return (
          <mesh
            key={index}
            castShadow
            position={[
              Math.cos(angle) * radius * 0.48,
              ((index + 1) * rise) / steps,
              Math.sin(angle) * radius * 0.48,
            ]}
            rotation-y={-angle}
          >
            <boxGeometry args={[stepWidth, 0.07, radius * 0.34]} />
            <meshStandardMaterial color="#a89b88" roughness={0.72} />
          </mesh>
        );
      })}
      <mesh castShadow position={[0, rise, 0]}>
        <torusGeometry args={[radius, 0.035, 8, 48, Math.PI * 1.7]} />
        <meshStandardMaterial color="#4b4f4a" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** A schematic straight flight uses its saved width, run and orientation in both views. */
function StraightStair({
  x,
  z,
  width,
  length,
  rotation,
  rise = 2.8,
  steps = 12,
}: {
  x: number;
  z: number;
  width: number;
  length: number;
  rotation: number;
  rise?: number;
  steps?: number;
}) {
  return (
    <group position={[x, 0, z]} rotation-y={rotation} name="Escalera recta">
      {Array.from({ length: steps }).map((_, index) => {
        const tread = length / steps;
        return (
          <mesh
            key={index}
            castShadow
            receiveShadow
            position={[
              0,
              ((index + 1) * rise) / steps,
              -length / 2 + (index + 0.5) * tread,
            ]}
          >
            <boxGeometry args={[width, 0.1, tread]} />
            <meshStandardMaterial color="#a89b88" roughness={0.72} />
          </mesh>
        );
      })}
    </group>
  );
}

function DoorLeaf({
  width,
  height,
  open,
  interactive,
  onToggle,
}: {
  width: number;
  height: number;
  open: boolean;
  interactive: boolean;
  onToggle: () => void;
}) {
  const group = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const [hovered, setHovered] = useState(false);
  useFrame(() => {
    if (
      group.current &&
      Math.abs(group.current.rotation.y - (open ? -Math.PI / 2 : -0.06)) > 0.001
    ) {
      group.current.rotation.y = MathUtils.lerp(
        group.current.rotation.y,
        open ? -Math.PI / 2 : -0.06,
        0.16,
      );
      invalidate();
    }
  });
  return (
    <group
      ref={group}
      position={[-width / 2 + 0.035, height / 2, 0]}
      onClick={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        onToggle();
      }}
      onPointerOver={() => interactive && setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <mesh castShadow position={[width / 2, 0, 0]}>
        <boxGeometry args={[width - 0.08, height - 0.08, 0.055]} />
        <meshStandardMaterial
          color={hovered ? "#b48860" : "#8a6a4d"}
          emissive={hovered ? "#51311b" : "#000000"}
          emissiveIntensity={hovered ? 0.22 : 0}
          roughness={0.76}
        />
      </mesh>
      <mesh position={[width - 0.16, 0, 0.045]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial
          color="#c8a76e"
          metalness={0.55}
          roughness={0.3}
        />
      </mesh>
    </group>
  );
}

function OpeningAssembly({
  opening,
  interactive,
  open,
  onToggle,
}: {
  opening: ReturnType<typeof buildSceneModel.execute>["openings"][number];
  interactive: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const frameColor = opening.type === "window" ? "#52666a" : "#59483b";
  const frameThickness = 0.075;
  const centerY = opening.sillHeight + opening.height / 2;
  return (
    <group position={[opening.x, 0, opening.z]} rotation-y={opening.rotation}>
      <mesh castShadow position={[-opening.width / 2, centerY, 0]}>
        <boxGeometry args={[frameThickness, opening.height + 0.08, 0.18]} />
        <meshStandardMaterial color={frameColor} roughness={0.68} />
      </mesh>
      <mesh castShadow position={[opening.width / 2, centerY, 0]}>
        <boxGeometry args={[frameThickness, opening.height + 0.08, 0.18]} />
        <meshStandardMaterial color={frameColor} roughness={0.68} />
      </mesh>
      <mesh castShadow position={[0, opening.sillHeight + opening.height, 0]}>
        <boxGeometry args={[opening.width + frameThickness, 0.075, 0.18]} />
        <meshStandardMaterial color={frameColor} roughness={0.68} />
      </mesh>
      {opening.type === "window" ? (
        <>
          <mesh position={[0, centerY, 0]}>
            <boxGeometry
              args={[
                Math.max(0.05, opening.width - 0.1),
                opening.height - 0.1,
                0.035,
              ]}
            />
            <meshPhysicalMaterial
              color="#9cc7d3"
              transmission={0.72}
              transparent
              opacity={0.48}
              roughness={0.08}
            />
          </mesh>
          <mesh position={[0, opening.sillHeight, 0]}>
            <boxGeometry args={[opening.width + 0.08, 0.08, 0.22]} />
            <meshStandardMaterial color={frameColor} roughness={0.68} />
          </mesh>
          <mesh position={[0, centerY, 0.015]}>
            <boxGeometry args={[0.045, opening.height - 0.12, 0.05]} />
            <meshStandardMaterial color={frameColor} />
          </mesh>
        </>
      ) : (
        <DoorLeaf
          width={opening.width}
          height={opening.height}
          open={open}
          interactive={interactive}
          onToggle={onToggle}
        />
      )}
    </group>
  );
}

/** Procedural R3F scene generated from the semantic blueprint JSON. */
export function BuildingScene(props: BuildingSceneProps) {
  const quality = useRenderQuality();
  const settings = props.renderSettings ?? {
    exposure: 1,
    sunAzimuth: 45,
    sunElevation: 45,
    shadows: true,
  };
  const night = props.lighting === "Night";
  const sunset = props.lighting === "Sunset";
  const modelViewMode = props.modelViewMode ?? "Architecture";
  const structural = modelViewMode === "Structure";
  const scene = useMemo(
    () => buildSceneModel.execute(props.blueprint),
    [props.blueprint],
  );
  const cameraFloors =
    props.isolatedLevel && props.isolatedLevel !== "All" ? 1 : props.floors;
  const extent = Math.max(
    scene.width,
    scene.depth,
    props.siteSelection?.lotWidthM ?? 0,
    props.siteSelection?.lotDepthM ?? 0,
  );
  const elevations = props.blueprint.levels.map((level) => level.elevation);
  const baseElevation = cameraFloors === 1 ? 0 : Math.min(...elevations);
  const height =
    (cameraFloors === 1 ? 0 : Math.max(...elevations) - baseElevation) +
    Math.max(2.8, ...props.blueprint.walls.map((wall) => wall.height));
  const radius = Math.max(10, extent * 1.5);
  const azimuth = (settings.sunAzimuth * Math.PI) / 180,
    elevation = ((sunset ? 12 : settings.sunElevation) * Math.PI) / 180;
  const sun: [number, number, number] = [
    Math.cos(azimuth) * Math.cos(elevation) * radius,
    Math.sin(elevation) * radius,
    Math.sin(azimuth) * Math.cos(elevation) * radius,
  ];
  const shadows = settings.shadows && quality !== "low";
  const shadowSize = quality === "high" ? 2048 : 1024;
  const cadModel =
    !!props.blueprint.cad &&
    (props.blueprint.reconstruction?.version ?? 0) >= 2;
  const animate =
    !!props.simulation?.active || props.cameraPreset === "Walkthrough";
  const hasGeometry =
    props.blueprint.walls.length +
      props.blueprint.rooms.length +
      props.blueprint.columns.length >
      0 ||
    (props.blueprint.roofs?.length ?? 0) +
      (props.blueprint.services?.length ?? 0) >
      0;
  const background = structural
    ? "#050b17"
    : night
      ? "#11181b"
      : sunset
        ? "#e7c7a9"
        : "#e9eeeb";
  return (
    <Canvas
      shadows={shadows}
      frameloop={animate ? "always" : "demand"}
      performance={{ min: 0.7, debounce: 250 }}
      dpr={
        quality === "low"
          ? 1
          : [1, quality === "high" ? 2 : cadModel ? 1.25 : 1.5]
      }
      gl={{ antialias: quality !== "low", toneMapping: ACESFilmicToneMapping }}
    >
      <AdaptiveDpr />
      <ShadowCache
        animate={animate}
        revision={[
          props.blueprint,
          props.material,
          props.isolatedLevel,
          settings.sunAzimuth,
          settings.sunElevation,
          shadows,
        ]}
      />
      <Exposure value={settings.exposure} />
      <color attach="background" args={[background]} />
      <fog
        attach="fog"
        args={[background, Math.max(30, extent * 3), Math.max(70, extent * 8)]}
      />
      <PerspectiveCamera
        makeDefault
        fov={42}
        position={[11, 9, 12]}
        near={0.05}
        far={Math.max(1000, extent * 20)}
      />
      <CameraController
        preset={props.cameraPreset}
        height={height}
        extent={extent}
        baseElevation={baseElevation}
        modelViewMode={modelViewMode}
      />
      {!night && !structural && (
        <Sky
          distance={450000}
          sunPosition={sun}
          turbidity={sunset ? 8 : 3}
          rayleigh={sunset ? 2.6 : 1.2}
        />
      )}
      <hemisphereLight
        intensity={structural ? 0.6 : night ? 0.25 : 0.75}
        color={night ? "#789ed0" : "#ddecff"}
        groundColor={night ? "#131924" : "#a69d89"}
      />
      <directionalLight
        castShadow={shadows}
        position={sun}
        intensity={night ? 0.22 : sunset ? 2 : 2.5}
        color={sunset ? "#ffb879" : "#fff6e8"}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.025}
        shadow-camera-left={-radius}
        shadow-camera-right={radius}
        shadow-camera-top={radius}
        shadow-camera-bottom={-radius}
        shadow-camera-far={radius * 4}
      />
      {quality !== "low" && !structural && (
        <Environment
          resolution={128}
          frames={1}
          environmentIntensity={night ? 0.15 : 0.45}
        >
          <Lightformer
            intensity={3}
            color="#e9f2ff"
            scale={[20, 20, 1]}
            position={[0, 10, 0]}
            rotation-x={Math.PI / 2}
          />
          <Lightformer
            intensity={2}
            color="#fff1db"
            scale={[12, 8, 1]}
            position={[8, 4, 2]}
            rotation-y={-Math.PI / 2}
          />
        </Environment>
      )}
      {night && (
        <pointLight
          position={[0, 5, 1]}
          intensity={26}
          distance={14}
          color="#ffbe78"
        />
      )}
      {props.siteSelection &&
        !(
          props.blueprint.levels.some((level) => level.elevation < 0) &&
          props.isolatedLevel === "All"
        ) && <LotTerrain selection={props.siteSelection} />}
      {hasGeometry && cadModel ? (
        <CadBuilding
          selectedId={props.selectedElementId}
          onSelectElement={props.onSelectElement}
          blueprint={props.blueprint}
          finish={materialMap[props.material]}
          isolatedLevel={props.isolatedLevel ?? "All"}
          interactive={props.cameraPreset === "Walkthrough"}
          structural={structural}
          simulation={props.simulation}
          showRoof={props.showRoof}
        />
      ) : (
        hasGeometry && (
          <Building
            blueprint={props.blueprint}
            floors={props.floors}
            material={props.material}
            modelViewMode={modelViewMode}
            showRoof={props.showRoof}
            simulation={props.simulation}
            isolatedLevel={props.isolatedLevel}
            interactive={props.cameraPreset === "Walkthrough"}
            selectedElementId={props.selectedElementId}
            onSelectElement={props.onSelectElement}
          />
        )
      )}
      <Grid
        infiniteGrid
        fadeDistance={32}
        fadeStrength={3}
        cellSize={0.5}
        sectionSize={2.5}
        cellColor={structural ? "#153149" : night ? "#36434a" : "#aeb7af"}
        sectionColor={structural ? "#20547b" : night ? "#53636a" : "#828e84"}
        position={[0, baseElevation - 0.22, 0]}
      />
      {cadModel && (
        <mesh
          receiveShadow
          rotation-x={-Math.PI / 2}
          position-y={baseElevation - 0.24}
        >
          <planeGeometry args={[extent * 8, extent * 8]} />
          <shadowMaterial transparent opacity={0.18} />
        </mesh>
      )}
      {shadows && !cadModel && (
        <ContactShadows
          key={`${props.isolatedLevel}-${props.material}-${props.showRoof}-${props.lighting}`}
          frames={animate ? Infinity : 1}
          position={[0, -0.15, 0]}
          opacity={night ? 0.2 : 0.3}
          scale={Math.max(scene.width, scene.depth) * 1.5}
          blur={2.5}
          far={height + 2}
          resolution={quality === "high" ? 512 : 256}
        />
      )}
      {props.cameraPreset === "Walkthrough" ? (
        <WalkthroughController width={scene.width} depth={scene.depth} />
      ) : (
        <SmoothOrbitControls
          extent={extent}
          targetY={baseElevation + height * 0.4}
        />
      )}
    </Canvas>
  );
}

/** Camera motion invalidates demand frames; lowering DPR during a gesture keeps orbit responsive. */
function SmoothOrbitControls({
  extent,
  targetY,
}: {
  extent: number;
  targetY: number;
}) {
  const performance = useThree((s) => s.performance);
  const target = useMemo<[number, number, number]>(
    () => [0, targetY, 0],
    [targetY],
  );
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.65}
      zoomSpeed={0.8}
      panSpeed={0.8}
      minDistance={0.8}
      maxDistance={Math.max(48, extent * 5)}
      maxPolarAngle={Math.PI / 2.01}
      target={target}
      onStart={() => performance.regress()}
    />
  );
}

/** Sun shadows depend on geometry and lighting, not on the orbit camera. Reuse them while inspecting. */
function ShadowCache({
  animate,
  revision,
}: {
  animate: boolean;
  revision: unknown[];
}) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    // Three's imperative renderer owns this cache; React state is not being mutated.
    /* eslint-disable react-hooks/immutability */
    gl.shadowMap.autoUpdate = animate;
    gl.shadowMap.needsUpdate = true;
    /* eslint-enable react-hooks/immutability */
    invalidate();
  }, [gl, invalidate, animate, revision]);
  return null;
}

/** Exposure is a renderer property, not a mutation of materials or source geometry. */
function Exposure({ value }: { value: number }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    applyProps(gl, { toneMappingExposure: value });
    invalidate();
  }, [gl, value, invalidate]);
  return null;
}
