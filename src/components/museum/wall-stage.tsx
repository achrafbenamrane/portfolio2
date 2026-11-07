"use client";

/*
 * Same exemption as vision/character.tsx: this runs in a render loop, and moving
 * three.js objects every frame is how R3F is meant to be driven.
 */
/* eslint-disable react-hooks/immutability */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";

import { frameLayers, type FrameSlug, MUSEUM_FRAMES, museumLayout } from "@/content/museum";
import { WallSensor } from "@/lib/vision/wall-sensor";

import FrameModel from "./frame-model";
import { glowTexture } from "./frame-parts";

const { frame } = museumLayout;

const getServerVersion = () => 0;

/** The camera, and how much of the wall it takes in. One unit is one museum metre. */
const CAMERA_Z = 6;
const FOV = 30;
const WALL_Z = -frame.depth;
const FAR_Z = WALL_Z - 0.04;
/** The person is drawn in front of everything, from the same picture, so they stand
 *  between the camera and the frame. */
const NEAR_Z = 3;

/** In the 256-pixel outline. A hand on its own is more than this. */
const MIN_PERSON_PIXELS = 220;

/** Of the biggest piece. A hand coming back into the picture is still more than this. */
const MIN_PERSON_SHARE = 0.04;

const visibleHeight = (z: number) => 2 * (CAMERA_Z - z) * Math.tan(THREE.MathUtils.degToRad(FOV / 2));

/** The picture, with `object-fit: cover` and a mirror's flip, at a given depth. */
function coverAt(z: number, aspect: number, pictureAspect: number): [number, number] {
  const height = visibleHeight(z);
  const width = height * aspect;
  return pictureAspect > aspect ? [height * pictureAspect, height] : [width, width / pictureAspect];
}

