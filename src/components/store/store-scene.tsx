"use client";

/*
 * Same exemption as vision/character.tsx, for the same reason: `useFrame` is a
 * callback the React Compiler's lint rules read as running during render, and
 * moving three.js objects every frame is how R3F is meant to be driven. Going
 * through React state instead would put a 60 Hz signal back in the render path.
 */
/* eslint-disable react-hooks/immutability */

import { useEnvironment, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

import { KITS, type KitSlug, storeLayout, toWeb } from "@/content/store";

import {
  asGltfTexture,
  closeUpMaterial,
  kitUrl,
  loadKit,
  type KitResolution,
  railMaterial,
  ROOM_EXPOSURE,
} from "./kit-material";
import type { StoreBridge, StoreView } from "./store-bridge";

const { cctv, jerseys, mirror, rack } = storeLayout;

/** A phone gets the walls at a quarter of the pixels: at 4096 they alone would
 *  take 85 MB of its graphics memory, and on that screen nobody could tell. */
const bakeUrls = (small: boolean) => [
  small ? "/store/bake/walls-2k.webp" : "/store/bake/walls.webp",
  "/store/bake/floor.webp",
  "/store/bake/props.webp",
];
const RAIL_URLS = KITS.map((kit) => kitUrl(kit.slug, "1k"));
const SHIRT_URL = "/store/jersey.glb";
const ROOM_URL = "/store/store.glb";

/** The shirt's middle, in its own coordinates: what it turns around. */
const SHIRT_CENTRE = 0.4;

/** The lens the poster was rendered through, as a horizontal field of view. */
const CCTV_HFOV = 2 * Math.atan(18 / cctv.lens);

/** Past the counter's far edge, so its corner stays out of shot. */
const WALL_EYE = { y: 0.94, z: 1.58 };

/** Hit areas, in Blender coordinates: centre and size. */
const ZONES = [
  { id: "wall", centre: [0, 2.45, 1.55], size: [7.2, 0.8, 1.7] },
  { id: "wall", centre: [3.3, 0.3, 1.35], size: [0.9, 4.3, 1.5] },
  { id: "wall", centre: [-2.3, -2.15, 1.35], size: [2.9, 0.9, 1.5] },
  { id: "mirror", centre: [mirror.x, (mirror.y0 + mirror.y1) / 2, (mirror.z0 + mirror.z1) / 2], size: [0.1, mirror.y1 - mirror.y0, mirror.z1 - mirror.z0] },
] as const;

/** Where the floor's labels pin to the scene. */
const PINS: Record<string, [number, number, number]> = {
  wall: toWeb(0.2, 2.5, 2.08),
  rail: toWeb(3.3, 0.8, 2.05),
  mirror: toWeb(mirror.x, (mirror.y0 + mirror.y1) / 2, 1.6),
};

interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

function verticalFov(horizontal: number, aspect: number): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontal / 2) / aspect));
}

