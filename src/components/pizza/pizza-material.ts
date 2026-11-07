import * as THREE from "three";

import { PIZZA_MAP } from "@/content/pizza";

export type PizzaTextures = {
  dough: THREE.Texture;
  sauced: THREE.Texture;
  cheesed: THREE.Texture;
  baked: THREE.Texture;
  normalRaw: THREE.Texture;
  normalBaked: THREE.Texture;
  surface: THREE.Texture;
  heights: THREE.Texture;
  order: THREE.Texture;
};

export type PizzaUniforms = {
  sauce: { value: number };
  cheese: { value: number };
  heat: { value: number };
  /** What the baked light is multiplied by: the oven turns it down and warms it. */
  ambient: { value: THREE.Color };
};

const DECLARATIONS = /* glsl */ `
  uniform sampler2D doughMap;
  uniform sampler2D saucedMap;
  uniform sampler2D cheesedMap;
  uniform sampler2D bakedMap;
  uniform sampler2D normalRawMap;
  uniform sampler2D normalBakedMap;
  uniform sampler2D surfaceMap;
  uniform sampler2D heightsMap;
  uniform sampler2D orderMap;
  uniform sampler2D layerRaw;
  uniform sampler2D layerBaked;
  uniform sampler2D layerShape;
  uniform sampler2D layerSurface;
  uniform float sauce;
  uniform float cheese;
  uniform float heat;
  uniform vec3 ambient;
  varying vec2 pizzaUv;

  // Heat reaches the rim first and creeps inward, and melting takes a while everywhere.
  // Exactly nothing before the oven, and exactly everything after it.
  float heatAt(float first) {
    float spreading = smoothstep(first - 0.2, first + 0.34, heat * 1.32 - 0.1);
    return mix(spreading * smoothstep(0.0, 0.05, heat), 1.0, smoothstep(0.9, 1.0, heat));
  }
`;

// Works out, once per pixel, how far along this spot of the pizza is. The first chunk
// the fragment shader reaches, so everything after it can use the answers.
const STATE = /* glsl */ `
  vec4 order = texture2D(orderMap, pizzaUv);
  if (order.a < 0.5) discard;

  float sauceHere = smoothstep(order.r - 0.03, order.r + 0.03, sauce * 1.06);
  float cheeseHere = order.g > 0.002 ? smoothstep(order.g - 0.02, order.g + 0.02, cheese * 1.04) : 0.0;
  float heatHere = heatAt(order.b);

  vec4 topShape = texture2D(layerShape, pizzaUv);
  vec4 topSurface = texture2D(layerSurface, pizzaUv);

  // Red and green are the baked pizza's shine and roughness; blue is the raw one's.
  vec3 surfaceHere = texture2D(surfaceMap, pizzaUv).rgb;
  float shineRaw = mix(0.3 * sauceHere, 0.05, cheeseHere);
  vec2 shine = vec2(mix(shineRaw, surfaceHere.r, heatHere), mix(surfaceHere.b, surfaceHere.g, heatHere));
  shine = topSurface.rg + shine * (1.0 - topSurface.a);

  float roughnessFactor = shine.y;
  float pizzaGloss = shine.x;
`;

const NORMAL = /* glsl */ `
  vec3 slopeRaw = texture2D(normalRawMap, pizzaUv).xyz * 2.0 - 1.0;
  vec3 slopeBaked = texture2D(normalBakedMap, pizzaUv).xyz * 2.0 - 1.0;
  // Bare dough is smooth: the raw map has the strands in it, so they arrive with the cheese.
  slopeRaw = mix(vec3(0.0, 0.0, 1.0), slopeRaw, max(sauceHere * 0.5, cheeseHere));
  vec3 slope = mix(slopeRaw, slopeBaked, heatHere);

  // The layer holds slopes multiplied by coverage. A piece lies flatter before it cooks.
  vec2 topSlope = (topShape.xy * 2.0 - topShape.a) * mix(0.4, 1.0, heatHere);
  slope.xy = slope.xy * (1.0 - topShape.a) + topSlope;
  normal = normalize(normalMatrix * normalize(slope));
`;

