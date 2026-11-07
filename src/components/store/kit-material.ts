import {
  DoubleSide,
  FrontSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  type Vector2,
  type Vector4,
} from "three";

import type { KitSlug } from "@/content/store";
import { FIT_COLS, FIT_LEFT, FIT_ROWS, FIT_STEP } from "@/lib/vision/garment-fit";

const loader = new TextureLoader();

/** The exposure the baked room is shown at (EXPOSURE in scripts/store_bake_post.py).
 *  The panorama is stored raw, so anything lit by it needs the same lift to match. */
export const ROOM_EXPOSURE = 1.3;

/** One knit tile is 1.6 cm of cloth, and a metre of cloth is 0.645 of the atlas. */
const KNIT_REPEAT = 1 / (0.016 * 0.645);

export type KitResolution = "1k" | "2k" | "4k";

export function kitUrl(slug: KitSlug, resolution: KitResolution): string {
  const suffix = resolution === "2k" ? "" : `-${resolution}`;
  return `/store/kits/${slug}${suffix}.webp`;
}

/** glTF's UVs put the image's top at v = 0, the opposite of three's default. */
export function asGltfTexture(texture: Texture, colour: boolean, anisotropy = 8): Texture {
  texture.flipY = false;
  texture.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function loadKit(slug: KitSlug, resolution: KitResolution): Promise<Texture> {
  return loader.loadAsync(kitUrl(slug, resolution)).then((texture) => asGltfTexture(texture, true, 12));
}

/** Cloth for shirts seen from across the room. */
export function railMaterial(map: Texture, normalMap: Texture): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map,
    normalMap,
    roughness: 0.74,
    metalness: 0,
    side: DoubleSide,
  });
}

/** What the mirror feeds the shirt's shader every frame. */
export interface FitUniforms {
  /** Per row down the torso: a width multiplier and a sideways shift. */
  fitRows: { value: Vector2[] };
  fitTop: { value: number };
  fitSpan: { value: number };
  /** Per column across the shoulders: how far the seam moves up. */
  fitSeam: { value: Float32Array };
  /** Where the body is: see paintBodyMask. */
  bodyMask: { value: Texture | null };
  /** Takes gl_FragCoord to a place in the picture, then the picture to the mask. */
  maskMap: { value: Vector4 };
  maskCrop: { value: Vector4 };
  maskOn: { value: number };
  /** The camera's z, to tell the near side of the body from the far. */
  cameraDepth: { value: number };
}

/**
 * Bends the shirt to the body, before the skeleton moves it. Sleeves mostly follow
 * their bones, and the collar keeps its size: a neck doesn't get wider with the chest.
 */
const FIT_VERTEX = `
{
  vSleeve = dot(skinWeight, step(vec4(1.5), skinIndex));

  float column = clamp((transformed.x - (${FIT_LEFT.toFixed(3)})) / ${FIT_STEP.toFixed(3)}, 0.0, float(FIT_COLS - 1));
  int left = int(floor(column));
  int right = min(left + 1, FIT_COLS - 1);
  float seam = mix(fitSeam[left], fitSeam[right], fract(column));
  transformed.y += seam * smoothstep(0.56, 0.67, transformed.y);

  float row = clamp((fitTop - transformed.y) / fitSpan, 0.0, 1.0) * float(FIT_ROWS - 1);
  int low = int(floor(row));
  int high = min(low + 1, FIT_ROWS - 1);
  vec2 fit = mix(fitRows[low], fitRows[high], fract(row));
  float fromNeck = length(vec2(transformed.x, transformed.z));
  float neck = (1.0 - smoothstep(0.1, 0.17, fromNeck)) * smoothstep(0.6, 0.68, transformed.y);
  float share = (1.0 - vSleeve * 0.7) * (1.0 - neck);
  transformed.x = mix(transformed.x, transformed.x * fit.x + fit.y, share);
  transformed.z = mix(transformed.z, transformed.z * fit.x, share);

  // A collar closes on the neck when it is worn. The dress form's is wider than any
  // neck, and left open it shows the lining all the way round.
  transformed.xz *= 1.0 - neck * 0.2;
  transformed.y += neck * 0.018 * step(0.0, transformed.z);
}
`;