function poseFor(view: StoreView, bridge: StoreBridge, aspect: number): Pose {
  if (view.name === "mirror") {
    // Close enough that the glass covers the screen, whatever its shape.
    const fov = 40;
    const width = mirror.y1 - mirror.y0;
    const height = mirror.z1 - mirror.z0;
    const visible = Math.min(height, width / aspect) * 0.97;
    const distance = visible / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const y = (mirror.y0 + mirror.y1) / 2;
    const z = 1.32;
    return {
      position: new THREE.Vector3(...toWeb(mirror.x + distance, y, z)),
      target: new THREE.Vector3(...toWeb(mirror.x, y, z)),
      fov,
    };
  }

  if (view.name === "wall" || view.name === "shirt") {
    const index = view.name === "shirt" ? jerseys.findIndex((j) => j.slug === view.slug) : bridge.wallFocus;
    const x = jerseys[0].x + index * storeLayout.peg.spacing;
    return {
      position: new THREE.Vector3(...toWeb(x, WALL_EYE.y, WALL_EYE.z)),
      target: new THREE.Vector3(...toWeb(x, jerseys[0].y, 1.5)),
      // A phone sees one shirt at a time, a monitor three or so.
      fov: aspect < 1 ? 64 : 49,
    };
  }

  return {
    position: new THREE.Vector3(...toWeb(cctv.position[0], cctv.position[1], cctv.position[2])),
    target: new THREE.Vector3(...toWeb(cctv.target[0], cctv.target[1], cctv.target[2])),
    fov: Math.min(78, verticalFov(CCTV_HFOV, aspect)),
  };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function CameraRig({
  view,
  bridge,
  reducedMotion,
  onArrive,
}: {
  view: StoreView;
  bridge: StoreBridge;
  reducedMotion: boolean;
  onArrive: (view: StoreView["name"]) => void;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const domElement = useThree((state) => state.gl.domElement);

  const motion = useRef({
    from: null as Pose | null,
    to: null as Pose | null,
    current: null as Pose | null,
    t: 1,
    duration: 1.5,
    view: view.name as StoreView["name"],
    arrived: false,
    glance: new THREE.Vector2(),
    glanceGoal: new THREE.Vector2(),
    pan: 0,
  });

  // The corner camera can look around a little: towards the pointer on a
  // computer, and by dragging on a phone, whose screen shows less of the room.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = domElement.getBoundingClientRect();
      motion.current.glanceGoal.set(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        -(((event.clientY - box.top) / box.height) * 2 - 1),
      );
      invalidate();
    };
    let lastX: number | null = null;
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") lastX = event.clientX;
    };
    const onDrag = (event: PointerEvent) => {
      if (lastX === null || event.pointerType !== "touch") return;
      const span = domElement.clientWidth || 1;
      const pan = motion.current.pan - ((event.clientX - lastX) / span) * 2.4;
      motion.current.pan = THREE.MathUtils.clamp(pan, -1.6, 1.6);
      lastX = event.clientX;
      invalidate();
    };
    const onUp = () => {
      lastX = null;
    };
    domElement.addEventListener("pointermove", onMove);
    domElement.addEventListener("pointerdown", onDown);
    domElement.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", onUp);
    return () => {
      domElement.removeEventListener("pointermove", onMove);
      domElement.removeEventListener("pointerdown", onDown);
      domElement.removeEventListener("pointermove", onDrag);
      window.removeEventListener("pointerup", onUp);
    };
  }, [domElement, invalidate]);

  useFrame((_, delta) => {
    const m = motion.current;
    const aspect = size.width / Math.max(size.height, 1);
    const goal = poseFor(view, bridge, aspect);

    const moved =
      !m.to || m.to.position.distanceToSquared(goal.position) > 1e-6 || m.to.fov !== goal.fov;
    if (moved) {
      const changedView = m.view !== view.name;
      m.from = m.current
        ? { position: m.current.position.clone(), target: m.current.target.clone(), fov: m.current.fov }
        : goal;
      m.to = goal;
      m.t = !m.current || reducedMotion ? 1 : 0;
      m.duration = changedView ? (view.name === "mirror" ? 1.9 : 1.5) : 0.7;
      m.view = view.name;
      m.arrived = false;
    }

    m.t = Math.min(1, m.t + delta / m.duration);
    const eased = easeInOut(m.t);
    const from = m.from ?? goal;
    const to = m.to ?? goal;

    m.current ??= { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: goal.fov };
    m.current.position.lerpVectors(from.position, to.position, eased);
    m.current.target.lerpVectors(from.target, to.target, eased);
    m.current.fov = THREE.MathUtils.lerp(from.fov, to.fov, eased);

    // Looking around only applies on the sales floor.
    const free = view.name === "overview" && !reducedMotion;
    const goalX = free ? m.glanceGoal.x : 0;
    const goalY = free ? m.glanceGoal.y : 0;
    m.glance.x = THREE.MathUtils.damp(m.glance.x, goalX, 4, delta);
    m.glance.y = THREE.MathUtils.damp(m.glance.y, goalY, 4, delta);

    const look = new THREE.Vector3().copy(m.current.target);
    const forward = new THREE.Vector3().subVectors(m.current.target, m.current.position).normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const panning = view.name === "overview" ? m.pan : 0;
    look.addScaledVector(right, m.glance.x * 0.42 + panning);
    look.addScaledVector(camera.up, m.glance.y * 0.24);

    camera.position.copy(m.current.position);
    camera.lookAt(look);
    if (camera.fov !== m.current.fov) {
      camera.fov = m.current.fov;
      camera.updateProjectionMatrix();
    }

    const glancing = Math.abs(m.glance.x - goalX) + Math.abs(m.glance.y - goalY) > 0.001;
    if (m.t < 1 || glancing) invalidate();
    if (m.t >= 1 && !m.arrived) {
      m.arrived = true;
      onArrive(view.name);
    }
  });

  return null;
}

