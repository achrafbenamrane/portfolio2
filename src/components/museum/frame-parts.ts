import * as THREE from "three";

import { museumLayout } from "@/content/museum";

const { frame } = museumLayout;

/** A plain glTF-style texture: top of the image at v = 0, as the baked UVs have it. */
export function asBaked(texture: THREE.Texture, anisotropy = 8): THREE.Texture {
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function asPicture(texture: THREE.Texture, anisotropy = 8): THREE.Texture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

/** The print fills the back of the box, right up behind the LED bar. */
export function plateGeometry(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(frame.plateWidth, frame.openingHeight);
}

/**
 * The car or bike as a shallow relief, not a flat card.
 *
 * A cut-out on a plane gives itself away the moment you look past it. Pushed out from
 * the relief map it curves away at the edges, so its outline shifts as a solid does.
 */
export function reliefGeometry(
  width: number,
  height: number,
  relief: HTMLImageElement | ImageBitmap,
  depth: number,
): THREE.PlaneGeometry {
  const segments = 72;
  const geometry = new THREE.PlaneGeometry(width, height, segments, segments);

  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return geometry;
  context.drawImage(relief, 0, 0, 96, 96);
  const { data } = context.getImageData(0, 0, 96, 96);

  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    const x = Math.min(95, Math.floor(uv.getX(i) * 96));
    const y = Math.min(95, Math.floor((1 - uv.getY(i)) * 96));
    position.setZ(i, (data[(y * 96 + x) * 4] / 255) * depth);
  }
  position.needsUpdate = true;
  return geometry;
}

/** A soft round glow, for the light hanging in the air round an LED bar. */
export function glowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.32)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A band of reflected light across the glass, which slides as the viewer moves. */
export function glassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 512, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.36, "rgba(255,255,255,0)");
    gradient.addColorStop(0.44, "rgba(255,255,255,0.8)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.3)");
    gradient.addColorStop(0.52, "rgba(255,255,255,0.7)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

/** How far the subject comes out of the frame when it is opened, in metres. */
export const SPREAD_OUT = frame.depth + 0.34;
