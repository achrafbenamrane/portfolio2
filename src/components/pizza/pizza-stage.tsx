"use client";

/*
 * Same exemption as vision/character.tsx, for the same reason: `useFrame` is a
 * callback the React Compiler's lint rules read as running during render, and
 * moving three.js objects every frame is how R3F is meant to be driven.
 */
/* eslint-disable react-hooks/immutability */

import { Html, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

import { PIZZA_MAP, PIZZA_SHEET } from "@/content/pizza";
import layout from "@/content/pizzeria-layout.json";

import {
  FILM,
  type Film,
  type FilmName,
  focusAt,
  framing,
  makeFilm,
  type PeelSocket,
  type Plate,
  releaseFilm,
  seatOnPeel,
  STILL_FRAME,
} from "./film";
import MenuBook, { type MenuBookProps } from "./menu-book";
import OvenFire from "./oven-fire";
import type { PizzaBridge, PizzaView } from "./pizza-bridge";
import { makePizzaMaterial } from "./pizza-material";
import { ChefCard, inRoom, PizzeriaShell, ROOM_AT } from "./pizzeria-room";
import { ToppingLayer } from "./topping-layer";

const TABLE_SIZE = 2;
/** The film exposure of the reference render, in stops. */
const EXPOSURE_STOPS = 0.75;
const MOST_FALLING = 40;
/** Far enough for the length of the restaurant, and the sky past its windows. */
const FAR = 40;
/** How deep the stone of the oven's mouth is. */
const MOUTH_DEPTH = 0.26;
/** How long the still holds, when there's no film to watch. */
const STILL_SECONDS = 2;
/** How near its mark the camera is, in metres, when the film starts to come through. */
const DISSOLVE_FROM = 0.5;

const SEAT = inRoom(layout.seat.x, layout.seat.y, layout.heroTable.top);
/** The book and the pizza face the corner the visitor came in from. */
const READING_TURN = Math.PI / 4;

const inTheRoom = (view: PizzaView) =>
  view === "room" || view === "table" || view === "book" || view === "meet" || view === "chef" || view === "served";

/** Three places, far apart: the camera cuts between them, and flies within them. */
const placeOf = (view: PizzaView) => (inTheRoom(view) ? "room" : view);

/** The film being played for a view, if there is one. */
const filmFor = (view: PizzaView): FilmName | null => (view === "chef" ? "serve" : view === "meet" ? "meet" : null);

/** The pizza's light in the film: the room's, warm as it is, and then the mouth of the oven. */
const IN_THE_FILM = new THREE.Color(1.16, 0.9, 0.66);
const BY_THE_FIRE = new THREE.Color(1.5, 0.92, 0.5);

/** Lying flat, as the pizza does everywhere but on the peel. */
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// three's AgX stops short of the "Punchy" look the reference render was graded with, and
// without it food goes pale. Set by eye against the render, not copied from Blender:
// Blender's own numbers overcook it here.
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  "color = agxDefaultContrastApprox( color );",
  `color = agxDefaultContrastApprox( color );
  color = pow( color, vec3( 1.42 ) );
  float agxLuma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = agxLuma + 1.16 * ( color - agxLuma );`,
);