function Room({ small }: { small: boolean }) {
  const { scene } = useGLTF(ROOM_URL);
  const bakes = useTexture(bakeUrls(small));

  const room = useMemo(() => {
    const [walls, floor, props] = bakes.map((texture) => asGltfTexture(texture, true, 8));
    const baked: Record<string, THREE.Material> = {
      Walls: new THREE.MeshBasicMaterial({ map: walls }),
      Floor: new THREE.MeshBasicMaterial({ map: floor }),
      Props: new THREE.MeshBasicMaterial({ map: props }),
      Glow: new THREE.MeshBasicMaterial({ color: "#fffaf2" }),
      Chrome: new THREE.MeshStandardMaterial({
        color: "#eceded",
        metalness: 1,
        roughness: 0.14,
      }),
    };
    const clone = scene.clone(true);
    clone.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = Object.keys(baked).find((key) => mesh.name.startsWith(key));
      if (name) mesh.material = baked[name];
      else mesh.visible = false;
    });
    return clone;
  }, [scene, bakes]);

  return <primitive object={room} />;
}

function Mirror() {
  const glass = useMemo(() => {
    const width = mirror.y1 - mirror.y0;
    const height = mirror.z1 - mirror.z0;
    const reflector = new Reflector(new THREE.PlaneGeometry(width, height), {
      textureWidth: 1024,
      textureHeight: 1024,
      clipBias: 0.003,
      color: 0x7c8081,
      multisample: 4,
    });
    reflector.position.set(...toWeb(mirror.x + 0.004, (mirror.y0 + mirror.y1) / 2, (mirror.z0 + mirror.z1) / 2));
    reflector.rotation.y = Math.PI / 2;
    return reflector;
  }, []);

  useEffect(() => () => glass.dispose(), [glass]);
  return <primitive object={glass} />;
}