/** Ends the shirt where the body ends, softly, so its edge is the body's edge. */
const FIT_FRAGMENT = `
if (maskOn > 0.5) {
  vec2 place = (gl_FragCoord.xy * maskMap.xy + maskMap.zw - maskCrop.xy) / maskCrop.zw;
  // Five taps round the edge: the outline is 256 pixels across, and stretched to the
  // screen a hard step shows as a row of dashes down the side of the shirt.
  vec2 texel = 1.2 / vec2(textureSize(bodyMask, 0));
  vec3 body = (
    texture2D(bodyMask, place).rgb * 2.0 +
    texture2D(bodyMask, place + vec2(texel.x, 0.0)).rgb +
    texture2D(bodyMask, place - vec2(texel.x, 0.0)).rgb +
    texture2D(bodyMask, place + vec2(0.0, texel.y)).rgb +
    texture2D(bodyMask, place - vec2(0.0, texel.y)).rgb
  ) / 6.0;
  // A sleeve always draws; the torso's far side only over clothes, never over a neck.
  float far = (1.0 - smoothstep(-14.0, 2.0, vDepth)) * (1.0 - smoothstep(0.35, 0.75, vSleeve));
  float allowed = mix(body.r, body.b, far);
  float inside = step(0.0, place.x) * step(place.x, 1.0) * step(0.0, place.y) * step(place.y, 1.0);
  gl_FragColor.a *= smoothstep(0.3, 0.62, allowed) * inside;
  if (gl_FragColor.a < 0.01) discard;
}
`;

/**
 * Cloth for a shirt held up close: the rail's, plus a sheen and the knit.
 *
 * The knit is a tiling normal map laid over the seams' normal map, which three
 * has no slot for, so it is folded in at the end of the normal chunk. It vanishes
 * at a distance through its own mipmaps, and shows up as the shirt comes near.
 */
export function closeUpMaterial(
  map: Texture,
  normalMap: Texture,
  knit: Texture,
  options: { backfaces: boolean; fit?: FitUniforms },
): MeshPhysicalMaterial {
  knit.wrapS = RepeatWrapping;
  knit.wrapT = RepeatWrapping;
  knit.colorSpace = NoColorSpace;

  const material = new MeshPhysicalMaterial({
    map,
    normalMap,
    roughness: 0.72,
    metalness: 0,
    // Just enough to catch the light at a fold. More turns black to grey.
    sheen: 0.12,
    sheenRoughness: 0.6,
    sheenColor: 0xffffff,
    side: options.backfaces ? DoubleSide : FrontSide,
  });

  const { fit } = options;
  if (fit) material.transparent = true;
  material.customProgramCacheKey = () => (fit ? "kit-fitted" : "kit");

  material.onBeforeCompile = (shader) => {
    shader.uniforms.knitMap = { value: knit };
    shader.uniforms.knitRepeat = { value: KNIT_REPEAT };
    if (fit) {
      Object.assign(shader.uniforms, fit);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          #define FIT_ROWS ${FIT_ROWS}
          #define FIT_COLS ${FIT_COLS}
          uniform vec2 fitRows[FIT_ROWS];
          uniform float fitSeam[FIT_COLS];
          uniform float fitTop;
          uniform float fitSpan;
          uniform float cameraDepth;
          varying float vSleeve;
          varying float vDepth;`,
        )
        .replace("#include <morphtarget_vertex>", `#include <morphtarget_vertex>\n${FIT_VERTEX}`)
        .replace("#include <project_vertex>", "#include <project_vertex>\nvDepth = mvPosition.z + cameraDepth;");
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform sampler2D bodyMask;
          uniform vec4 maskMap;
          uniform vec4 maskCrop;
          uniform float maskOn;
          varying float vSleeve;
          varying float vDepth;`,
        )
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>\n${FIT_FRAGMENT}`);
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D knitMap;\nuniform float knitRepeat;",
      )
      // Print sits on the outside of a shirt. Seen from inside, the cloth keeps
      // its colour but not the lettering: a far-off mip is the same fabric, blurred
      // past reading.
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        #ifdef DOUBLE_SIDED
          if (!gl_FrontFacing) diffuseColor.rgb = textureLod(map, vMapUv, 6.0).rgb * 0.8;
        #endif`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 knit = texture2D(knitMap, vNormalMapUv * knitRepeat).xyz * 2.0 - 1.0;
          normal = normalize(normal + tbn * vec3(knit.xy * 0.5, 0.0));
        }`,
      );
  };
  return material;
}
