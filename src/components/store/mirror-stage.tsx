"use client";

/*
 * Same exemption as vision/character.tsx, for the same reason: `useFrame` is a
 * callback the React Compiler's lint rules read as running during render, and
 * moving three.js objects every frame is how R3F is meant to be driven. Going
 * through React state instead would put a 60 Hz signal back in the render path.
 */
/* eslint-disable react-hooks/immutability */

import { useEnvironment, useGLTF, useTexture } from "@react-three/drei";
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
import { clone as cloneRig } from "three/examples/jsm/utils/SkeletonUtils.js";

import { KITS, type KitSlug, kitBySlug } from "@/content/store";
import { BodySensor } from "@/lib/vision/body-sensor";
import {
  FIT_SPAN,
  FIT_TOP,
  GarmentFitter,
  idlePose,
  measureShirt,
  paintBodyMask,
} from "@/lib/vision/garment-fit";

import {
  asGltfTexture,
  closeUpMaterial,
  type FitUniforms,
  type KitResolution,
  loadKit,
  ROOM_EXPOSURE,
} from "./kit-material";

const getServerVersion = () => 0;

/** How long tracking can drop before the shirt comes off. Just long enough to ride
 *  out a blink of the model: past that, the person has moved and the shirt hasn't. */
const LOST_AFTER_MS = 240;

/** Where the mirror's camera stands. The body is fitted at z = 0. */
const CAMERA_DEPTH = 1000;

/** The neck plug's place on the shirt: see the note where it is drawn. */
const NECK_REST = new THREE.Matrix4().makeTranslation(0, 0.98, -0.012);

