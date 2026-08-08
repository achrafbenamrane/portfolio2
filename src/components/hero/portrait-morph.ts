import * as THREE from "three";

/**
 * Portrait → origami morph, folded like real paper.
 *
 * Both ends are exact photographs. At rest the mesh is a flat plane showing the
 * portrait; fully folded it is the same plane, scaled down, showing the origami
 * shot — untouched, unlit, pixel for pixel. Everything three-dimensional lives
 * strictly in between.
 *
 * The fold itself is a sequence of half-plane creases rather than per-triangle
 * scatter. Each crease rotates everything on one side of a line about that
 * line, including whatever earlier creases already folded — which is exactly
 * what happens when you fold a folded stack. Three properties fall out of it,
 * and together they're the difference between paper and confetti:
 *
 *   · The sheet never tears. The deformation is a continuous function of the
 *     material coordinate, so neighbouring triangles cannot separate.
 *   · Creases are shared. Adjacent panels hinge about one line in opposite
 *     directions, giving real mountains and valleys instead of random tumble.
 *   · Nothing stretches. Every step is a rigid rotation, so the paper stays
 *     inextensible the way a real sheet does.
 */

/** WebP first — same pixels at roughly a sixth of the bytes. */
const PORTRAIT_PATHS = ["/portrait.webp", "/portrait.png", "/portrait.jpg"];
const ORIGAMI_PATHS = ["/origami.webp", "/origami.png", "/origami.jpg"];

export const FOLD_COUNT = 6;

/**
 * Crease lines in normalised sheet space (−1..1 on each axis).
 * `x, y` is a point on the line; `z, w` is its unit normal. Everything on the
 * positive-normal side hinges about the line.
 *
 * Ordered to crumple inward: the four edges fold over first, then two diagonals
 * close the remaining slab. Alternating signs keep it from spiralling into a
 * roll.
 */
const FOLD_LINES = [
  new THREE.Vector4(0.4, 0.0, 0.985, 0.174),
  new THREE.Vector4(-0.42, 0.0, -0.966, 0.259),
  new THREE.Vector4(0.0, 0.4, 0.174, 0.985),
  new THREE.Vector4(0.0, -0.42, -0.259, -0.966),
  new THREE.Vector4(0.12, 0.1, 0.707, 0.707),
  new THREE.Vector4(-0.1, 0.12, -0.643, 0.766),
];

/**
 * Radians at full crumple. Signs alternate to make mountains and valleys.
 *
 * These are the main tuning knob. Raising them toward π folds each panel almost
 * flat against the last and packs the sheet tighter; lowering them leaves it
 * looser and more legible mid-flight.
 */
const FOLD_ANGLES = [2.2, -2.0, 2.1, -1.9, 1.7, -1.6];

export interface MorphUniforms {
  uMorph: { value: number };
  uTime: { value: number };
  uPortrait: { value: THREE.Texture | null };
  uOrigami: { value: THREE.Texture | null };
  uFoldLine: { value: THREE.Vector4[] };
  uFoldAngle: { value: number[] };
  [key: string]: THREE.IUniform;
}

export interface PortraitGeometryOptions {
  /**
   * Quads per side. Creases can only follow mesh edges, so this sets how
   * straight they look — too coarse and every fold is visibly stepped.
   */
  segments?: number;
  size?: number;
}

/**
 * Just a plane. Unlike the scatter version this needs no per-face attributes at
 * all: the fold is a pure function of position, so it can stay indexed and the
 * vertex count halves.
 */
export function buildPortraitGeometry({
  segments = 160,
  size = 3,
}: PortraitGeometryOptions = {}): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(size, size, segments, segments);
}

