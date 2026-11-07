import * as THREE from "three";

import { PIZZA_MAP, PIZZA_SHEET, type PizzaPiece } from "@/content/pizza";

const VERTEX = /* glsl */ `
  uniform vec2 centre;
  uniform float half_size;
  uniform float turn;
  uniform vec2 shift;
  uniform vec4 cell;
  out vec2 sheetUv;

  void main() {
    vec2 corner = position.xy * 2.0;
    float c = cos(turn);
    float s = sin(turn);
    vec2 turned = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * half_size;
    vec2 at = centre + turned + shift;
    gl_Position = vec4(at * 2.0 - 1.0, 0.0, 1.0);
    sheetUv = cell.xy + uv * cell.zw;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D rawSheet;
  uniform sampler2D bakedSheet;
  uniform sampler2D shapeSheet;
  uniform sampler2D surfaceSheet;
  uniform float turn;
  uniform float shadow;
  uniform vec4 cell;
  in vec2 sheetUv;

  layout(location = 0) out vec4 raw;
  layout(location = 1) out vec4 baked;
  layout(location = 2) out vec4 shape;
  layout(location = 3) out vec4 surface;

  void main() {
    if (shadow > 0.5) {
      // The piece's own outline, out of focus: the mipmap has done the blurring.
      vec2 inCell = clamp(sheetUv, cell.xy, cell.xy + cell.zw);
      float soft = textureLod(rawSheet, inCell, 3.6).a;
      raw = vec4(0.0, 0.0, 0.0, soft * 0.5);
      baked = vec4(0.03, 0.012, 0.0, soft * 0.62);
      shape = vec4(0.0);
      surface = vec4(0.0);
      return;
    }

    vec4 rawColour = texture(rawSheet, sheetUv);
    vec4 bakedColour = texture(bakedSheet, sheetUv);
    vec4 form = texture(shapeSheet, sheetUv);
    vec2 slope = form.xy * 2.0 - 1.0;
    float c = cos(turn);
    float s = sin(turn);
    slope = vec2(slope.x * c - slope.y * s, slope.x * s + slope.y * c);

    raw = rawColour;
    baked = bakedColour;
    shape = vec4(slope * 0.5 + 0.5, form.z, rawColour.a);
    surface = vec4(texture(surfaceSheet, sheetUv).xyz, rawColour.a);
  }
`;

export type ToppingSheets = {
  raw: THREE.Texture;
  baked: THREE.Texture;
  shape: THREE.Texture;
  surface: THREE.Texture;
};

/**
 * Everything on the pizza, as one flat layer in four textures: colour raw, colour baked,
 * shape and surface. A piece is drawn in once when it lands, so a hundred toppings cost
 * the frame no more than one, and each is part of the same surface as the cheese: the
 * lens, the reflections and the oven all treat them as one thing.
 */
export class ToppingLayer {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly material: THREE.ShaderMaterial;

  constructor(size: number, sheets: ToppingSheets) {
    this.target = new THREE.WebGLRenderTarget(size, size, {
      count: 4,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
    });

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        rawSheet: { value: sheets.raw },
        bakedSheet: { value: sheets.baked },
        shapeSheet: { value: sheets.shape },
        surfaceSheet: { value: sheets.surface },
        centre: { value: new THREE.Vector2() },
        half_size: { value: 0.1 },
        turn: { value: 0 },
        shift: { value: new THREE.Vector2() },
        cell: { value: new THREE.Vector4() },
        shadow: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  private draw(gl: THREE.WebGLRenderer, piece: PizzaPiece, shadow: boolean): void {
    const uniforms = this.material.uniforms;
    const row = PIZZA_SHEET.row(piece.topping);
    uniforms.centre.value.set(piece.x / PIZZA_MAP.metres + 0.5, piece.y / PIZZA_MAP.metres + 0.5);
    uniforms.half_size.value = PIZZA_SHEET.cellMetres / PIZZA_MAP.metres / 2;
    uniforms.turn.value = piece.turn;
    uniforms.cell.value.set(
      piece.variant / PIZZA_SHEET.variants,
      row / PIZZA_SHEET.rows,
      1 / PIZZA_SHEET.variants,
      1 / PIZZA_SHEET.rows,
    );
    uniforms.shadow.value = shadow ? 1 : 0;
    // Away from the window, whichever way the piece itself has turned.
    uniforms.shift.value.set(shadow ? 0.0035 : 0, shadow ? -0.0016 : 0);
    gl.render(this.scene, this.camera);
  }

  private inTarget(gl: THREE.WebGLRenderer, work: () => void): void {
    const before = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(this.target);
    work();
    gl.setRenderTarget(before);
    gl.autoClear = autoClear;
  }

  stamp(gl: THREE.WebGLRenderer, pieces: PizzaPiece[]): void {
    this.inTarget(gl, () => {
      for (const piece of pieces) {
        this.draw(gl, piece, true);
        this.draw(gl, piece, false);
      }
    });
  }

  /** Starts again from a list, because something was taken off. */
  redraw(gl: THREE.WebGLRenderer, pieces: PizzaPiece[]): void {
    this.inTarget(gl, () => {
      const colour = new THREE.Color();
      gl.getClearColor(colour);
      const alpha = gl.getClearAlpha();
      gl.setClearColor(0x000000, 0);
      gl.clear(true, false, false);
      gl.setClearColor(colour, alpha);
      for (const piece of pieces) {
        this.draw(gl, piece, true);
        this.draw(gl, piece, false);
      }
    });
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
