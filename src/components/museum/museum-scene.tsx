"use client";

/*
 * Same exemption as vision/character.tsx, for the same reason: `useFrame` is a
 * callback the React Compiler's lint rules read as running during render, and
 * moving three.js objects every frame is how R3F is meant to be driven.
 */
/* eslint-disable react-hooks/immutability */

import { useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

import { type FrameSlug, MUSEUM_FRAMES, museumLayout, toWeb } from "@/content/museum";

import FrameModel, { type Sweep, sweptMaterial } from "./frame-model";
import { asBaked, asPicture } from "./frame-parts";
import type { MuseumBridge, MuseumView } from "./museum-bridge";

const { frame, frames, hall, logo } = museumLayout;

const HALL_URL = "/museum/museum.glb";

/** The lens the poster was rendered through, and where it stood. */
const DOOR = { position: toWeb(6.9, -5.4, 1.25), target: toWeb(-3.4, 3.0, 2.1), lens: 22 };

const bakeUrls = (small: boolean) => [
  small ? "/museum/bake/walls-2k.webp" : "/museum/bake/walls.webp",
  "/museum/bake/floor.webp",
  "/museum/bake/props.webp",
  "/museum/logo.webp",
];

/**
 * What the camera is looking through.
 *
 * Everything here is seen through a rectangle, the screen, set at some place in the
 * room. Move the eye and the rectangle stays put: that is how a window behaves, and it
 * is the whole trick. Only the eye moves, the frustum skews to keep the rectangle's
 * corners where they are, and whatever is behind the glass shifts by its true depth.
 */
interface Stage {
  centre: THREE.Vector3;
  rotation: THREE.Quaternion;
  halfHeight: number;
  /** How far the eye rests from the rectangle. */
  eye: number;
  /** How far the eye moves for a full head movement, in metres. */
  gain: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function stageFor(view: MuseumView, focus: number, aspect: number): Stage {
  const place = frames[focus];

  if (view === "frame") {
    const fit = Math.max((frame.height / 2) * 1.12, ((frame.width / 2) * 1.14) / aspect);
    // On a wide screen the frame stands left of the details.
    const aside = aspect > 1.15 ? fit * aspect * 0.26 : 0;
    const drop = aspect > 1.15 ? 0 : -fit * 0.3;
    return {
      centre: new THREE.Vector3(...toWeb(place.x + aside, hall.back - frame.depth, place.z + drop)),
      rotation: new THREE.Quaternion(),
      halfHeight: fit,
      eye: fit * 3.1,
      gain: fit * 1.05,
    };
  }

  if (view === "hall") {
    // Low, so the floor is in shot: the frames' reflections are half of this view.
    const fit = Math.max(1.85, 2.1 / aspect);
    return {
      centre: new THREE.Vector3(...toWeb(place.x, 0.9, 1.72)),
      rotation: new THREE.Quaternion(),
      halfHeight: fit,
      eye: 5.2,
      gain: 0.85,
    };
  }

  const position = new THREE.Vector3(...DOOR.position);
  const target = new THREE.Vector3(...DOOR.target);
  const forward = target.clone().sub(position).normalize();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)),
  );
  const eye = 6;
  const halfWidth = (eye * 18) / DOOR.lens;
  return {
    centre: position.clone().addScaledVector(forward, eye),
    rotation,
    halfHeight: Math.max(halfWidth / aspect, eye * 0.42),
    eye,
    gain: 0.35,
  };
}

