"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  Object3D,
  Path,
  Shape,
  type Group,
  type InstancedMesh,
  type MeshStandardMaterialParameters,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import { geometryOnLevel } from "@/bounded-contexts/plan-digitization/domain/plan-levels";
import { buildSceneModel } from "../../application/use-cases/build-scene-model";

type Box = {
  id?: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation?: number;
};
type Scene = ReturnType<typeof buildSceneModel.execute>;

/** One unit cube and one material per batch, instead of one WebGL draw call per wall/frame/tread. */
function BoxBatch({
  boxes,
  material,
  onClick,
  shadows = true,
}: {
  boxes: Box[];
  material: MeshStandardMaterialParameters;
  onClick?: (index: number) => void;
  shadows?: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null),
    invalidate = useThree((s) => s.invalidate),
    gl = useThree((s) => s.gl);
  // This effect updates Three.js GPU resources, not React-owned state.
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const transform = new Object3D();
    boxes.forEach((box, i) => {
      transform.position.set(box.x, box.y, box.z);
      transform.rotation.set(0, box.rotation ?? 0, 0);
      transform.scale.set(
        Math.max(0.001, box.width),
        Math.max(0.001, box.height),
        Math.max(0.001, box.depth),
      );
      transform.updateMatrix();
      mesh.current!.setMatrixAt(i, transform.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    // Refresh cached shadows when an instance moves (for example, an opening door), not on every orbit frame.
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [boxes, invalidate, gl]);
  /* eslint-enable react-hooks/immutability */
  if (!boxes.length) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, boxes.length]}
      castShadow={shadows}
      receiveShadow
      onClick={
        onClick
          ? (event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              if (event.instanceId !== undefined) onClick(event.instanceId);
            }
          : undefined
      }
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial key={String(material.transparent)} {...material} />
    </instancedMesh>
  );
}

function FloorSurfaces({
  plan,
  scene,
  elevation = 0,
}: {
  plan: Blueprint;
  scene: Scene;
  elevation?: number;
}) {
  const geometry = useMemo(() => {
    const parts = (plan.slabs ?? []).map((slab) => {
      const contour = (points: Array<[number, number]>, path: Shape | Path) => {
        points.forEach(([x, y], i) => {
          const px = (x - scene.centerX) / scene.scale,
            py = (y - scene.centerY) / scene.scale;
          if (i === 0) path.moveTo(px, py);
          else path.lineTo(px, py);
        });
        path.closePath();
      };
      const shape = new Shape();
      contour(slab.polygon, shape);
      for (const hole of slab.holes) {
        const path = new Path();
        contour(hole, path);
        shape.holes.push(path);
      }
      const part = new ExtrudeGeometry(shape, {
        depth: slab.thickness,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 1,
      });
      part.rotateX(Math.PI / 2);
      return part;
    });
    const merged = parts.length ? mergeGeometries(parts, false) : null;
    parts.forEach((p) => p.dispose());
    return merged;
  }, [plan.slabs, scene.centerX, scene.centerY, scene.scale]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? (
    <mesh geometry={geometry} position-y={elevation} castShadow receiveShadow>
      <meshStandardMaterial color="#c9c9c3" roughness={0.92} />
    </mesh>
  ) : null;
}

function CadRoofs({ plan, scene }: { plan: Blueprint; scene: Scene }) {
  const roofs = useMemo(
    () =>
      (plan.roofs ?? []).map((r) => ({
        roof: r,
        plan: {
          ...plan,
          slabs: [
            {
              id: r.id,
              levelId: r.levelId,
              name: r.name,
              thickness: r.thickness,
              holes: [],
              polygon:
                r.polygon ??
                ([
                  [r.x, r.y],
                  [r.x + r.width, r.y],
                  [r.x + r.width, r.y + r.depth],
                  [r.x, r.y + r.depth],
                ] as Array<[number, number]>),
            },
          ],
        },
      })),
    [plan],
  );
  return (
    <>
      {roofs.map(({ roof, plan }) => (
        <FloorSurfaces
          key={roof.id}
          plan={plan}
          scene={scene}
          elevation={roof.elevation + roof.thickness}
        />
      ))}
    </>
  );
}

/** Source furniture is shown as precise floor linework when inspecting a level, without invented extruded boxes. */
function FloorDetails({ plan, scene }: { plan: Blueprint; scene: Scene }) {
  const geometry = useMemo(() => {
    const coords = (plan.floorDetails ?? []).flatMap((d) => d.segments),
      vertices: number[] = [];
    for (let i = 0; i < coords.length; i += 4)
      vertices.push(
        (coords[i] - scene.centerX) / scene.scale,
        0.025,
        (coords[i + 1] - scene.centerY) / scene.scale,
        (coords[i + 2] - scene.centerX) / scene.scale,
        0.025,
        (coords[i + 3] - scene.centerY) / scene.scale,
      );
    const result = new BufferGeometry();
    result.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(vertices), 3),
    );
    return result;
  }, [plan.floorDetails, scene.centerX, scene.centerY, scene.scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#65756b" transparent opacity={0.65} />
    </lineSegments>
  );
}