const vertexShader = /* glsl */ `
  uniform float uMorph;
  uniform float uTime;
  uniform vec4 uFoldLine[${FOLD_COUNT}];
  uniform float uFoldAngle[${FOLD_COUNT}];

  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vFold;
  varying float vLayers;

  const float PI = 3.14159265;
  const float HALF = 1.5;

  /** How much smaller the origami frame is than the portrait. */
  const float SHRINK = 0.6;

  /** Sheet thickness, so stacked layers don't z-fight and read as one film. */
  const float THICKNESS = 0.02;

  mat3 rotation(vec3 a, float ang) {
    float c = cos(ang);
    float s = sin(ang);
    float t = 1.0 - c;
    return mat3(
      t * a.x * a.x + c,        t * a.x * a.y + s * a.z,  t * a.x * a.z - s * a.y,
      t * a.x * a.y - s * a.z,  t * a.y * a.y + c,        t * a.y * a.z + s * a.x,
      t * a.x * a.z + s * a.y,  t * a.y * a.z - s * a.x,  t * a.z * a.z + c
    );
  }

  void main() {
    vec2 sheet = position.xy / HALF;

    float eased = smoothstep(0.0, 1.0, uMorph);
    // Zero at both ends, one in the middle. Every crease angle and the layer
    // thickness hang off this, which is what leaves both endpoints perfectly
    // flat and makes the photographs reproduce exactly.
    float arc = sin(eased * PI);

    // Accumulated rigid transform. Composing it per-crease is what keeps the
    // surface connected: two points either side of a crease end up with
    // transforms differing by a rotation that fixes that crease, so the seam
    // holds no matter how many folds have already been applied.
    mat3 basis = mat3(1.0);
    vec3 offset = vec3(0.0);
    float layers = 0.0;

    for (int i = 0; i < ${FOLD_COUNT}; i++) {
      vec4 line = uFoldLine[i];
      if (dot(sheet - line.xy, line.zw) > 0.0) {
        vec3 hinge = normalize(basis * vec3(-line.w, line.z, 0.0));
        vec3 pivot = basis * vec3(line.xy, 0.0) + offset;
        mat3 turn = rotation(hinge, uFoldAngle[i] * arc);

        basis = turn * basis;
        offset = pivot + turn * (offset - pivot);
        layers += 1.0;
      }
    }

    vec3 folded = basis * vec3(sheet, 0.0) + offset;
    folded += (basis * vec3(0.0, 0.0, 1.0)) * layers * THICKNESS * arc;

    // A slow breath through the creases keeps the crumpled state from reading
    // as a frozen model. Scaled by arc, so it too vanishes at both ends.
    folded.z += sin(uTime * 0.8 + sheet.x * 4.0 + sheet.y * 3.0) * 0.015 * arc;

    vUv = uv;
    vFold = arc;
    vLayers = layers * arc;

    float scale = mix(1.0, SHRINK, eased) * HALF;
    vec4 mvPosition = modelViewMatrix * vec4(folded * scale, 1.0);
    vWorld = mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uMorph;
  uniform sampler2D uPortrait;
  uniform sampler2D uOrigami;

  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vFold;
  varying float vLayers;

  void main() {
    vec4 photo = texture2D(uPortrait, vUv);
    vec4 origami = texture2D(uOrigami, vUv);

    float blend = smoothstep(0.2, 0.85, uMorph);
    vec4 base = mix(photo, origami, blend);

    // Face normal from screen-space derivatives. Exact for any deformation,
    // and it makes each crease a hard shading break the way a real fold is.
    vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (!gl_FrontFacing) normal = -normal;

    vec3 view = normalize(-vWorld);
    float key = max(dot(normal, normalize(vec3(-0.45, 0.75, 0.55))), 0.0);
    float fill = max(dot(normal, normalize(vec3(0.6, -0.3, 0.5))), 0.0);

    // Paper is matte but picks up a faint sheen at grazing angles.
    float sheen = pow(1.0 - max(dot(normal, view), 0.0), 3.0);

    // Cheap occlusion: the more creases a point sits under, the more buried it
    // is, so deep folds go darker without tracing anything.
    float occlusion = 1.0 - 0.09 * vLayers;

    float shade = (0.60 + 0.55 * key + 0.16 * fill + 0.10 * sheen) * occlusion;

    // Both photographs already carry their own light, so at either end this
    // resolves to exactly 1 and the image is reproduced untouched.
    float lit = mix(1.0, shade, vFold);

    // Mid-flight the sheet is solid paper, so the two cut-outs union rather
    // than cross-fade — otherwise it turns half-transparent on the way across.
    float alpha = mix(base.a, max(photo.a, origami.a), vFold);

    gl_FragColor = vec4(base.rgb * lit, alpha);
  }
`;

export function createMorphMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uPortrait: { value: null },
      uOrigami: { value: null },
      uFoldLine: { value: FOLD_LINES },
      uFoldAngle: { value: FOLD_ANGLES },
    } satisfies MorphUniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide, // folded layers show their backs
  });
}

export interface HeroTextures {
  portrait: THREE.Texture;
  origami: THREE.Texture;
}

/**
 * Loads both textures, falling back to a generated placeholder if either is
 * missing — so an absent file degrades to a legible instruction rather than an
 * untextured black rectangle that reads as a broken shader.
 *
 * No colorSpace is set here and the shader skips `colorspace_fragment` on
 * purpose: with both omitted the photographs render exactly as authored.
 * Enabling one without the other is the usual cause of a washed-out result.
 */
export function loadHeroTextures(
  onLoad: (textures: HeroTextures) => void,
): void {
  const loader = new THREE.TextureLoader();

  Promise.all([
    loadFirstAvailable(loader, PORTRAIT_PATHS, "ADD YOUR PHOTO", "portrait"),
    loadFirstAvailable(loader, ORIGAMI_PATHS, "ADD THE ORIGAMI", "origami"),
  ]).then(([portrait, origami]) => onLoad({ portrait, origami }));
}

function loadFirstAvailable(
  loader: THREE.TextureLoader,
  paths: readonly string[],
  label: string,
  stem: string,
): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    const attempt = (index: number): void => {
      if (index >= paths.length) {
        resolve(createPlaceholderTexture(label, `public/${stem}.png`));
        return;
      }
      loader.load(
        paths[index],
        (texture) => {
          texture.anisotropy = 4;
          resolve(texture);
        },
        undefined,
        () => attempt(index + 1),
      );
    };
    attempt(0);
  });
}

function createPlaceholderTexture(label: string, hint: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const gradient = ctx.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, "#F0F4F7");
  gradient.addColorStop(1, "#E0E7EC");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  ctx.textAlign = "center";
  ctx.fillStyle = "#24689B";
  ctx.font = "600 26px ui-monospace, monospace";
  ctx.fillText(label, 256, 244);
  ctx.fillStyle = "#4F5D67";
  ctx.font = "20px ui-monospace, monospace";
  ctx.fillText(hint, 256, 280);

  return new THREE.CanvasTexture(canvas);
}