function Rig({
  view,
  focus,
  bridge,
  reducedMotion,
}: {
  view: MuseumView;
  focus: number;
  bridge: MuseumBridge;
  reducedMotion: boolean;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);

  const motion = useRef({
    from: null as Stage | null,
    to: null as Stage | null,
    now: null as Stage | null,
    key: "",
    t: 1,
    duration: 1.6,
    head: new THREE.Vector3(),
  });

  useFrame((_, delta) => {
    const m = motion.current;
    const aspect = size.width / Math.max(size.height, 1);
    const key = `${view}:${focus}:${aspect.toFixed(3)}`;

    if (key !== m.key) {
      const goal = stageFor(view, focus, aspect);
      const sameRoom = m.key.split(":")[0] === view;
      m.from = m.now ? cloneStage(m.now) : goal;
      m.to = goal;
      m.t = !m.now || reducedMotion ? 1 : 0;
      m.duration = sameRoom ? 1.05 : view === "frame" ? 1.5 : 2.2;
      m.key = key;
    }

    m.t = Math.min(1, m.t + delta / m.duration);
    const eased = easeInOut(m.t);
    const from = m.from as Stage;
    const to = m.to as Stage;
    m.now ??= cloneStage(to);
    const now = m.now;
    now.centre.lerpVectors(from.centre, to.centre, eased);
    now.rotation.slerpQuaternions(from.rotation, to.rotation, eased);
    now.halfHeight = THREE.MathUtils.lerp(from.halfHeight, to.halfHeight, eased);
    now.eye = THREE.MathUtils.lerp(from.eye, to.eye, eased);
    now.gain = THREE.MathUtils.lerp(from.gain, to.gain, eased);

    const goal = bridge.head;
    const head = m.head;
    const before = head.x + head.y + head.z;
    head.x = THREE.MathUtils.damp(head.x, goal.x, 14, delta);
    head.y = THREE.MathUtils.damp(head.y, goal.y, 14, delta);
    head.z = THREE.MathUtils.damp(head.z, goal.lean, 8, delta);

    const eyeX = head.x * now.gain;
    const eyeY = head.y * now.gain * 0.7;
    const eye = Math.max(now.eye * 0.45, now.eye * (1 - head.z * 0.32));

    camera.quaternion.copy(now.rotation);
    camera.position.set(eyeX, eyeY, eye).applyQuaternion(now.rotation).add(now.centre);
    camera.updateMatrixWorld();

    // The skew: the rectangle's corners, seen from wherever the eye is now.
    const halfWidth = now.halfHeight * aspect;
    const near = 0.08;
    const k = near / eye;
    camera.projectionMatrix.makePerspective(
      (-halfWidth - eyeX) * k,
      (halfWidth - eyeX) * k,
      (now.halfHeight - eyeY) * k,
      (-now.halfHeight - eyeY) * k,
      near,
      60,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    if (m.t < 1 || Math.abs(head.x + head.y + head.z - before) > 0.0002) invalidate();
  });

  return null;
}

function cloneStage(stage: Stage): Stage {
  return {
    ...stage,
    centre: stage.centre.clone(),
    rotation: stage.rotation.clone(),
  };
}

/*
 * The lights come on down the hall, one bay at a time. Everything in the room is a baked
 * texture, so there are no lights to switch: each material is dimmed by how far along
 * the hall it is, and that line sweeps across. See sweptMaterial.
 */

const FLOOR_SHADER = {
  name: "PolishedFloor",
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    baked: { value: null },
    sweep: { value: 99 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vReflected;
    varying vec2 vPlan;
    varying float vHallX;
    varying vec3 vWorld;
    void main() {
      vReflected = textureMatrix * vec4(position, 1.0);
      vPlan = uv;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vHallX = world.x;
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D baked;
    uniform float sweep;
    varying vec4 vReflected;
    varying vec2 vPlan;
    varying float vHallX;
    varying vec3 vWorld;

    void main() {
      vec2 at = vReflected.xy / vReflected.w;
      // Polished, not a mirror: a soft blur that widens towards the viewer.
      float spread = 0.0016 + 0.0034 * clamp(1.0 - at.y, 0.0, 1.0);
      vec3 mirror = vec3(0.0);
      float total = 0.0;
      for (int i = -3; i <= 3; i++) {
        for (int j = -2; j <= 2; j++) {
          float weight = exp(-float(i * i + j * j) * 0.16);
          mirror += texture2D(tDiffuse, at + vec2(float(i) * spread * 0.75, float(j) * spread * 1.6)).rgb * weight;
          total += weight;
        }
      }
      mirror /= total;

      // Water on a floor: more of the room at a low angle, less looking straight down.
      vec3 toEye = normalize(cameraPosition - vWorld);
      float grazing = pow(1.0 - clamp(toEye.y, 0.0, 1.0), 2.4);
      float strength = 0.16 + 0.62 * grazing;

      vec3 colour = texture2D(baked, vPlan).rgb + mirror * strength;
      gl_FragColor = vec4(colour * (1.0 - smoothstep(sweep - 3.2, sweep, vHallX)), 1.0);
      #include <colorspace_fragment>
    }
  `,
};

function Hall({ sweep, small, walls, floor, props }: {
  sweep: Sweep;
  small: boolean;
  walls: THREE.Texture;
  floor: THREE.Texture;
  props: THREE.Texture;
}) {
  const { scene } = useGLTF(HALL_URL);

  const room = useMemo(() => {
    const baked: Record<string, THREE.Material> = {
      Walls: sweptMaterial(new THREE.MeshBasicMaterial({ map: asBaked(walls) }), sweep),
      Props: sweptMaterial(new THREE.MeshBasicMaterial({ map: asBaked(props) }), sweep),
      Glow: sweptMaterial(new THREE.MeshBasicMaterial({ color: "#fff6ea" }), sweep),
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
  }, [scene, walls, props, sweep]);

  const mirror = useMemo(() => {
    const width = hall.x * 2;
    const depth = hall.back - hall.front;
    const reflector = new Reflector(new THREE.PlaneGeometry(width, depth), {
      textureWidth: small ? 512 : 1280,
      textureHeight: small ? 512 : 1280,
      clipBias: 0.001,
      multisample: small ? 0 : 4,
      shader: FLOOR_SHADER,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, 0.001, -(hall.back + hall.front) / 2);
    const material = reflector.material as THREE.ShaderMaterial;
    // A plain plane, not a glTF mesh, so its picture is the right way up as it stands.
    material.uniforms.baked.value = asPicture(floor);
    material.uniforms.sweep = sweep;
    return reflector;
  }, [small, floor, sweep]);

  useEffect(() => () => mirror.dispose(), [mirror]);

  return (
    <>
      <primitive object={room} />
      <primitive object={mirror} />
    </>
  );
}

function Logo({ sweep, texture }: { sweep: Sweep; texture: THREE.Texture }) {
  const material = useMemo(
    () => sweptMaterial(new THREE.MeshBasicMaterial({ map: asPicture(texture) }), sweep),
    [texture, sweep],
  );
  return (
    <mesh
      position={toWeb(logo.x + 0.01, logo.y, logo.z)}
      rotation={[0, Math.PI / 2, 0]}
      material={material}
    >
      <planeGeometry args={[logo.width, logo.height]} />
    </mesh>
  );
}

function Frame({
  index,
  slug,
  sweep,
  bridge,
  active,
  clickable,
  reducedMotion,
  onPick,
}: {
  index: number;
  slug: FrameSlug;
  sweep: Sweep;
  bridge: MuseumBridge;
  active: boolean;
  clickable: boolean;
  reducedMotion: boolean;
  onPick: (index: number) => void;
}) {
  const domElement = useThree((state) => state.gl.domElement);
  const place = frames[index];
  const spread = useMemo(
    () => ({
      get value() {
        return active ? bridge.spread : 0;
      },
    }),
    [active, bridge],
  );
  const sheen = useMemo(
    () => ({
      get value() {
        return bridge.head.x;
      },
    }),
    [bridge],
  );

  return (
    <group position={toWeb(place.x, hall.back - 0.002, place.z)}>
      <FrameModel slug={slug} sweep={sweep} spread={spread} sheen={sheen} snap={reducedMotion} />
      {clickable && (
        <mesh
          position={[0, 0, frame.depth + 0.02]}
          onClick={(event) => {
            event.stopPropagation();
            onPick(index);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            domElement.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            domElement.style.cursor = "";
          }}
        >
          <planeGeometry args={[frame.width, frame.height]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Switches the hall on, once everything has reached the GPU. */
function Lights({
  sweep,
  reducedMotion,
  onReady,
}: {
  sweep: Sweep;
  reducedMotion: boolean;
  onReady: () => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const state = useRef({ frames: 0, ready: false });

  useFrame((_, delta) => {
    const s = state.current;
    s.frames += 1;
    if (s.frames < 4) {
      invalidate();
      return;
    }
    if (!s.ready) {
      s.ready = true;
      onReady();
    }
    if (sweep.value < 30) {
      sweep.value = reducedMotion ? 30 : sweep.value + Math.min(delta, 0.05) * 9.5;
      invalidate();
    }
  });
  return null;
}

export interface MuseumSceneProps {
  view: MuseumView;
  focus: number;
  bridge: MuseumBridge;
  reducedMotion: boolean;
  small: boolean;
  onPick: (index: number) => void;
  onReady: () => void;
}

function Contents({ view, focus, bridge, reducedMotion, small, onPick, onReady }: MuseumSceneProps) {
  const invalidate = useThree((state) => state.invalidate);
  const [walls, floor, props, logoMap] = useTexture(bakeUrls(small));
  const sweep = useMemo<Sweep>(() => ({ value: -18 }), []);

  useEffect(() => {
    bridge.kick = invalidate;
    invalidate();
    return () => {
      bridge.kick = () => {};
    };
  }, [bridge, invalidate]);

  useEffect(() => {
    invalidate();
  }, [view, focus, invalidate]);

  return (
    <>
      <Hall sweep={sweep} small={small} walls={walls} floor={floor} props={props} />
      <Logo sweep={sweep} texture={logoMap} />
      {MUSEUM_FRAMES.map(({ slug }, index) => (
        <Frame
          key={slug}
          index={index}
          slug={slug}
          sweep={sweep}
          bridge={bridge}
          active={view === "frame" && focus === index}
          clickable={view === "hall"}
          reducedMotion={reducedMotion}
          onPick={onPick}
        />
      ))}
      <Rig view={view} focus={focus} bridge={bridge} reducedMotion={reducedMotion} />
      <Lights sweep={sweep} reducedMotion={reducedMotion} onReady={onReady} />
    </>
  );
}

/**
 * The hall. Draws on demand, so a still room costs nothing, and stops altogether when
 * `paused`, while a frame is on the visitor's own wall.
 */
export default function MuseumScene({
  paused,
  onProgress,
  ...props
}: MuseumSceneProps & { paused: boolean; onProgress: (value: number) => void }) {
  // Straight from three's loading manager: see the same note in store-scene.tsx.
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
      camera={{ fov: 40, near: 0.08, far: 60, position: [0, 2, 5] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#000000"]} />
      <Suspense fallback={null}>
        <Contents {...props} />
      </Suspense>
    </Canvas>
  );
}