const COLOUR = /* glsl */ `
  vec3 raw = texture2D(doughMap, pizzaUv).rgb;
  raw = mix(raw, texture2D(saucedMap, pizzaUv).rgb, sauceHere);
  raw = mix(raw, texture2D(cheesedMap, pizzaUv).rgb, cheeseHere);
  vec3 cooked = texture2D(bakedMap, pizzaUv).rgb;

  vec4 topRaw = texture2D(layerRaw, pizzaUv);
  vec4 topCooked = texture2D(layerBaked, pizzaUv);
  // The sheets were lit from overhead. This gives each piece the window's side of it back.
  float side = 1.0 + 0.62 * dot(topSlope, vec2(-0.8, 0.46));
  raw = topRaw.rgb * side + raw * (1.0 - topRaw.a);
  cooked = topCooked.rgb * side + cooked * (1.0 - topCooked.a);

  // Raw food is pale and the same light overexposes it, so it's printed down a stop.
  totalEmissiveRadiance = mix(raw * 0.62, cooked, heatHere) * ${PIZZA_MAP.beautyRange.toFixed(1)} * ambient;
`;

const VERTEX_SHAPE = /* glsl */ `
  pizzaUv = uv;
  vec3 heightsHere = texture2D(heightsMap, uv).rgb;
  vec3 orderHere = texture2D(orderMap, uv).rgb;
  float rise = heatAt(orderHere.b);
  float lifted = mix(heightsHere.r, heightsHere.g, rise) * ${PIZZA_MAP.heightRange.toFixed(4)};
  // Soft, from a smaller mip: a straight wall here stretches the cheese into a comb.
  vec4 topHere = textureLod(layerShape, uv, 2.6);
  lifted += topHere.b * ${PIZZA_MAP.stampHeightRange.toFixed(4)} * mix(1.0, 0.6, rise);
  transformed.z += lifted;
`;

/**
 * The light is baked, so the material is black and glows with the bakes. All it adds on
 * top is reflection, the one thing that has to move. Each stage of the pizza is in there
 * at once, so sauce, cheese and the oven are only a matter of a few numbers changing.
 */
export function makePizzaMaterial(textures: PizzaTextures, layer: THREE.WebGLRenderTarget) {
  const uniforms: PizzaUniforms = {
    sauce: { value: 0 },
    cheese: { value: 0 },
    heat: { value: 0 },
    ambient: { value: new THREE.Color(1, 1, 1) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: "#000000",
    roughness: 1,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    ior: 1.46,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      doughMap: { value: textures.dough },
      saucedMap: { value: textures.sauced },
      cheesedMap: { value: textures.cheesed },
      bakedMap: { value: textures.baked },
      normalRawMap: { value: textures.normalRaw },
      normalBakedMap: { value: textures.normalBaked },
      surfaceMap: { value: textures.surface },
      heightsMap: { value: textures.heights },
      orderMap: { value: textures.order },
      layerRaw: { value: layer.textures[0] },
      layerBaked: { value: layer.textures[1] },
      layerShape: { value: layer.textures[2] },
      layerSurface: { value: layer.textures[3] },
    });

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${DECLARATIONS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_SHAPE}`);

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform mat3 normalMatrix;\n${DECLARATIONS}`)
      .replace("#include <roughnessmap_fragment>", STATE)
      .replace("#include <normal_fragment_maps>", NORMAL)
      .replace("#include <clearcoat_normal_fragment_maps>", "clearcoatNormal = normal;")
      .replace("#include <emissivemap_fragment>", COLOUR)
      .replace(
        "#include <lights_physical_fragment>",
        THREE.ShaderChunk.lights_physical_fragment.replace(
          "material.clearcoat = clearcoat;",
          "material.clearcoat = clearcoat * pizzaGloss;",
        ),
      );
  };

  return { material, uniforms };
}