function RailShirts({ normal }: { normal: THREE.Texture }) {
  const { nodes } = useGLTF(ROOM_URL);
  const maps = useTexture(RAIL_URLS);

  const groups = useMemo(() => {
    const geometry = (nodes.ShirtLOD as THREE.Mesh).geometry;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3(1, 1, 1);
    return KITS.flatMap((kit, index) => {
      const shirts = rack.filter((shirt) => shirt.slug === kit.slug);
      if (shirts.length === 0) return [];
      const map = asGltfTexture(maps[index], true, 4);
      const mesh = new THREE.InstancedMesh(geometry, railMaterial(map, normal), shirts.length);
      shirts.forEach((shirt, i) => {
        rotation.setFromAxisAngle(up, shirt.turn);
        matrix.compose(new THREE.Vector3(...toWeb(shirt.x, shirt.y, shirt.z)), rotation, scale);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      return [mesh];
    });
  }, [nodes, maps, normal]);

  return groups.map((mesh) => <primitive key={mesh.uuid} object={mesh} />);
}

const LABEL_LIGHT = { intensity: 1.1, position: [1.5, 3, 2.5] as const };

function Wall({
  view,
  bridge,
  normal,
  knit,
  onShirt,
  resolution,
}: {
  view: StoreView;
  bridge: StoreBridge;
  normal: THREE.Texture;
  knit: THREE.Texture;
  onShirt: (slug: KitSlug) => void;
  resolution: KitResolution;
}) {
  const { nodes } = useGLTF(SHIRT_URL);
  const maps = useTexture(RAIL_URLS);
  const invalidate = useThree((state) => state.invalidate);
  const domElement = useThree((state) => state.gl.domElement);
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);

  const geometry = useMemo(() => {
    const skinned = Object.values(nodes).find((node) => (node as THREE.SkinnedMesh).isSkinnedMesh);
    return (skinned as THREE.SkinnedMesh).geometry;
  }, [nodes]);

  const shirts = useMemo(
    () =>
      jerseys.map((jersey) => {
        const index = KITS.findIndex((kit) => kit.slug === jersey.slug);
        const material = railMaterial(asGltfTexture(maps[index], true, 8), normal);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.morphTargetInfluences = [1];
        mesh.position.set(...toWeb(jersey.x, jersey.y, jersey.z));
        mesh.userData.home = mesh.position.clone();
        mesh.userData.slug = jersey.slug;
        mesh.userData.push = 0;
        return mesh;
      }),
    [geometry, maps, normal],
  );

  // The shirt in the hand: one mesh, whichever kit it is showing.
  const [held] = useState(() => new THREE.Group());
  const heldMesh = useMemo(() => {
    const mesh = new THREE.Mesh(geometry, shirts[0].material);
    mesh.morphTargetInfluences = [1];
    mesh.position.y = -SHIRT_CENTRE;
    return mesh;
  }, [geometry, shirts]);

  useLayoutEffect(() => {
    held.add(heldMesh);
    return () => {
      held.remove(heldMesh);
    };
  }, [held, heldMesh]);

  const scrim = useRef<THREE.Mesh>(null);
  const motion = useRef({
    progress: 0,
    slug: null as KitSlug | null,
    yaw: 0,
    pitch: 0,
    zoom: 0,
    lift: 0,
    shift: 0,
  });

  const holding = view.name === "shirt" ? view.slug : null;

  // Swap in the sharp texture once it has arrived, while the shirt is on its way.
  useEffect(() => {
    if (!holding) return;
    let current = true;
    const rail = shirts.find((shirt) => shirt.userData.slug === holding);
    if (rail) heldMesh.material = rail.material;
    void loadKit(holding, resolution).then((texture) => {
      if (!current) {
        texture.dispose();
        return;
      }
      heldMesh.material = closeUpMaterial(texture, normal, knit, { backfaces: true });
      invalidate();
    });
    return () => {
      current = false;
    };
  }, [holding, heldMesh, knit, normal, resolution, shirts, invalidate]);

  // Dragging turns the shirt, scrolling or pinching brings it closer.
  useEffect(() => {
    if (!holding) return;
    const points = new Map<number, { x: number; y: number }>();
    let spread = 0;

    const onDown = (event: PointerEvent) => {
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      domElement.setPointerCapture(event.pointerId);
      if (points.size === 2) {
        const [a, b] = [...points.values()];
        spread = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (event: PointerEvent) => {
      const point = points.get(event.pointerId);
      if (!point) return;
      if (points.size === 1) {
        bridge.yaw += (event.clientX - point.x) * 0.0085;
        bridge.pitch = THREE.MathUtils.clamp(bridge.pitch + (event.clientY - point.y) * 0.005, -0.7, 0.8);
      }
      point.x = event.clientX;
      point.y = event.clientY;
      if (points.size === 2) {
        const [a, b] = [...points.values()];
        const next = Math.hypot(a.x - b.x, a.y - b.y);
        bridge.zoom = THREE.MathUtils.clamp(bridge.zoom + (next - spread) * 0.004, 0, 1);
        spread = next;
      }
      invalidate();
    };
    const onUp = (event: PointerEvent) => {
      points.delete(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      bridge.zoom = THREE.MathUtils.clamp(bridge.zoom - event.deltaY * 0.0012, 0, 1);
      invalidate();
    };

    domElement.addEventListener("pointerdown", onDown);
    domElement.addEventListener("pointermove", onMove);
    domElement.addEventListener("pointerup", onUp);
    domElement.addEventListener("pointercancel", onUp);
    domElement.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      domElement.removeEventListener("pointerdown", onDown);
      domElement.removeEventListener("pointermove", onMove);
      domElement.removeEventListener("pointerup", onUp);
      domElement.removeEventListener("pointercancel", onUp);
      domElement.removeEventListener("wheel", onWheel);
    };
  }, [holding, domElement, bridge, invalidate]);

  useFrame((_, delta) => {
    const m = motion.current;
    if (holding) m.slug = holding;

    const goal = holding ? 1 : 0;
    m.progress = THREE.MathUtils.damp(m.progress, goal, 4.2, delta);
    if (Math.abs(m.progress - goal) < 0.002) m.progress = goal;

    m.yaw = THREE.MathUtils.damp(m.yaw, bridge.yaw, 7, delta);
    m.pitch = THREE.MathUtils.damp(m.pitch, bridge.pitch, 7, delta);
    m.zoom = THREE.MathUtils.damp(m.zoom, bridge.zoom, 7, delta);
    m.lift = THREE.MathUtils.damp(m.lift, bridge.lift, 7, delta);
    m.shift = THREE.MathUtils.damp(m.shift, bridge.shift, 7, delta);

    const slug = m.slug;
    const home = shirts.find((shirt) => shirt.userData.slug === slug);
    const aspect = size.width / Math.max(size.height, 1);

    held.visible = m.progress > 0.001 && !!home;
    if (home) {
      const peg = home.userData.home as THREE.Vector3;
      // In front of the eye the camera is heading for, and to the left of the
      // details panel on a wide screen.
      // Never past the scrim, at 1.5 m. A tall screen has the panel below, so the
      // shirt goes up into the half that is left.
      const distance = THREE.MathUtils.lerp(aspect < 1 ? 1.42 : 1.22, 0.56, m.zoom);
      const sideways = aspect < 1 ? 0 : -0.24 * (1 - m.zoom * 0.7);
      const raised = aspect < 1 ? 0.36 * (1 - m.zoom * 0.5) : 0;
      const front = new THREE.Vector3(
        peg.x + sideways + m.shift,
        WALL_EYE.z - 0.06 + raised + m.lift * m.zoom,
        -WALL_EYE.y - distance,
      );
      held.position.lerpVectors(
        new THREE.Vector3(peg.x, peg.y + SHIRT_CENTRE, peg.z),
        front,
        easeInOut(m.progress),
      );
      held.rotation.set(m.pitch * m.progress, m.yaw * m.progress, 0);
      if (heldMesh.morphTargetInfluences) heldMesh.morphTargetInfluences[0] = 1 - m.progress;
    }

    if (!holding && m.progress === 0 && heldMesh.material !== shirts[0].material) {
      const previous = heldMesh.material as THREE.Material;
      if (!shirts.some((shirt) => shirt.material === previous)) previous.dispose();
      heldMesh.material = shirts[0].material;
    }

    let settling =
      m.progress !== goal ||
      Math.abs(m.yaw - bridge.yaw) +
        Math.abs(m.pitch - bridge.pitch) +
        Math.abs(m.zoom - bridge.zoom) +
        Math.abs(m.lift - bridge.lift) +
        Math.abs(m.shift - bridge.shift) >
        0.0008;

    // A hovered shirt comes off the wall a little, towards the shopper.
    for (const shirt of shirts) {
      const hovered = view.name === "wall" && bridge.hovered === shirt.userData.slug;
      shirt.userData.push = THREE.MathUtils.damp(shirt.userData.push, hovered ? 1 : 0, 9, delta);
      shirt.position.z = shirt.userData.home.z + shirt.userData.push * 0.09;
      shirt.rotation.y = shirt.userData.push * -0.07;
      shirt.visible = !(shirt.userData.slug === slug && m.progress > 0.001);
      if (Math.abs(shirt.userData.push - (hovered ? 1 : 0)) > 0.002) settling = true;
    }

    // The scrim hangs behind the held shirt and in front of the room.
    if (scrim.current) {
      scrim.current.visible = m.progress > 0.002;
      scrim.current.position.copy(camera.position);
      scrim.current.quaternion.copy(camera.quaternion);
      scrim.current.translateZ(-1.5);
      (scrim.current.material as THREE.MeshBasicMaterial).opacity = m.progress * 0.86;
    }

    if (settling) invalidate();
  });

  const onOver = (slug: KitSlug) => (event: ThreeEvent<PointerEvent>) => {
    if (view.name !== "wall") return;
    event.stopPropagation();
    bridge.hovered = slug;
    domElement.style.cursor = "pointer";
    invalidate();
  };
  const onOut = () => {
    bridge.hovered = null;
    domElement.style.cursor = "";
    invalidate();
  };

  return (
    <>
      {shirts.map((shirt) => (
        <primitive
          key={shirt.uuid}
          object={shirt}
          onPointerOver={onOver(shirt.userData.slug)}
          onPointerOut={onOut}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            if (view.name !== "wall") return;
            event.stopPropagation();
            onOut();
            onShirt(shirt.userData.slug);
          }}
        />
      ))}
      <mesh ref={scrim} visible={false} renderOrder={1}>
        <planeGeometry args={[9, 6]} />
        <meshBasicMaterial color="#f3efea" transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive object={held} />
    </>
  );
}

function Zones({ onZone }: { onZone: (zone: "wall" | "mirror") => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const domElement = useThree((state) => state.gl.domElement);

  useEffect(
    () => () => {
      domElement.style.cursor = "";
    },
    [domElement],
  );

  return ZONES.map((zone, index) => (
    <mesh
      key={index}
      position={toWeb(zone.centre[0], zone.centre[1], zone.centre[2])}
      onClick={(event) => {
        event.stopPropagation();
        onZone(zone.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        domElement.style.cursor = "pointer";
        invalidate();
      }}
      onPointerOut={() => {
        domElement.style.cursor = "";
      }}
    >
      <boxGeometry args={[zone.size[0], zone.size[2], zone.size[1]]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  ));
}

function Pins({ bridge }: { bridge: StoreBridge }) {
  const size = useThree((state) => state.size);
  const point = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    for (const [id, element] of bridge.pins) {
      const anchor = PINS[id];
      if (!anchor) continue;
      point.set(...anchor).project(camera);
      // Kept on screen: a phone shows less of the room than the labels point at.
      const edge = Math.min(72, size.width / 4);
      const x = THREE.MathUtils.clamp((point.x * 0.5 + 0.5) * size.width, edge, size.width - edge);
      const y = (-point.y * 0.5 + 0.5) * size.height;
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  });

  return null;
}

function Environment() {
  const texture = useEnvironment({ files: "/store/env.hdr" });
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    scene.environment = texture;
    scene.environmentIntensity = ROOM_EXPOSURE;
    return () => {
      scene.environment = null;
    };
  }, [scene, texture]);

  return null;
}

/** Reports the first frames, once every texture has reached the GPU. */
function Ready({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    frames.current += 1;
    if (frames.current < 3) invalidate();
    if (frames.current === 3) onReady();
  });
  return null;
}