const PICTURE_VERTEX = /* glsl */ `
  varying vec2 vPicture;
  void main() {
    vPicture = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The room, dimmed when the lights are down. */
const ROOM_FRAGMENT = /* glsl */ `
  uniform sampler2D picture;
  uniform float dim;
  varying vec2 vPicture;
  void main() {
    gl_FragColor = vec4(texture2D(picture, vPicture).rgb * dim, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Just the person, softly cut out, over the frame and its light. */
const PERSON_FRAGMENT = /* glsl */ `
  uniform sampler2D picture;
  uniform sampler2D person;
  uniform float dim;
  uniform float ready;
  uniform vec3 spill;
  varying vec2 vPicture;
  void main() {
    vec2 at = vec2(vPicture.x, 1.0 - vPicture.y);
    vec2 texel = 1.3 / vec2(textureSize(person, 0));
    float here = (
      texture2D(person, at).r * 2.0 +
      texture2D(person, at + vec2(texel.x, 0.0)).r +
      texture2D(person, at - vec2(texel.x, 0.0)).r +
      texture2D(person, at + vec2(0.0, texel.y)).r +
      texture2D(person, at - vec2(0.0, texel.y)).r
    ) / 6.0;
    float alpha = smoothstep(0.3, 0.7, here) * ready;
    if (alpha < 0.01) discard;
    // With the room dark, the frame is what lights the person.
    vec3 lit = texture2D(picture, vPicture).rgb;
    lit = lit * dim + lit * spill * (1.0 - dim) * 0.5;
    gl_FragColor = vec4(lit, alpha);
    #include <colorspace_fragment>
  }
`;

/**
 * Fills `target` with where the person is, with no holes in them.
 *
 * The outline can drop a bright patch, teeth or a highlight on a cheek, as background, and
 * the frame would show through the face. Background only counts if it can be reached
 * from the edge of the picture: anything it can't reach is enclosed by the person.
 */
function solidPerson(labels: Uint8Array, width: number, height: number, target: Uint8Array): void {
  target.fill(255);
  const stack: number[] = [];
  const visit = (index: number) => {
    if (labels[index] === 0 && target[index] !== 0) {
      target[index] = 0;
      stack.push(index);
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (stack.length) {
    const index = stack.pop() as number;
    const x = index % width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < width * (height - 1)) visit(index + width);
  }

  // The opposite mistake: a patch of wall read as a person. It stays hidden until the
  // lights go down, then it glows. The biggest piece is the visitor, so anything out of
  // proportion to it is wall. A second visitor is about as big as the first.
  const pieceOf = new Uint16Array(target.length);
  const sizes = [0];
  const join = (index: number, piece: number) => {
    if (target[index] !== 0 && pieceOf[index] === 0) {
      pieceOf[index] = piece;
      stack.push(index);
    }
  };
  for (let start = 0; start < target.length; start++) {
    if (target[start] === 0 || pieceOf[start] !== 0) continue;
    const piece = sizes.length;
    let size = 0;
    join(start, piece);
    while (stack.length) {
      const index = stack.pop() as number;
      const x = index % width;
      size++;
      if (x > 0) join(index - 1, piece);
      if (x < width - 1) join(index + 1, piece);
      if (index >= width) join(index - width, piece);
      if (index < width * (height - 1)) join(index + width, piece);
    }
    sizes.push(size);
  }
  const enough = Math.max(MIN_PERSON_PIXELS, Math.max(...sizes) * MIN_PERSON_SHARE);
  for (let index = 0; index < target.length; index++) {
    if (sizes[pieceOf[index]] < enough) target[index] = 0;
  }
}

function WallScene({
  sensor,
  slug,
  live,
  dark,
  size,
  bridge,
}: {
  sensor: WallSensor;
  slug: FrameSlug;
  live: boolean;
  dark: boolean;
  size: number;
  bridge: { nudge: (scale: number) => void };
}) {
  const viewport = useThree((state) => state.size);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  const glow = useMemo(() => glowTexture(), []);
  const colour = useMemo(() => {
    const [r, g, b] = frameLayers[slug].glow;
    const peak = Math.max(r, g, b, 0.001);
    return new THREE.Color(r / peak, g / peak, b / peak);
  }, [slug]);

  const picture = useMemo(() => {
    if (!live) return null;
    const texture = new THREE.CanvasTexture(sensor.frame.picture);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }, [live, sensor]);

  const shared = useMemo(
    () => ({
      picture: { value: null as THREE.Texture | null },
      person: { value: null as THREE.Texture | null },
      dim: { value: 1 },
      ready: { value: 0 },
      spill: { value: new THREE.Vector3(1, 1, 1) },
    }),
    [],
  );

  const roomMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: PICTURE_VERTEX,
        fragmentShader: ROOM_FRAGMENT,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [shared],
  );
  const personMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: PICTURE_VERTEX,
        fragmentShader: PERSON_FRAGMENT,
        side: THREE.DoubleSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [shared],
  );

  // Beside the visitor, not behind them, or the first thing they do is hide it.
  const start = viewport.width >= viewport.height ? 1.35 : 0;
  const place = useRef({ x: start, y: 0.2, goalX: start, goalY: 0.2, scale: 0.72 });
  const room = useRef<THREE.Mesh>(null);
  const person = useRef<THREE.Mesh>(null);
  const hung = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const state = useRef({
    version: 0,
    outline: 0,
    mask: null as THREE.DataTexture | null,
    light: 1,
    wasPinching: false,
    offsetX: 0,
    offsetY: 0,
  });

  useEffect(() => () => picture?.dispose(), [picture]);
  useEffect(() => () => state.current.mask?.dispose(), []);

  useEffect(() => {
    bridge.nudge = (scale) => {
      place.current.scale = THREE.MathUtils.clamp(place.current.scale * scale, 0.3, 1.5);
      invalidate();
    };
  }, [bridge, invalidate]);

  // Dragged with a mouse or a finger.
  useEffect(() => {
    let dragging: { x: number; y: number } | null = null;
    const toWorld = (px: number) => (px / Math.max(domElement.clientHeight, 1)) * visibleHeight(0);
    const onDown = (event: PointerEvent) => {
      dragging = { x: event.clientX, y: event.clientY };
      domElement.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      place.current.goalX += toWorld(event.clientX - dragging.x);
      place.current.goalY -= toWorld(event.clientY - dragging.y);
      dragging = { x: event.clientX, y: event.clientY };
      invalidate();
    };
    const onUp = () => {
      dragging = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      place.current.scale = THREE.MathUtils.clamp(place.current.scale * (1 - event.deltaY * 0.001), 0.3, 1.5);
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
  }, [domElement, invalidate]);

  const spread = useMemo(() => ({ value: 0 }), []);
  const sheen = useMemo(() => ({ value: 0 }), []);
  const sweep = useMemo(() => ({ value: 99 }), []);

  useFrame((_, delta) => {
    const s = state.current;
    const p = place.current;
    const aspect = viewport.width / Math.max(viewport.height, 1);
    const frameData = sensor.frame;
    shared.picture.value = picture;

    if (live && frameData.version !== s.version) {
      s.version = frameData.version;
      if (picture) picture.needsUpdate = true;

      const { person: outline, hand } = frameData;
      if (outline.version !== s.outline) {
        s.outline = outline.version;
        if (s.mask?.image.width !== outline.width) {
          s.mask?.dispose();
          s.mask = new THREE.DataTexture(
            new Uint8Array(outline.width * outline.height),
            outline.width,
            outline.height,
            THREE.RedFormat,
          );
          s.mask.minFilter = THREE.LinearFilter;
          s.mask.magFilter = THREE.LinearFilter;
          s.mask.flipY = false;
          shared.person.value = s.mask;
          shared.ready.value = 1;
        }
        solidPerson(outline.labels, outline.width, outline.height, s.mask.image.data as Uint8Array);
        s.mask.needsUpdate = true;
      }

      // Pinch in the air to take hold of the frame, wherever your hand is.
      const height = visibleHeight(0);
      const handX = (hand.x - 0.5) * height * aspect;
      const handY = (0.5 - hand.y) * height;
      if (hand.pinching && !s.wasPinching) {
        s.offsetX = p.goalX - handX;
        s.offsetY = p.goalY - handY;
      }
      if (hand.pinching) {
        p.goalX = handX + s.offsetX;
        p.goalY = handY + s.offsetY;
      }
      s.wasPinching = hand.pinching;
    }

    p.x = THREE.MathUtils.damp(p.x, p.goalX, 14, delta);
    p.y = THREE.MathUtils.damp(p.y, p.goalY, 14, delta);

    s.light = THREE.MathUtils.damp(s.light, dark ? 0.26 : 1, 3.5, delta);
    shared.dim.value = s.light;
    shared.spill.value.set(colour.r, colour.g, colour.b);

    const pictureAspect = frameData.picture.width / Math.max(frameData.picture.height, 1);
    if (live && room.current && person.current) {
      const [roomWidth, roomHeight] = coverAt(FAR_Z, aspect, pictureAspect);
      room.current.scale.set(-roomWidth, roomHeight, 1);
      const [nearWidth, nearHeight] = coverAt(NEAR_Z, aspect, pictureAspect);
      person.current.scale.set(-nearWidth, nearHeight, 1);
    }
    if (hung.current) {
      hung.current.position.set(p.x, p.y, WALL_Z + 0.01);
      const scale = p.scale * size;
      hung.current.scale.setScalar(scale);

      // The frame's own light on the wall, stronger the darker the room.
      if (halo.current) {
        const reach = frame.width * scale * 3.1;
        halo.current.position.set(p.x, p.y - 0.1 * scale, FAR_Z + 0.02);
        halo.current.scale.set(reach, reach * 1.1, 1);
        (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.13 + (1 - s.light) * 0.6;
      }
      if (shadow.current) {
        const width = frame.width * scale;
        shadow.current.position.set(p.x + width * 0.05, p.y - width * 0.09, FAR_Z + 0.01);
        shadow.current.scale.set(width * 1.9, frame.height * scale * 1.75, 1);
        (shadow.current.material as THREE.MeshBasicMaterial).opacity = 0.34 * s.light;
      }
    }
  });

  return (
    <>
      {live ? (
        <mesh ref={room} position={[0, 0, FAR_Z]} material={roomMaterial} renderOrder={-3}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ) : (
        <mesh position={[0, 0, FAR_Z]} renderOrder={-3}>
          <planeGeometry args={[40, 30]} />
          <meshBasicMaterial color={dark ? "#3a3734" : "#d8d3cc"} />
        </mesh>
      )}
      <mesh ref={shadow} renderOrder={-2}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={glow} color="#000000" transparent opacity={0.34} depthWrite={false} />
      </mesh>
      <mesh ref={halo} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glow}
          color={colour}
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <group ref={hung}>
        <FrameModel key={slug} slug={slug} sweep={sweep} spread={spread} sheen={sheen} />
      </group>
      {live && (
        <mesh ref={person} position={[0, 0, NEAR_Z]} material={personMaterial} renderOrder={10}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      )}
    </>
  );
}

export default function WallStage({
  slug,
  onSelect,
  onClose,
}: {
  slug: FrameSlug;
  onSelect: (slug: FrameSlug) => void;
  onClose: () => void;
}) {
  const [sensor] = useState(() => new WallSensor());
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dark, setDark] = useState(false);
  const [bridge] = useState(() => ({ nudge: (scale: number) => void scale }));

  useSyncExternalStore(sensor.subscribe, sensor.getVersion, getServerVersion);
  const { status } = sensor;
  const live = status === "running";
  const busy = status === "requesting" || status === "loading";
  const refused = status === "denied" || status === "unsupported" || status === "error";

  useEffect(() => () => sensor.stop(), [sensor]);

  const openCamera = useCallback(() => {
    if (videoRef.current) void sensor.start(videoRef.current);
  }, [sensor]);

  const savePhoto = useCallback(() => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `oneframe-${slug}-on-my-wall.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }, "image/png");
  }, [slug]);

  const index = MUSEUM_FRAMES.findIndex((item) => item.slug === slug);
  const kit = MUSEUM_FRAMES[index];
  const step = (by: number) => {
    const next = (index + by + MUSEUM_FRAMES.length) % MUSEUM_FRAMES.length;
    onSelect(MUSEUM_FRAMES[next].slug);
  };

  return (
    <div className="museum-wall">
      {/* Never shown: the stage draws frames captured from it. It stays mounted and 1px
          rather than hidden, because a video that is not rendered may stop decoding. */}
      <video
        ref={videoRef}
        aria-hidden
        playsInline
        muted
        className="pointer-events-none absolute left-0 top-0 size-px opacity-0"
      />

      <div className="absolute inset-0">
        <Canvas
          flat
          dpr={[1, 2]}
          camera={{ fov: FOV, position: [0, 0, CAMERA_Z], near: 0.1, far: 40 }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onCreated={({ gl }) => {
            canvasRef.current = gl.domElement;
          }}
        >
          <Suspense fallback={null}>
            <WallScene sensor={sensor} slug={slug} live={live} dark={dark} size={1} bridge={bridge} />
          </Suspense>
        </Canvas>
      </div>

      <div className="museum-overlay museum-overlay-wall">
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="museum-chip shrink-0" onClick={onClose}>
            <span aria-hidden>←</span> Back to the museum
          </button>
          {live && <p className="museum-chip museum-chip-quiet">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>}
        </div>

        {!live && (
          <div className="museum-card mx-auto self-center md:ml-[7%]">
            <p className="museum-label">On the road to your walls</p>
            <h2 className="museum-title mt-2 text-[1.4rem]">See {kit.name} on your wall</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-white/70">
              {refused
                ? "The camera isn't available here, so it's hanging on a plain wall instead. Drag it, or allow the camera in your browser and try again."
                : "The camera shows your room. Hang the frame on the wall behind you, turn the lights down, then step in front of it."}
            </p>
            <button
              type="button"
              className="museum-button mt-5 w-full disabled:cursor-wait disabled:opacity-60"
              onClick={openCamera}
              disabled={busy}
            >
              {status === "requesting" ? "Waiting for your camera" : refused ? "Try the camera again" : "Open camera"}
            </button>
            <p className="museum-label mt-4">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          {live && (
            <p className="museum-chip museum-chip-quiet">Pinch the air to move it, or drag it. Scroll to resize.</p>
          )}
          <div className="museum-bar">
            <button type="button" className="museum-tool" aria-label="Previous frame" onClick={() => step(-1)}>
              ←
            </button>
            <span className="museum-tool-label" aria-live="polite">
              {kit.name}
            </span>
            <button type="button" className="museum-tool" aria-label="Next frame" onClick={() => step(1)}>
              →
            </button>
            <span className="museum-rule" aria-hidden />
            <button type="button" className="museum-tool" aria-label="Smaller" onClick={() => bridge.nudge(0.9)}>
              −
            </button>
            <button type="button" className="museum-tool" aria-label="Larger" onClick={() => bridge.nudge(1.1)}>
              +
            </button>
            <span className="museum-rule" aria-hidden />
            <button type="button" className="museum-tool museum-tool-text" aria-pressed={dark} onClick={() => setDark(!dark)}>
              {dark ? "Lights up" : "Lights down"}
            </button>
            {live && (
              <button type="button" className="museum-tool museum-tool-text" onClick={savePhoto}>
                Save photo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