function Garment({
  sensor,
  slug,
  live,
  reducedMotion,
  resolution,
  onTracking,
}: {
  sensor: BodySensor;
  slug: KitSlug;
  live: boolean;
  reducedMotion: boolean;
  resolution: KitResolution;
  onTracking: (tracking: boolean) => void;
}) {
  const { scene: source } = useGLTF("/store/jersey.glb");
  const [normalSource, knitSource] = useTexture(["/store/jersey-normal.webp", "/store/jersey-knit.webp"]);
  const environment = useEnvironment({ files: "/store/env.hdr" });
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);

  const normal = useMemo(() => asGltfTexture(normalSource, false, 8), [normalSource]);
  const knit = useMemo(() => asGltfTexture(knitSource, false, 8), [knitSource]);

  const rig = useMemo(() => {
    const root = cloneRig(source);
    let skinned: THREE.SkinnedMesh | null = null;
    root.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinned = object as THREE.SkinnedMesh;
    });
    if (!skinned) throw new Error("The shirt has no skeleton");
    const mesh = skinned as THREE.SkinnedMesh;
    mesh.frustumCulled = false;
    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[0] = 0; // as worn, not hung

    const { bones, boneInverses } = mesh.skeleton;
    const rest = boneInverses.map((inverse) => inverse.clone().invert());
    for (const bone of bones) {
      bone.matrixAutoUpdate = false;
      bone.matrixWorldAutoUpdate = false;
    }
    const find = (test: (name: string) => boolean) => bones.findIndex((bone) => test(bone.name));
    return {
      root,
      mesh,
      bones,
      rest,
      hips: find((name) => name.startsWith("Hips")),
      chest: find((name) => name.startsWith("Chest")),
      // The bone called Arm.L sits at +X, which is the shirt's screen-right arm.
      armRight: find((name) => name.startsWith("Arm") && name.endsWith("L")),
      armLeft: find((name) => name.startsWith("Arm") && name.endsWith("R")),
    };
  }, [source]);

  const profile = useMemo(() => {
    const { attributes } = rig.mesh.geometry;
    return measureShirt(
      attributes.position.array,
      attributes.skinIndex.array,
      attributes.skinWeight.array,
      attributes.position.count,
    );
  }, [rig]);

  const fitter = useMemo(() => new GarmentFitter(), []);
  const uniforms = useMemo<FitUniforms>(
    () => ({
      fitRows: { value: fitter.rows },
      fitTop: { value: FIT_TOP },
      fitSpan: { value: FIT_SPAN },
      fitSeam: { value: fitter.seam },
      bodyMask: { value: null },
      maskMap: { value: new THREE.Vector4() },
      maskCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      maskOn: { value: 0 },
      cameraDepth: { value: CAMERA_DEPTH },
    }),
    [fitter],
  );

  // The picture the shirt was fitted to, drawn in the same canvas as the shirt.
  const picture = useMemo(() => {
    if (!live) return null;
    const texture = new THREE.CanvasTexture(sensor.frame.picture);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }, [live, sensor]);

  useEffect(() => () => picture?.dispose(), [picture]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __mirrorFit: fitter, __mirrorSensor: sensor });
    }
  }, [fitter, sensor]);

  useEffect(() => {
    scene.environment = environment;
    return () => {
      scene.environment = null;
    };
  }, [scene, environment]);

  // Each kit arrives as a texture on the same shirt.
  useEffect(() => {
    let current = true;
    void loadKit(slug, resolution).then((texture) => {
      if (!current) {
        texture.dispose();
        return;
      }
      const previous = rig.mesh.material as THREE.Material;
      rig.mesh.material = closeUpMaterial(texture, normal, knit, { backfaces: true, fit: uniforms });
      previous.dispose();
      invalidate();
    });
    return () => {
      current = false;
    };
  }, [slug, resolution, rig, normal, knit, uniforms, invalidate]);

  const plug = useRef<THREE.Mesh>(null);
  const backdrop = useRef<THREE.Mesh>(null);
  const pose = fitter.pose;
  const state = useRef({
    turn: 0,
    tracking: null as boolean | null,
    lastSeen: 0,
    frame: 0,
    outline: 0,
    version: 0,
    mask: null as THREE.DataTexture | null,
    // The crop of the outline in the mask, kept with it: the sensor's moves on ahead.
    crop: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      copy(from: { x: number; y: number; width: number; height: number }) {
        this.x = from.x;
        this.y = from.y;
        this.width = from.width;
        this.height = from.height;
      },
    },
    sampler: null as CanvasRenderingContext2D | null,
    exposure: ROOM_EXPOSURE,
  });

  useEffect(() => () => state.current.mask?.dispose(), []);

  useFrame(({ gl }, delta) => {
    const s = state.current;
    const frame = sensor.frame;
    const now = performance.now();

    let showing = true;
    if (live) {
      const video = {
        viewportWidth: size.width,
        viewportHeight: size.height,
        videoWidth: frame.picture.width,
        videoHeight: frame.picture.height,
      };

      if (frame.version !== s.version) {
        s.version = frame.version;
        if (picture) picture.needsUpdate = true;
        fitter.update(frame, video, profile, now);
        if (pose.valid) s.lastSeen = now;

        const { outline } = frame;
        if (outline.version !== s.outline && pose.valid) {
          s.outline = outline.version;
          if (s.mask?.image.width !== outline.width || s.mask.image.height !== outline.height) {
            s.mask?.dispose();
            s.mask = new THREE.DataTexture(
              new Uint8Array(outline.width * outline.height * 4),
              outline.width,
              outline.height,
              THREE.RGBAFormat,
            );
            s.mask.minFilter = THREE.LinearFilter;
            s.mask.magFilter = THREE.LinearFilter;
            s.mask.flipY = false;
            uniforms.bodyMask.value = s.mask;
          }
          paintBodyMask(frame, s.mask.image.data as Uint8Array, fitter.scale, video);
          s.mask.needsUpdate = true;
          s.crop.copy(outline.crop);
          uniforms.maskOn.value = 1;
        }
        uniforms.maskCrop.value.set(
          s.crop.x + fitter.drift.x,
          s.crop.y + fitter.drift.y,
          s.crop.width,
          s.crop.height,
        );

        // Match the room the visitor is in: a shirt lit for the store looks pasted
        // on in a dim bedroom. Sampled rarely, because readback stalls the GPU.
        s.frame += 1;
        if (s.frame % 24 === 0) {
          s.sampler ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
          const context = s.sampler;
          if (context) {
            context.drawImage(frame.picture, 0, 0, 12, 12);
            const { data } = context.getImageData(0, 0, 12, 12);
            let sum = 0;
            for (let i = 0; i < data.length; i += 4) {
              sum += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
            }
            const light = sum / (144 * 255);
            s.exposure = ROOM_EXPOSURE * THREE.MathUtils.clamp(0.35 + light * 0.85, 0.5, 1);
          }
        }
      }
      showing = now - s.lastSeen < LOST_AFTER_MS;

      // Cover the viewport, flipped as a mirror is. maskMap undoes the same fit.
      const cover = Math.max(size.width / video.videoWidth, size.height / video.videoHeight);
      const width = video.videoWidth * cover;
      const height = video.videoHeight * cover;
      backdrop.current?.scale.set(-width, height, 1);
      const ratio = gl.getPixelRatio();
      uniforms.maskMap.value.set(
        -1 / (ratio * width),
        -1 / (ratio * height),
        1 + (size.width - width) / (2 * width),
        (size.height + height) / (2 * height),
      );
    } else {
      if (!reducedMotion) s.turn += delta * 0.55;
      idlePose(pose, size.width, size.height, s.turn);
      fitter.relax();
      uniforms.maskOn.value = 0;
      s.exposure = ROOM_EXPOSURE;
    }

    scene.environmentIntensity = THREE.MathUtils.damp(scene.environmentIntensity, s.exposure, 3, delta);

    const tracking = !live || showing;
    if (tracking !== s.tracking) {
      s.tracking = tracking;
      onTracking(tracking);
    }

    rig.root.visible = showing;
    const matrices = [
      [rig.hips, pose.hips],
      [rig.chest, pose.chest],
      [rig.armRight, pose.armRight],
      [rig.armLeft, pose.armLeft],
    ] as const;
    for (const [index, matrix] of matrices) {
      rig.bones[index].matrixWorld.multiplyMatrices(matrix, rig.rest[index]);
    }

    if (plug.current) {
      // Only until the outline arrives: after that it puts the neck in front exactly.
      plug.current.visible = live && uniforms.maskOn.value === 0;
      plug.current.matrix.multiplyMatrices(pose.neck, NECK_REST);
      plug.current.matrixWorldNeedsUpdate = true;
    }
  });

  return (
    <>
      {/* Drawn from the frame the fit came from, not the live video: the shirt and
          the person in it are always the same moment. */}
      <mesh ref={backdrop} position={[0, 0, -3000]} renderOrder={-2} visible={live}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={picture} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
      </mesh>
      <directionalLight position={[-300, 700, 900]} intensity={0.55} />
      {/* The back of the collar is behind the visitor's neck in real life, but
          a shirt drawn over video has no neck to hide it. This cylinder writes
          depth and no colour, so that part of the collar stays undrawn and the
          real neck shows through. */}
      <mesh ref={plug} matrixAutoUpdate={false} renderOrder={-1} frustumCulled={false}>
        <cylinderGeometry args={[0.084, 0.084, 0.62, 24]} />
        <meshBasicMaterial colorWrite={false} />
      </mesh>
      <primitive object={rig.root} />
    </>
  );
}