function Contents({
  view,
  bridge,
  reducedMotion,
  resolution,
  onShirt,
  onZone,
  onReady,
  onArrive,
}: StoreSceneProps) {
  const invalidate = useThree((state) => state.invalidate);
  const [normal, knit] = useTexture(["/store/jersey-normal.webp", "/store/jersey-knit.webp"]);
  const seams = useMemo(() => asGltfTexture(normal, false, 8), [normal]);
  const weave = useMemo(() => asGltfTexture(knit, false, 8), [knit]);

  useEffect(() => {
    bridge.kick = invalidate;
    invalidate();
    return () => {
      bridge.kick = () => {};
    };
  }, [bridge, invalidate]);

  // Anything changing the view needs at least one frame to set off its motion.
  useEffect(() => {
    invalidate();
  }, [view, invalidate]);

  // A driver reset takes the picture with it, and three brings the context back
  // on its own. This scene draws on demand, so it has to ask to be drawn again.
  const domElement = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const redraw = () => invalidate();
    domElement.addEventListener("webglcontextrestored", redraw);
    return () => domElement.removeEventListener("webglcontextrestored", redraw);
  }, [domElement, invalidate]);

  return (
    <>
      <Environment />
      <directionalLight {...LABEL_LIGHT} />
      <Room small={resolution !== "4k"} />
      <Mirror />
      <RailShirts normal={seams} />
      <Wall
        view={view}
        bridge={bridge}
        normal={seams}
        knit={weave}
        onShirt={onShirt}
        resolution={resolution}
      />
      {view.name === "overview" && <Zones onZone={onZone} />}
      <Pins bridge={bridge} />
      <CameraRig view={view} bridge={bridge} reducedMotion={reducedMotion} onArrive={onArrive} />
      <Ready onReady={onReady} />
    </>
  );
}

