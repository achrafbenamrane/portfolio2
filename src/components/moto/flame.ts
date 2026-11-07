import * as THREE from "three";

/*
 * What comes out of the exhaust: a hard blue cone with an orange flame streaming off it when the
 * nitro's open, and a short bark of fire when the throttle snaps shut at high revs. Two shells of
 * the same shape, drawn in light, so the road and the bike take on its colour through one small lamp.
 */

const SHAPE: ReadonlyArray<readonly [number, number]> = [
  [0.0, 0.0],
  [0.042, 0.0],
  [0.055, 0.09],
  [0.05, 0.28],
  [0.034, 0.56],
  [0.016, 0.82],
  [0.0, 1.0],
];

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPower;
  uniform float uLength;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 p = position;
    vAlong = p.y;
    // The tip whips about, and more the further it is from the pipe.
    float whip = p.y * p.y;
    p.x += sin(uTime * 41.0 + p.y * 9.0) * 0.05 * whip;
    p.z += cos(uTime * 37.0 + p.y * 7.0) * 0.05 * whip;
    float flutter = 0.88 + 0.12 * sin(uTime * 63.0) * sin(uTime * 29.0);
    p.y *= uLength * uPower * flutter;
    p.xz *= 0.55 + 0.45 * uPower;
    vec4 at = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-at.xyz);
    gl_Position = projectionMatrix * at;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uNear;
  uniform vec3 uFar;
  uniform float uPower;
  varying float vAlong;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // Soft at its edges, as a flame is: it's thickest looking straight through the middle.
    float through = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.4);
    float fade = (1.0 - smoothstep(0.35, 1.0, vAlong)) * through * uPower;
    vec3 colour = mix(uNear, uFar, smoothstep(0.0, 0.6, vAlong));
    gl_FragColor = vec4(colour * fade, 1.0);
  }
`;

function shell(near: THREE.Color, far: THREE.Color, length: number, width: number, time: { value: number }, power: { value: number }) {
  const geometry = new THREE.LatheGeometry(
    SHAPE.map(([radius, along]) => new THREE.Vector2(radius * width, along)),
    14,
  );
  return new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: { uTime: time, uPower: power, uLength: { value: length }, uNear: { value: near }, uFar: { value: far } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
}

export class Flame {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly power = { value: 0 };
  private readonly glow = new THREE.PointLight(new THREE.Color(1, 0.46, 0.14), 0, 5, 2);
  private bark = 0;

  /** `at` and `way` are the end of the silencer and where it points, in the bike's own space. */
  constructor(at: THREE.Vector3, way: THREE.Vector3) {
    this.group.position.copy(at);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), way.clone().normalize());
    const core = shell(new THREE.Color(0.9, 1.6, 4.2), new THREE.Color(0.4, 0.9, 3.2), 0.5, 0.62, this.time, this.power);
    const body = shell(new THREE.Color(4.6, 2.2, 0.7), new THREE.Color(3.6, 0.8, 0.08), 1.25, 1, this.time, this.power);
    this.glow.position.set(0, 0.32, 0);
    this.group.add(body, core, this.glow);
    this.group.visible = false;
  }

  /** A short bark of fire, as the throttle snaps shut high in the revs. */
  pop(strength: number) {
    this.bark = Math.max(this.bark, strength);
  }

  update(dt: number, boost: number, clock: number) {
    this.bark = Math.max(this.bark - dt * 7, 0);
    const power = Math.min(Math.max(boost, this.bark * 0.5), 1);
    this.time.value = clock;
    this.power.value = power;
    this.group.visible = power > 0.02;
    this.glow.intensity = power * 2.6 * (0.8 + 0.2 * Math.sin(clock * 53));
  }
}