const frameMaterial = { color: "#53626a", roughness: 0.58 };
const glassMaterial = {
  color: "#91b4c0",
  roughness: 0.25,
  metalness: 0.05,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
};
const doorMaterial = { color: "#a0907e", roughness: 0.8 };
const slabMaterial = { color: "#c9c9c3", roughness: 0.92 };

function CadLevel({
  plan,
  scene,
  finish,
  interactive,
  details,
  structural,
  showRoof,
}: {
  plan: Blueprint;
  scene: Scene;
  finish: MeshStandardMaterialParameters;
  interactive: boolean;
  details: boolean;
  structural: boolean;
  showRoof: boolean;
}) {
  const [openDoors, setOpenDoors] = useState<Set<string>>(new Set());
  const batches = useMemo(() => {
    const walls: Box[] = scene.wallSegments.map((w) => ({
      x: w.x,
      y: w.y,
      z: w.z,
      width: w.length,
      height: w.height,
      depth: w.thickness,
      rotation: w.rotation,
    }));
    const columns: Box[] = plan.columns.map((c) => ({
      x: (c.x - scene.centerX) / scene.scale,
      y: (c.height ?? 2.8) / 2,
      z: (c.y - scene.centerY) / scene.scale,
      width: c.size / scene.scale,
      height: c.height ?? 2.8,
      depth: (c.depth ?? c.size) / scene.scale,
      rotation: (-(c.rotation ?? 0) * Math.PI) / 180,
    }));
    const frames: Box[] = [],
      glass: Box[] = [],
      doors: Box[] = [],
      stairs: Box[] = [];
    for (const opening of scene.openings) {
      const place = (
        x: number,
        y: number,
        z: number,
        width: number,
        height: number,
        depth: number,
        rotation = 0,
      ): Box => ({
        id: opening.id,
        x:
          opening.x +
          Math.cos(opening.rotation) * x +
          Math.sin(opening.rotation) * z,
        y,
        z:
          opening.z -
          Math.sin(opening.rotation) * x +
          Math.cos(opening.rotation) * z,
        width,
        height,
        depth,
        rotation: opening.rotation + rotation,
      });
      const centerY = opening.sillHeight + opening.height / 2,
        w = opening.width,
        h = opening.height,
        t = 0.045;
      frames.push(
        place(-w / 2, centerY, 0, t, h, 0.12),
        place(w / 2, centerY, 0, t, h, 0.12),
        place(0, opening.sillHeight + h, 0, w, t, 0.12),
      );
      if (opening.type === "window") {
        frames.push(
          place(0, opening.sillHeight, 0, w, t, 0.14),
          place(0, centerY, 0, 0.03, h, 0.06),
        );
        glass.push(
          place(
            0,
            centerY,
            0,
            Math.max(0.05, w - 0.06),
            Math.max(0.05, h - 0.06),
            0.018,
          ),
        );
      } else {
        const angle = openDoors.has(opening.id) ? -Math.PI / 2 : 0;
        doors.push(
          place(
            -w / 2 + (Math.cos(angle) * w) / 2,
            centerY,
            (-Math.sin(angle) * w) / 2,
            Math.max(0.05, w - 0.05),
            h - 0.04,
            0.04,
            angle,
          ),
        );
      }
    }
    for (const stair of plan.stairs ?? []) {
      const steps = stair.stepCount ?? 12,
        rise = stair.rise ?? 2.8,
        width = (stair.radius * 2) / scene.scale,
        length = (stair.length ?? stair.radius * 4) / scene.scale,
        rotation = (-(stair.rotation ?? 0) * Math.PI) / 180;
      const x = (stair.x - scene.centerX) / scene.scale,
        z = (stair.y - scene.centerY) / scene.scale,
        base = stair.baseElevation ?? 0;
      for (let i = 0; i < steps; i++) {
        const at = -length / 2 + ((i + 0.5) * length) / steps,
          h = ((i + 1) * rise) / steps;
        stairs.push({
          x: x + Math.sin(rotation) * at,
          y: base + h / 2,
          z: z + Math.cos(rotation) * at,
          width,
          height: h,
          depth: length / steps + 0.002,
          rotation,
        });
      }
    }
    const services: Box[] = (plan.services ?? []).map((p) => ({
      x: (p.x - scene.centerX) / scene.scale,
      z: (p.y - scene.centerY) / scene.scale,
      y: p.kind === "drain" ? 0.1 : 1.15,
      width: 0.16,
      height: 0.16,
      depth: 0.16,
    }));
    return { walls, columns, frames, glass, doors, stairs, services };
  }, [plan, scene, openDoors]);
  return (
    <>
      <FloorSurfaces plan={plan} scene={scene} />
      {showRoof && <CadRoofs plan={plan} scene={scene} />}
      <BoxBatch
        boxes={batches.columns}
        material={structural ? { color: "#789eac", roughness: 0.75 } : finish}
      />
      <BoxBatch
        boxes={batches.walls}
        material={
          structural
            ? {
                color: "#899baa",
                transparent: true,
                opacity: 0.2,
                depthWrite: false,
              }
            : finish
        }
      />
      {!structural && (
        <>
          <BoxBatch boxes={batches.frames} material={frameMaterial} />
          <BoxBatch
            boxes={batches.glass}
            material={glassMaterial}
            shadows={false}
          />
          <BoxBatch
            boxes={batches.doors}
            material={doorMaterial}
            onClick={
              interactive
                ? (i) =>
                    setOpenDoors((current) => {
                      const next = new Set(current),
                        id = batches.doors[i].id!;
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                : undefined
            }
          />
        </>
      )}
      <BoxBatch boxes={batches.stairs} material={slabMaterial} />
      {details && (
        <BoxBatch
          boxes={batches.services}
          material={{ color: "#248ab3", roughness: 0.6 }}
          shadows={false}
        />
      )}
      {details && !structural && <FloorDetails plan={plan} scene={scene} />}
    </>
  );
}

/** Batches remain separate by level, enabling isolation without rebuilding all GPU geometry on orbit. */
export function CadBuilding({
  blueprint,
  finish,
  isolatedLevel,
  interactive,
  structural,
  simulation,
  showRoof,
}: {
  blueprint: Blueprint;
  finish: MeshStandardMaterialParameters;
  isolatedLevel: number | "All";
  interactive: boolean;
  structural: boolean;
  showRoof: boolean;
  simulation?: { active: boolean; intensity: number; direction: "X" | "Y" };
}) {
  const groups = useRef<Array<Group | null>>([]);
  const scene = useMemo(() => buildSceneModel.execute(blueprint), [blueprint]);
  const levels = useMemo(
    () =>
      blueprint.levels.map((level) => {
        const plan = geometryOnLevel(blueprint, level.id);
        return { level, plan, scene: buildSceneModel.execute(plan, scene) };
      }),
    [blueprint, scene],
  );
  useFrame(({ clock }) => {
    if (!simulation?.active) return;
    groups.current.forEach((group, i) => {
      if (!group) return;
      const shift =
        Math.sin(clock.elapsedTime * 7) *
        simulation.intensity *
        0.022 *
        ((i + 1) / levels.length);
      group.position.x = simulation.direction === "X" ? shift : 0;
      group.position.z = simulation.direction === "Y" ? shift : 0;
    });
  });
  useEffect(() => {
    if (!simulation?.active)
      groups.current.forEach((group) => {
        if (group) {
          group.position.x = 0;
          group.position.z = 0;
        }
      });
  }, [simulation?.active]);
  return (
    <group>
      {levels.map(
        ({ level, plan, scene }, i) =>
          (isolatedLevel === "All" || isolatedLevel === i + 1) && (
            <group
              key={level.id}
              ref={(node) => {
                groups.current[i] = node;
              }}
              position-y={isolatedLevel === "All" ? level.elevation : 0}
            >
              <CadLevel
                plan={plan}
                scene={scene}
                finish={finish}
                interactive={interactive}
                structural={structural}
                showRoof={showRoof}
                details={isolatedLevel !== "All" || interactive}
              />
            </group>
          ),
      )}
    </group>
  );
}