export interface StoreSceneProps {
  view: StoreView;
  bridge: StoreBridge;
  reducedMotion: boolean;
  resolution: KitResolution;
  onShirt: (slug: KitSlug) => void;
  onZone: (zone: "wall" | "mirror") => void;
  onReady: () => void;
  onArrive: (view: StoreView["name"]) => void;
}

/**
 * The store. Draws on demand: a still shop costs nothing. It also stops altogether
 * when `paused`, once the mirror's camera is on and the room is hidden behind it,
 * so pose tracking has the GPU to itself.
 */
export default function StoreScene({
  paused,
  onProgress,
  ...props
}: StoreSceneProps & { paused: boolean; onProgress: (value: number) => void }) {
  // Straight from three's loading manager, not drei's useProgress: that store
  // updates the moment a loader starts, which is in the middle of rendering
  // whichever component asked, and React rightly refuses that. A file finishing
  // is an event of its own, outside any render.
  useEffect(() => {
    const manager = THREE.DefaultLoadingManager;
    const previous = manager.onProgress;
    manager.onProgress = (_url, loaded, total) => {
      onProgress(total ? (loaded / total) * 100 : 0);
    };
    return () => {
      manager.onProgress = previous;
    };
  }, [onProgress]);

  return (
    <Canvas
      flat
      dpr={[1, 2]}
      frameloop={paused ? "never" : "demand"}
      camera={{ fov: 66, near: 0.05, far: 30, position: [3.7, 3.1, 2.7] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <Suspense fallback={null}>
        <Contents {...props} />
      </Suspense>
    </Canvas>
  );
}