const asData = (texture: THREE.Texture) => {
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const asColour = (texture: THREE.Texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const PIZZA_URLS = [
  "/pizza/dough.webp",
  "/pizza/sauced.webp",
  "/pizza/cheesed.webp",
  "/pizza/baked.webp",
  "/pizza/normal-raw.webp",
  "/pizza/normal-baked.webp",
  "/pizza/surface.webp",
  "/pizza/heights.webp",
  "/pizza/order.webp",
  "/pizza/stamps-raw.webp",
  "/pizza/stamps-baked.webp",
  "/pizza/stamps-shape.webp",
  "/pizza/stamps-surface.webp",
];

type PizzaProps = {
  bridge: PizzaBridge;
  view: PizzaView;
  socket: PeelSocket;
  flicker: { value: number };
  scale: number;
  small: boolean;
  reducedMotion: boolean;
  onLanded: () => void;
};

/** The pizza, and everything that's fallen on it. */
function Pizza({ bridge, view, socket, flicker, scale, small, reducedMotion, onLanded }: PizzaProps) {
  const gl = useThree((state) => state.gl);
  const textures = useTexture(PIZZA_URLS);

  const parts = useMemo(() => {
    const [dough, sauced, cheesed, baked, normalRaw, normalBaked, surface, heights, order] = textures;
    const [stampRaw, stampBaked, stampShape, stampSurface] = textures.slice(9);
    const sheets = {
      raw: asColour(stampRaw),
      baked: asColour(stampBaked),
      shape: asData(stampShape),
      surface: asData(stampSurface),
    };
    const layer = new ToppingLayer(small ? 1024 : 2048, sheets);
    const { material, uniforms } = makePizzaMaterial(
      {
        dough: asColour(dough),
        sauced: asColour(sauced),
        cheesed: asColour(cheesed),
        baked: asColour(baked),
        normalRaw: asData(normalRaw),
        normalBaked: asData(normalBaked),
        surface: asData(surface),
        heights: asData(heights),
        order: asData(order),
      },
      layer.target,
    );
    return { layer, material, uniforms, sheets };
  }, [textures, small]);

  useEffect(() => {
    bridge.stale = true;
    bridge.kick();
    return () => {
      parts.layer.dispose();
      parts.material.dispose();
    };
  }, [bridge, parts]);

  const group = useRef<THREE.Group>(null);
  const fallingMesh = useRef<THREE.InstancedMesh>(null);
  const holder = useMemo(() => new THREE.Object3D(), []);

  const fallingMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec2 cell;
          uniform vec2 cellSize;
          varying vec2 sheetUv;
          void main() {
            sheetUv = cell + uv * cellSize;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D sheet;
          varying vec2 sheetUv;
          void main() {
            vec4 colour = texture2D(sheet, sheetUv);
            if (colour.a < 0.5) discard;
            gl_FragColor = vec4(colour.rgb * ${PIZZA_MAP.beautyRange.toFixed(1)}, 1.0);
          }
        `,
        uniforms: {
          sheet: { value: parts.sheets.raw },
          cellSize: { value: new THREE.Vector2(1 / PIZZA_SHEET.variants, 1 / PIZZA_SHEET.rows) },
        },
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [parts],
  );
  const fallingGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(PIZZA_SHEET.cellMetres, PIZZA_SHEET.cellMetres);
    geometry.setAttribute(
      "cell",
      new THREE.InstancedBufferAttribute(new Float32Array(MOST_FALLING * 2), 2),
    );
    return geometry;
  }, []);

  useFrame((_, delta) => {
    // Stages ease, so a change of step arrives over a moment and not all at once.
    const u = parts.uniforms;
    const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * 2.4);
    u.sauce.value += (bridge.sauce - u.sauce.value) * ease;
    u.cheese.value += (bridge.cheese - u.cheese.value) * ease;
    if (bridge.baking) {
      const { seconds, report } = bridge.baking;
      bridge.heat = Math.min(bridge.heat + Math.min(delta, 0.1) / seconds, 1);
      if (bridge.heat >= 1) bridge.baking = null;
      report(bridge.heat);
    }
    u.heat.value = bridge.heat;

    // The oven has no window: its light is firelight, from behind and to the left.
    if (view === "oven") u.ambient.value.setRGB(0.66 * flicker.value, 0.4 * flicker.value, 0.25 * flicker.value);
    else if (view === "chef") u.ambient.value.lerpColors(IN_THE_FILM, BY_THE_FIRE, socket.fire);
    else u.ambient.value.setRGB(1, 1, 1);

    if (bridge.stale) {
      bridge.stale = false;
      parts.layer.redraw(gl, bridge.pieces);
    }

    const now = performance.now() / 1000;
    const landed = bridge.falling.filter((piece) => now >= piece.lands);
    if (landed.length) {
      bridge.falling = bridge.falling.filter((piece) => now < piece.lands);
      const pieces = landed.map(({ topping, variant, x, y, turn }) => ({ topping, variant, x, y, turn }));
      bridge.pieces.push(...pieces);
      parts.layer.stamp(gl, pieces);
      onLanded();
    }

    const mesh = fallingMesh.current;
    if (mesh) {
      const cells = fallingGeometry.getAttribute("cell") as THREE.InstancedBufferAttribute;
      const count = Math.min(bridge.falling.length, MOST_FALLING);
      for (let index = 0; index < count; index++) {
        const piece = bridge.falling[index];
        const t = (now - piece.startedAt) / (piece.lands - piece.startedAt);
        const started = t >= 0;
        const fall = 1 - Math.max(t, 0) ** 2;
        holder.position.set(piece.x, piece.y, 0.012 + fall * 0.2);
        holder.rotation.set(fall * 1.6, fall * -1.1, piece.turn + fall * 2.2);
        holder.scale.setScalar(started ? 1 : 0);
        holder.updateMatrix();
        mesh.setMatrixAt(index, holder.matrix);
        cells.setXY(
          index,
          piece.variant / PIZZA_SHEET.variants,
          PIZZA_SHEET.row(piece.topping) / PIZZA_SHEET.rows,
        );
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      cells.needsUpdate = true;
    }

    const held = group.current;
    if (held) {
      held.scale.setScalar(scale);
      held.visible = view === "build" || view === "oven" || view === "chef" || view === "served";
      // It rides the peel, stays in the oven, and comes to the table.
      held.quaternion.copy(view === "chef" ? socket.turn : FLAT);
      if (view === "chef") {
        held.position.copy(socket.at);
      } else if (view === "served") {
        held.position.copy(SEAT).add(new THREE.Vector3(0, 0.024, 0));
      } else {
        held.position.set(0, 0.0022, 0);
      }
    }
  });

  return (
    <group ref={group} rotation-x={-Math.PI / 2} position-y={0.0022}>
      <mesh material={parts.material} frustumCulled={false}>
        <planeGeometry args={[PIZZA_MAP.metres, PIZZA_MAP.metres, small ? 384 : 768, small ? 384 : 768]} />
      </mesh>
      <instancedMesh
        ref={fallingMesh}
        args={[fallingGeometry, fallingMaterial, MOST_FALLING]}
        frustumCulled={false}
      />
    </group>
  );
}

function Table() {
  const baked = useTexture("/pizza/table.webp");
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#000000",
        emissive: "#ffffff",
        emissiveMap: asColour(baked),
        emissiveIntensity: PIZZA_MAP.beautyRange,
        roughness: 0.62,
        specularIntensity: 0.35,
      }),
    [baked],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.0005} material={material}>
      <planeGeometry args={[TABLE_SIZE, TABLE_SIZE]} />
    </mesh>
  );
}

/** The same window as the reference render, and the room's reflections behind it. */
function Light({ view, flicker }: { view: PizzaView; flicker: { value: number } }) {
  const { scene } = useThree();
  const flame = useRef<THREE.PointLight>(null);
  const inOven = view === "oven";
  const room = inTheRoom(view);

  useEffect(() => {
    scene.environmentIntensity = inOven ? 0.12 : room ? 0.4 : 0.55;
  }, [scene, inOven, room]);

  useFrame(() => {
    if (flame.current) flame.current.intensity = inOven ? 1.5 * flicker.value : 0;
  });

  useEffect(() => {
    RectAreaLightUniformsLib.init();
    let released = false;
    new HDRLoader().load("/pizza/room.hdr", (texture) => {
      if (released) {
        texture.dispose();
        return;
      }
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
      scene.environmentRotation.set(0, THREE.MathUtils.degToRad(200), 0);
    });
    return () => {
      released = true;
      scene.environment = null;
    };
  }, [scene]);

  return (
    <>
      <rectAreaLight
        position={[-1.0, 0.82, -0.42]}
        width={0.75}
        height={0.75}
        intensity={view === "build" ? 34 : 0}
        color="#fff0dc"
        ref={(light) => light?.lookAt(0, 0, 0)}
      />
      <pointLight ref={flame} position={[-0.32, 0.3, -0.5]} color="#ff9a4a" distance={2.2} decay={2} />

      {/* The room's light, for what isn't baked: the windows, the lamps and the oven. */}
      <hemisphereLight args={["#fff4e6", "#7a5040", room ? 0.62 : 0]} />
      <directionalLight
        position={ROOM_AT.clone().add(new THREE.Vector3(-6, 4, 1))}
        target-position={ROOM_AT.toArray()}
        color="#ffe9cf"
        intensity={room ? 1.05 : 0}
      />
      <pointLight
        position={inRoom(layout.ovenMouth.x, layout.ovenMouth.y - 0.5, layout.ovenMouth.z + 0.3).toArray()}
        color="#ff8a3c"
        intensity={room ? 3 : 0}
        distance={5}
        decay={2}
      />
    </>
  );
}

/** The reference render's lens. */
const LENS = 0.085;
const SENSOR = 0.036;
const F_STOP = 11;
const MOST_BLUR_PX = 14;

const LENS_SHADER = /* glsl */ `
  #include <common>
  #include <packing>

  varying vec2 vUv;
  uniform sampler2D picture;
  uniform sampler2D depth;
  uniform vec2 pixel;
  uniform float focus;
  uniform float spread;
  uniform float nearPlane;
  uniform float farPlane;
  uniform float grade;
  uniform sampler2D plate;
  uniform float plateMix;
  uniform float plateKeep;
  uniform vec4 plateBox;

  float away(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(depth, uv).x, nearPlane, farPlane);
  }

  float blurOf(float distanceAway) {
    return min(spread * abs(distanceAway - focus) / distanceAway, ${MOST_BLUR_PX.toFixed(1)});
  }

  void main() {
    float here = away(vUv);
    float blur = blurOf(here);
    vec3 total = texture2D(picture, vUv).rgb;
    float weight = 1.0;

    // A disc of samples, each one only counted if its own blur reaches this pixel. That's
    // what stops a sharp edge smearing over what's behind it.
    for (int i = 0; i < 56; i++) {
      float reach = sqrt((float(i) + 0.5) / 56.0) * ${MOST_BLUR_PX.toFixed(1)};
      float turn = float(i) * 2.39996;
      vec2 at = vUv + vec2(cos(turn), sin(turn)) * reach * pixel;
      float there = away(at);
      float size = there < here ? blurOf(there) : min(blurOf(there), blur * 2.0);
      float counts = smoothstep(reach - 1.0, reach + 1.0, size);
      total += texture2D(picture, at).rgb * counts;
      weight += counts;
    }

    vec3 colour = total / weight;

    // The film is cut for food, close up. A whole room wants it gentler, or the terracotta
    // burns red and the shadows go to ink.
    float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
    colour = mix(colour, vec3(luma), 0.24 * grade);
    colour = pow(max(colour, 0.0), vec3(1.0 - 0.3 * grade)) * (1.0 + 0.1 * grade);

    float corner = length((vUv - 0.5) * vec2(1.0, 0.8));
    colour *= 1.0 - 0.34 * pow(corner * 1.45, 3.0);

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

    // The film goes in last and untouched: it was graded when it was rendered.
    vec2 filmUv = (vUv - plateBox.xy) / plateBox.zw;
    vec2 onFilm = step(vec2(0.0), filmUv) * step(filmUv, vec2(1.0));
    vec3 film = texture2D(plate, filmUv).rgb * onFilm.x * onFilm.y;
    float kept = plateKeep * texture2D(picture, vUv).a;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, film, plateMix * (1.0 - kept));
  }
`;

/**
 * Draws the scene through the reference render's lens. Everything sharp from front to
 * back is what makes a 3D scene look like a game, more than any texture does.
 */
function Lens({
  focusOn,
  softness,
  grade,
  plate,
}: {
  focusOn: THREE.Vector3;
  softness: { value: number };
  grade: number;
  plate: Plate;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);

  const parts = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: 4,
      depthTexture: new THREE.DepthTexture(4, 4, THREE.UnsignedIntType),
    });
    const material = new THREE.ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: LENS_SHADER,
      uniforms: {
        picture: { value: target.texture },
        depth: { value: target.depthTexture },
        pixel: { value: new THREE.Vector2() },
        focus: { value: 1 },
        spread: { value: 1 },
        nearPlane: { value: 0.05 },
        farPlane: { value: FAR },
        grade: { value: 0 },
        plate: { value: null as THREE.Texture | null },
        plateMix: { value: 0 },
        plateKeep: { value: 0 },
        plateBox: { value: new THREE.Vector4(0, 0, 1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });
    return { target, material, quad: new FullScreenQuad(material) };
  }, []);

  useEffect(() => {
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    parts.target.setSize(width, height);
    parts.material.uniforms.pixel.value.set(1 / width, 1 / height);
  }, [parts, size, dpr]);

  useEffect(
    () => () => {
      parts.target.dispose();
      parts.material.dispose();
      parts.quad.dispose();
    },
    [parts],
  );

  useFrame(() => {
    const focus = camera.position.distanceTo(focusOn);
    const u = parts.material.uniforms;
    u.focus.value = focus;
    u.grade.value = grade;
    u.spread.value = ((LENS * LENS) / (F_STOP * (focus - LENS)) / SENSOR) * parts.target.width * softness.value;
    u.plate.value = plate.texture;
    u.plateMix.value = plate.mix;
    u.plateKeep.value = plate.keep;
    u.plateBox.value.copy(plate.box);
    gl.setRenderTarget(parts.target);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    parts.quad.render(gl);
  }, 1);

  return null;
}

type Shot = {
  at: THREE.Vector3;
  target: THREE.Vector3;
  focus: THREE.Vector3;
  /** Vertical, in degrees. */
  fov: number;
  /** How much of the long lens's blur to keep. A wide lens has far less of it. */
  softness: number;
  /** How far the pointer leans the camera. */
  lean: number;
};

/** A lens on a 36 mm sensor, as the vertical field of view it gives on this screen. */
function fovOf(lens: number, aspect: number, most = 86) {
  const half = Math.atan(18 / lens);
  return Math.min(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / aspect)), most);
}

/** The camera a film was rendered with, exactly: anything else and the pizza slides on the peel. */
function filmShot(name: FilmName): Shot {
  const { at, to, lens } = FILM[name];
  const target = inRoom(to[0], to[1], to[2]);
  return {
    at: inRoom(at[0], at[1], at[2]),
    target,
    focus: target,
    fov: fovOf(lens, FILM.size[0] / FILM.size[1], 120),
    softness: 0,
    lean: 0,
  };
}

function blenderShot(name: keyof typeof layout.shots, aspect: number, focusOn?: THREE.Vector3): Shot {
  const shot = layout.shots[name];
  const target = inRoom(shot.to[0], shot.to[1], shot.to[2]);
  return {
    at: inRoom(shot.at[0], shot.at[1], shot.at[2]),
    target,
    focus: focusOn ?? target,
    fov: fovOf(shot.lens, aspect),
    softness: 0.04,
    lean: 0.12,
  };
}

/** Round the seat, in the book's own directions: across it, up from it, and towards the reader. */
function fromSeat(across: number, up: number, towards: number) {
  const turn = new THREE.Vector3(across, up, towards).applyAxisAngle(new THREE.Vector3(0, 1, 0), READING_TURN);
  return SEAT.clone().add(turn);
}

/** Where the camera stands for a view, so the subject fits whatever the screen's shape. */
function shotFor(view: PizzaView, aspect: number): Shot {
  const tall = aspect < 1;

  if (view === "room") return blenderShot("corner", aspect);
  if (view === "table") return blenderShot("table", aspect, SEAT);

  if (view === "book") {
    const stand = tall ? 1.22 / Math.max(aspect, 0.4) * 0.5 : 1;
    return {
      at: fromSeat(tall ? 0 : 0.125, 0.72 * stand, 0.3 * stand),
      target: fromSeat(tall ? 0 : 0.125, 0, tall ? 0.02 : -0.01),
      focus: SEAT,
      fov: 30,
      softness: 0,
      lean: 0.02,
    };
  }

  if (view === "served") {
    const stand = tall ? 1.5 : 1;
    return {
      at: fromSeat(tall ? 0 : 0.16, 0.62 * stand, 0.84 * stand),
      target: fromSeat(tall ? 0 : 0.16, 0, 0.02),
      focus: SEAT,
      fov: 27,
      softness: 0.5,
      lean: 0.06,
    };
  }

  const film = filmFor(view);
  if (film) return filmShot(film);

  if (view === "oven") {
    return {
      at: tall ? new THREE.Vector3(-0.02, 0.56, 0.6) : new THREE.Vector3(0.03, 0.28, 0.43),
      target: tall ? new THREE.Vector3(-0.1, 0.02, -0.14) : new THREE.Vector3(-0.05, 0.03, -0.1),
      focus: new THREE.Vector3(0, 0.02, 0.04),
      fov: tall ? 62 : 50,
      softness: 0.2,
      lean: 0.03,
    };
  }

  // Fit the pizza's width and height, and leave room for the panels around it.
  const lift = THREE.MathUtils.degToRad(tall ? 68 : 52);
  const fitHigh = 0.36 / 0.265;
  const fitWide = 0.36 / (0.265 * aspect);
  const distance = Math.max(fitHigh, tall ? fitWide * 1.05 : fitWide * 1.5);
  const across = tall ? 0 : 0.08 * distance;
  const along = 0.02 * distance;
  return {
    at: new THREE.Vector3(across, Math.sin(lift) * distance, Math.cos(lift) * distance + along),
    target: new THREE.Vector3(across, 0, along),
    focus: new THREE.Vector3(0, 0.012, 0),
    fov: 15.1,
    softness: 1,
    lean: 0.1,
  };
}

/** Moves between shots, and leans with the pointer so the reflections slide. */
function Rig({
  view,
  focus,
  softness,
  plate,
  reducedMotion,
}: {
  view: PizzaView;
  focus: THREE.Vector3;
  softness: { value: number };
  plate: Plate;
  reducedMotion: boolean;
}) {
  const size = useThree((state) => state.size);
  const aspect = size.width / size.height;
  const shot = useMemo(() => shotFor(view, aspect), [view, aspect]);
  const current = useRef<{ at: THREE.Vector3; target: THREE.Vector3; fov: number; place: string } | null>(null);

  useFrame(({ camera, pointer }, delta) => {
    const lens = camera as THREE.PerspectiveCamera;
    const place = placeOf(view);
    if (!current.current) {
      current.current = { at: shot.at.clone(), target: shot.target.clone(), fov: shot.fov, place };
      focus.copy(shot.focus);
    }
    const now = current.current;

    // The bench and the oven are other rooms: the camera jumps behind the curtain.
    if (now.place !== place) {
      now.place = place;
      now.at.copy(shot.at);
      now.target.copy(shot.target);
      now.fov = shot.fov;
      focus.copy(shot.focus);
    }

    const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * 1.9);
    now.at.lerp(shot.at, ease);
    now.target.lerp(shot.target, ease);
    now.fov += (shot.fov - now.fov) * ease;
    focus.lerp(shot.focus, ease);
    softness.value += (shot.softness - softness.value) * ease;

    const lean = reducedMotion ? 0 : shot.lean;
    camera.position.copy(now.at);
    camera.position.x += pointer.x * lean;
    camera.position.y += pointer.y * lean * 0.5;
    camera.lookAt(now.target);
    if (Math.abs(lens.fov - now.fov) > 0.01) {
      lens.fov = now.fov;
      lens.updateProjectionMatrix();
    }

    // The camera sees what the film shows of itself on this screen, no more and no less.
    if (filmFor(view)) {
      const fit = framing(size.width, size.height, plate.focus);
      lens.setViewOffset(fit.fullWidth, fit.fullHeight, fit.x, fit.y, size.width, size.height);
      plate.box.set(
        -fit.x / size.width,
        1 + (fit.y - fit.fullHeight) / size.height,
        fit.fullWidth / size.width,
        fit.fullHeight / size.height,
      );
    } else if (lens.view?.enabled) {
      lens.clearViewOffset();
      lens.aspect = aspect;
      lens.updateProjectionMatrix();
    }
  });

  return null;
}

/** The edge of the mouth, in depth only: the pizza goes in behind stone that's in the film. */
function MouthEdge() {
  const { geometry, material } = useMemo(() => {
    const { z, halfWidth, height } = layout.ovenMouth;
    const spring = z + 0.08;
    const across = (halfWidth / 0.95) * 0.96;
    const rise = ((height - 0.08) / 0.95) * 0.96;
    const wall = new THREE.Shape();
    wall.moveTo(-3, 0);
    wall.lineTo(3, 0);
    wall.lineTo(3, 3);
    wall.lineTo(-3, 3);
    wall.closePath();
    const opening = new THREE.Path();
    opening.moveTo(-across, z - 0.04);
    opening.lineTo(across, z - 0.04);
    opening.lineTo(across, spring);
    opening.absellipse(0, spring, across, rise, 0, Math.PI, false, 0);
    opening.closePath();
    wall.holes.push(opening);
    return {
      geometry: new THREE.ExtrudeGeometry(wall, { depth: MOUTH_DEPTH, bevelEnabled: false, curveSegments: 40 }),
      material: new THREE.MeshBasicMaterial({ colorWrite: false }),
    };
  }, []);

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={inRoom(layout.ovenMouth.x, layout.ovenMouth.y + 0.2, 0)}
      renderOrder={-1}
    />
  );
}

/**
 * Plays the film for a view. The serve runs once and hands over to the fire; meeting him is a
 * loop he stands in. A person who'd rather not have motion, or a browser that won't play it,
 * gets the still, and the order carries on all the same.
 */
function FilmPlate({
  view,
  plate,
  socket,
  reducedMotion,
  onServed,
}: {
  view: PizzaView;
  plate: Plate;
  socket: PeelSocket;
  reducedMotion: boolean;
  onServed: () => void;
}) {
  const stills = useTexture(["/pizza/film-serve.webp", "/pizza/film-meet.webp"]);
  const films = useRef<Record<FilmName, Film> | null>(null);
  const name = filmFor(view);
  const meetAt = useMemo(() => filmShot("meet").at, []);

  useEffect(() => {
    const made = { serve: makeFilm("serve"), meet: makeFilm("meet") };
    films.current = made;
    return () => {
      films.current = null;
      releaseFilm(made.serve);
      releaseFilm(made.meet);
    };
  }, []);

  useEffect(() => {
    if (!name) return;
    const film = films.current?.[name];
    let finished = false;
    const finish = () => {
      if (finished || name !== "serve") return;
      finished = true;
      onServed();
    };

    if (!film || reducedMotion) {
      const held = window.setTimeout(finish, STILL_SECONDS * 1000);
      return () => window.clearTimeout(held);
    }

    film.video.currentTime = 0;
    film.video.addEventListener("ended", finish);
    film.video.play().catch((error: Error) => {
      // Stopped by leaving the view, which isn't a failure.
      if (error.name === "AbortError") return;
      film.failed = true;
      window.setTimeout(finish, STILL_SECONDS * 1000);
    });
    // Whatever becomes of the video, the pizza has an oven to get to.
    const late = window.setTimeout(finish, (FILM.serve.frames / FILM.fps + 5) * 1000);
    return () => {
      window.clearTimeout(late);
      film.video.removeEventListener("ended", finish);
      film.video.pause();
    };
  }, [name, onServed, reducedMotion]);

  useFrame(({ camera }, delta) => {
    const film = name ? films.current?.[name] : null;
    const moving = !!film && !reducedMotion && !film.failed && film.video.readyState >= 2;
    if (name) plate.texture = moving ? film.texture : stills[name === "serve" ? 0 : 1];

    if (view === "chef") {
      const frame = moving ? film.video.currentTime * FILM.fps : STILL_FRAME - 1;
      seatOnPeel(socket, frame);
      plate.focus = focusAt("serve", frame + 1);
      plate.keep = 1;
      plate.mix = 1;
      return;
    }

    // Walking up to him, the room dissolves into the film as the camera arrives on its mark.
    plate.keep = 0;
    plate.focus = focusAt("meet", 0);
    if (view !== "meet" && view !== "room") {
      plate.mix = 0;
      return;
    }
    const arrived = view === "meet" && camera.position.distanceTo(meetAt) < DISSOLVE_FROM;
    const ease = reducedMotion ? 1 : 1 - Math.exp(-delta * 3.4);
    plate.mix += ((arrived ? 1 : 0) - plate.mix) * ease;
    if (!arrived && plate.mix < 0.004) plate.mix = 0;
  });

  return null;
}

/** Turns a point on the screen into a spot on the pizza. */
function Picker({ bridge, scale }: { bridge: PizzaBridge; scale: number }) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const ray = new THREE.Raycaster();
    const top = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.012);
    const hit = new THREE.Vector3();
    const point = new THREE.Vector2();
    bridge.kick = invalidate;
    bridge.pointOnPizza = (clientX, clientY) => {
      const box = domElement.getBoundingClientRect();
      point.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
      ray.setFromCamera(point, camera);
      if (!ray.ray.intersectPlane(top, hit)) return null;
      const x = hit.x / scale;
      const y = -hit.z / scale;
      return Math.hypot(x, y) <= PIZZA_MAP.landingRadius * 1.04 ? { x, y } : null;
    };
    return () => {
      bridge.kick = () => {};
      bridge.pointOnPizza = () => null;
    };
  }, [bridge, camera, domElement, invalidate, scale]);

  return null;
}

/** Counts real frames, for the tests. */
function FrameCounter() {
  useFrame(() => {
    const stats = window as unknown as { __pizzaFrames?: number };
    stats.__pizzaFrames = (stats.__pizzaFrames ?? 0) + 1;
  });
  return null;
}

export type PizzaStageProps = {
  bridge: PizzaBridge;
  view: PizzaView;
  scale: number;
  small: boolean;
  reducedMotion: boolean;
  book: Omit<MenuBookProps, "reducedMotion">;
  onSeat: () => void;
  onMeet: () => void;
  onServed: () => void;
  onLanded: () => void;
  onProgress: (percent: number) => void;
};

export default function PizzaStage({
  bridge,
  view,
  scale,
  small,
  reducedMotion,
  book,
  onSeat,
  onMeet,
  onServed,
  onLanded,
  onProgress,
}: PizzaStageProps) {
  const focus = useMemo(() => new THREE.Vector3(0, 0.012, 0), []);
  const flicker = useMemo(() => ({ value: 1 }), []);
  const softness = useMemo(() => ({ value: 1 }), []);
  const socket = useMemo<PeelSocket>(() => ({ at: new THREE.Vector3(), turn: new THREE.Quaternion(), fire: 0 }), []);
  const plate = useMemo<Plate>(() => ({ texture: null, mix: 0, keep: 0, box: new THREE.Vector4(0, 0, 1, 1), focus: 0.5 }), []);
  const inOven = view === "oven";
  const room = inTheRoom(view);

  // Straight from three's loading manager: see the same note in store-scene.tsx.
  useEffect(() => {
    const manager = THREE.DefaultLoadingManager;
    const previous = manager.onProgress;
    manager.onProgress = (_url, loaded, total) => onProgress(total ? (loaded / total) * 100 : 0);
    return () => {
      manager.onProgress = previous;
    };
  }, [onProgress]);

  return (
    <Canvas
      gl={{
        antialias: false,
        toneMapping: THREE.AgXToneMapping,
        toneMappingExposure: 2 ** EXPOSURE_STOPS,
      }}
      dpr={[1, small ? 1.25 : 1.5]}
      // The reference render's camera: 85 mm on a 36 mm sensor, at 16:10.
      camera={{ position: [0, 1, 1], fov: 15.1, near: 0.05, far: FAR }}
    >
      <Suspense fallback={null}>
        <group visible={view === "build"}>
          <Table />
        </group>
        <group visible={inOven}>
          <OvenFire flicker={flicker} reducedMotion={reducedMotion} />
        </group>
        <group position={ROOM_AT} visible={room && view !== "chef"}>
          <PizzeriaShell flicker={flicker} reducedMotion={reducedMotion} />
          <ChefCard plate={plate} />
        </group>
        <group visible={view === "chef"}>
          <MouthEdge />
        </group>
        <FilmPlate view={view} plate={plate} socket={socket} reducedMotion={reducedMotion} onServed={onServed} />
        <group position={SEAT.clone().add(new THREE.Vector3(0, 0.022, 0))} rotation-y={READING_TURN} visible={view === "table" || view === "book"}>
          <MenuBook {...book} reducedMotion={reducedMotion} />
        </group>
        {view === "room" && (
          <>
            <Html position={SEAT.clone().add(new THREE.Vector3(0, 0.34, 0))} center zIndexRange={[20, 0]}>
              <button type="button" className="pizza-pin" onClick={onSeat}>
                <span className="pizza-pin-dot" aria-hidden />
                Take a seat
              </button>
            </Html>
            <Html position={inRoom(FILM.card.pin[0], FILM.card.pin[1], FILM.card.pin[2])} center zIndexRange={[20, 0]}>
              <button type="button" className="pizza-pin" onClick={onMeet}>
                <span className="pizza-pin-dot" aria-hidden />
                Meet the chef
              </button>
            </Html>
          </>
        )}
        <Pizza
          bridge={bridge}
          view={view}
          socket={socket}
          flicker={flicker}
          scale={scale}
          small={small}
          reducedMotion={reducedMotion}
          onLanded={onLanded}
        />
      </Suspense>
      <Light view={view} flicker={flicker} />
      <Rig view={view} focus={focus} softness={softness} plate={plate} reducedMotion={reducedMotion} />
      <Picker bridge={bridge} scale={scale} />
      <Lens
        focusOn={focus}
        softness={softness}
        plate={plate}
        grade={view === "served" ? 0.2 : view === "chef" ? 0 : room ? 0.55 : 0}
      />
      <FrameCounter />
    </Canvas>
  );
}