export default function MirrorStage({
  selected,
  reducedMotion,
  resolution,
  onSelect,
  onClose,
  onLive,
}: {
  selected: KitSlug;
  reducedMotion: boolean;
  resolution: KitResolution;
  onSelect: (slug: KitSlug) => void;
  onClose: () => void;
  onLive: (live: boolean) => void;
}) {
  const [sensor] = useState(() => new BodySensor());
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tracking, setTracking] = useState(true);

  useSyncExternalStore(sensor.subscribe, sensor.getVersion, getServerVersion);
  const { status } = sensor;
  const live = status === "running";
  const busy = status === "requesting" || status === "loading";
  const refused = status === "denied" || status === "unsupported" || status === "error";

  useEffect(() => () => sensor.stop(), [sensor]);
  useEffect(() => onLive(live), [live, onLive]);

  const openCamera = useCallback(() => {
    if (videoRef.current) void sensor.start(videoRef.current);
  }, [sensor]);

  const kit = kitBySlug(selected);

  return (
    <div className="store-mirror">
      {/* Never shown: the mirror draws frames captured from it. It stays mounted
          and 1px rather than hidden, because a video that is not rendered may stop
          decoding. */}
      <video
        ref={videoRef}
        aria-hidden
        playsInline
        muted
        className="pointer-events-none absolute left-0 top-0 size-px opacity-0"
      />

      <div className="absolute inset-0">
        <Canvas
          orthographic
          flat
          dpr={[1, 2]}
          frameloop={live || !reducedMotion ? "always" : "demand"}
          camera={{ position: [0, 0, CAMERA_DEPTH], near: 0.1, far: 6000, zoom: 1 }}
          gl={{ alpha: true, antialias: true }}
        >
          <Suspense fallback={null}>
            <Garment
              sensor={sensor}
              slug={selected}
              live={live}
              reducedMotion={reducedMotion}
              resolution={resolution}
              onTracking={setTracking}
            />
          </Suspense>
        </Canvas>
      </div>

      <div className="store-glass" aria-hidden />

      <div className="home-light absolute inset-0 flex flex-col justify-between bg-transparent p-4 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <button type="button" className="store-chip shrink-0 whitespace-nowrap" onClick={onClose}>
            <span aria-hidden>←</span> Sales floor
          </button>
          {live && (
            <p className="store-chip store-chip-quiet">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
          )}
        </div>

        {!live && (
          <div className="mx-auto mb-3 mt-auto w-full max-w-sm self-center rounded-2xl bg-white/92 p-5 text-[#281b1c] shadow-xl backdrop-blur md:mx-0 md:my-0 md:mr-[6%] md:self-end md:p-6">
            <p className="meta text-dim">THE MIRROR</p>
            <h2 className="home-display mt-3 text-[1.35rem]">Wear the {kit.club} shirt</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-dim">
              {refused
                ? "The camera isn't available here, so the mirror is showing the shirt on its own. Pick another kit below, or allow the camera in your browser and try again."
                : "Stand back until your shoulders are in view. The shirt follows you, and you can change kits while you wear it."}
            </p>
            <button
              type="button"
              className="home-btn mt-5 w-full justify-center disabled:cursor-wait disabled:opacity-70"
              onClick={openCamera}
              disabled={busy}
            >
              {status === "requesting"
                ? "Waiting for your camera"
                : status === "loading"
                  ? "Loading the tracker"
                  : refused
                    ? "Try the camera again"
                    : "Open camera"}
            </button>
            <p className="meta mt-4 text-dim">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
          </div>
        )}

        {live && !tracking && (
          <p className="store-chip mx-auto self-center" role="status">
            Step back until your shoulders are in the glass
          </p>
        )}

        <div className="flex flex-col items-center gap-3">
          <p className="store-chip store-chip-quiet" aria-live="polite">
            {kit.club}
          </p>
          <ul className="store-kits" aria-label="Change kit">
            {KITS.map((candidate) => (
              <li key={candidate.slug}>
                <button
                  type="button"
                  aria-label={candidate.club}
                  aria-pressed={candidate.slug === selected}
                  className="store-swatch"
                  style={{
                    background: candidate.swatchTwo
                      ? `linear-gradient(115deg, ${candidate.swatch} 0 50%, ${candidate.swatchTwo} 50% 100%)`
                      : candidate.swatch,
                  }}
                  onClick={() => onSelect(candidate.slug)}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
