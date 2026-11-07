import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import city from "@/content/moto-city.json";
import spots from "@/content/moto-bike.json";
import marks from "@/content/moto-marks.json";
import type { PuppetSensor } from "@/lib/vision/puppet-sensor";

import type { Engine } from "./audio";
import { type Controls, Fang, freshControls } from "./bike";
import { buildingMaterial, FOG, Ground, makeSea, makeSky, NearGround } from "./city";
import { Facades } from "./facade";
import { dress, makeFinishes } from "./finishes";
import { Flame } from "./flame";
import { Furniture } from "./furniture";
import { Handlebars } from "./handlebars";
import { Minimap } from "./minimap";
import { People } from "./people";
import { LANDMARKS } from "./places";
import { MAQAM_X, MAQAM_Z, Ride, type Spot, STAGE_EDGE } from "./ride";
import { dressLandmarks, makeCranes, makeWalls } from "./roadside";
import { LAMP_HEIGHT, LAMP_SPACING, makeRoad, Streets } from "./street";
import { Traffic } from "./traffic";
import { type Place, World } from "./world";

/*
 * The ride: load the city and put the bike on the esplanade of Maqam Echahid. From there it's an open
 * map: every street in Algiers goes somewhere, and the map in the corner shows the way to the city's
 * famous places, one at a time, until the rider's been to them all.
 */

/** AgX alone is flat, and a city at night needs its blacks and its colour back. */
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uBoost: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBoost;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // Under nitro, the edges of the frame stream out from the middle.
      if (uBoost > 0.01) {
        vec2 out_ = vUv - 0.5;
        float edge = dot(out_, out_) * 2.0;
        vec3 sum = c;
        for (int i = 1; i <= 6; i++) sum += texture2D(tDiffuse, vUv - out_ * edge * uBoost * 0.022 * float(i)).rgb;
        c = sum / 7.0;
      }
      float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = clamp(mix(vec3(grey), c, 1.22), 0.0, 1.0);
      // An S-curve, set by eye against the photographs: deep shadows, highlights left alone.
      vec3 curved = c * c * (3.0 - 2.0 * c);
      c = mix(c, curved, 0.72);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export type GameOptions = { small: boolean; calm: boolean };
export type Stage = "title" | "riding" | "done";
export type Target = { name: string; arabic: string; km: number };
/** `way` is how far to turn for the road out, in degrees, for as long as the rider's on the esplanade. */
export type Status = {
  stage: Stage;
  kmh: number;
  gear: number | "R";
  rpm: number;
  seconds: number;
  top: number;
  scraping: boolean;
  way: number | null;
  nitro: number;
  boosting: boolean;
  cabrage: number;
  target: Target | null;
  seen: number;
  total: number;
  arrived: string | null;
  atEdge: boolean;
  places: { name: string; arabic: string; km: number; seen: boolean; chosen: boolean }[];
};

/** How much of the colour of the night photograph is kept in reflections. */
const SKY_COLOUR = 0.12;
/** The maker's names on the bike. Turn this off and it rides with clean panels. */
const SHOW_MARKS = true;
const CITY_LIGHT = new THREE.Color(1, 0.8, 0.68);
const LED_LIGHT = new THREE.Color(0.92, 0.93, 1);
const START_ALONG = 30;
const START_ACROSS = 0;
/** How often the way to the chosen place is worked out again, in seconds, and how long a place's name stays up. */
const ROUTE_EVERY = 1.5;
const ARRIVED_FOR = 5;
const MAQAM = new THREE.Vector3(-1808, marks.maqam + 46, 2147);

class Keys {
  private readonly held = new Set<string>();
  private readonly press = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"].includes(event.code)) event.preventDefault();
    this.held.add(event.code);
  };
  private readonly lift = (event: KeyboardEvent) => this.held.delete(event.code);

  constructor() {
    window.addEventListener("keydown", this.press);
    window.addEventListener("keyup", this.lift);
  }

  private on(...codes: string[]) {
    return codes.some((code) => this.held.has(code));
  }

  /** A key is all or nothing, and a motorcycle isn't, so each one is eased in and out. */
  read(input: Controls, dt: number) {
    const right = this.on("KeyD", "ArrowRight") ? 1 : 0;
    const left = this.on("KeyA", "ArrowLeft") ? 1 : 0;
    const want = right - left;
    const rate = want === 0 ? 7 : Math.sign(want) !== Math.sign(input.steer) ? 8 : 3.6;
    input.steer += Math.max(Math.min(want - input.steer, rate * dt), -rate * dt);
    const gas = this.on("KeyW", "ArrowUp") ? 1 : 0;
    input.throttle += Math.max(Math.min(gas - input.throttle, 5 * dt), -9 * dt);
    const stop = this.on("KeyS", "ArrowDown") ? 1 : 0;
    input.brake += Math.max(Math.min(stop - input.brake, 18 * dt), -12 * dt);
    input.nitro = this.on("ShiftLeft", "ShiftRight") ? 1 : 0;
    input.wheelie = this.on("Space") ? 1 : 0;
  }

  dispose() {
    window.removeEventListener("keydown", this.press);
    window.removeEventListener("keyup", this.lift);
  }
}

export class Game {
  readonly input = freshControls();
  readonly handlebars = new Handlebars();
  ride!: Ride;
  bike!: Fang;
  stage: Stage = "title";

  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.25, 26000);
  private readonly keys = new Keys();
  private readonly options: GameOptions;
  private readonly spot: Spot = { x: 0, y: 0, z: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, slope: 0 };
  private readonly lampAhead = new THREE.PointLight(new THREE.Color(1, 0.8, 0.6), 0, 46, 1.7);
  private readonly lampBehind = new THREE.PointLight(new THREE.Color(1, 0.8, 0.6), 0, 46, 1.7);
  private readonly headlight = new THREE.SpotLight(new THREE.Color(1, 0.96, 0.9), 130, 150, 0.34, 0.65, 1.4);
  private readonly look = new THREE.Vector3();
  private readonly chase = new THREE.Vector3();
  private shadow!: THREE.Mesh;
  private roadEye!: { value: THREE.Vector3 };
  private seaTime!: { value: number };
  private facades: Facades | null = null;
  private furniture!: Furniture;
  private landmarkTime!: { value: number };
  private traffic!: Traffic;
  private people!: People;
  private world!: World;
  private streets!: Streets;
  private nearGround!: NearGround;
  private land!: HTMLImageElement;
  private minimap: Minimap | null = null;
  private route: Place[] = [];
  private routeWait = 0;
  private mapWait = 0;
  private target = 1;
  private readonly seen = new Set<number>();
  /** How close counts as being there. A park may have no street near its middle. */
  private reachOf: number[] = [];
  private arrived = "";
  private arrivedFor = 0;
  private odometer = 0;
  private flame!: Flame;
  private tailLamp: THREE.MeshBasicMaterial | null = null;
  private lastThrottle = 0;
  private grade: ShaderPass;
  private knockWait = 0;
  private engine: Engine | null = null;
  private touch: ((input: Controls) => void) | null = null;
  private sensor: PuppetSensor | null = null;
  private video: HTMLVideoElement | null = null;
  private frameId = 0;
  private lastTime = 0;
  private clock = 0;
  private rideTime = 0;
  private cameraHeading = 0;
  private cameraRoll = 0;

  constructor(canvas: HTMLCanvasElement, options: GameOptions) {
    this.options = options;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.small ? 1.25 : 1.5));
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.renderer = renderer;
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: options.small ? 0 : 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.14, 0.45, 3));
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.composer.addPass(this.grade);
    this.scene.fog = new THREE.FogExp2(FOG.getHex(), 0.00016);
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  async load(progress: (share: number) => void) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_, done, total) => progress(done / total);
    const textures = new THREE.TextureLoader(manager);
    const draco = new DRACOLoader(manager).setDecoderPath("/draco/");
    const models = new GLTFLoader(manager).setDRACOLoader(draco);
    const [bike, rider, near, far, landmarks, kit, streetKit, cars, night, ground, flake, carbonAlbedo, carbonNormal, tyreFront, tyreRear, asphalt, asphaltNormal, asphaltRough, suitAlbedo, suitNormal, suitRough, signs, atlas, rail, streetSigns, leaves, network, solid, peopleData, peopleSheet] = await Promise.all([
      models.loadAsync("/moto/fang.glb"),
      models.loadAsync("/moto/rider.glb"),
      models.loadAsync("/moto/city/near.glb"),
      models.loadAsync("/moto/city/far.glb"),
      models.loadAsync("/moto/city/marks.glb"),
      models.loadAsync("/moto/city/facade.glb"),
      models.loadAsync("/moto/city/street.glb"),
      models.loadAsync("/moto/city/cars.glb"),
      new HDRLoader(manager).loadAsync("/moto/night.hdr"),
      Ground.load(),
      textures.loadAsync("/moto/flake-normal.webp"),
      textures.loadAsync("/moto/carbon-albedo.webp"),
      textures.loadAsync("/moto/carbon-normal.webp"),
      textures.loadAsync("/moto/tyre-front-normal.webp"),
      textures.loadAsync("/moto/tyre-rear-normal.webp"),
      textures.loadAsync("/moto/asphalt-albedo.webp"),
      textures.loadAsync("/moto/asphalt-normal.webp"),
      textures.loadAsync("/moto/asphalt-rough.webp"),
      textures.loadAsync("/moto/suit-albedo.webp"),
      textures.loadAsync("/moto/suit-normal.webp"),
      textures.loadAsync("/moto/suit-rough.webp"),
      textures.loadAsync("/moto/signs.webp"),
      textures.loadAsync("/moto/city/facade-atlas.webp"),
      textures.loadAsync("/moto/city/facade-rail.webp"),
      textures.loadAsync("/moto/city/street-signs.webp"),
      textures.loadAsync("/moto/city/street-leaves.webp"),
      fetch("/moto/city/network.bin").then((response) => response.arrayBuffer()),
      fetch("/moto/city/buildings.bin").then((response) => response.arrayBuffer()),
      fetch("/moto/city/people.bin").then((response) => response.arrayBuffer()),
      textures.loadAsync("/moto/city/people.webp"),
    ]);
    this.land = new Image();
    this.land.src = "/moto/city/map.webp";
    await this.land.decode();
    draco.dispose();

    const reflections = new THREE.PMREMGenerator(this.renderer);
    // The photograph is of a real city at night, and its sky is green and blue. Everything glossy
    // would mirror that as a wash of olive. Its light is what's wanted, so most of its colour goes.
    if (night.image.data instanceof Uint16Array) {
      const sky = night.image.data;
      const { fromHalfFloat: read, toHalfFloat: write } = THREE.DataUtils;
      for (let at = 0; at < sky.length; at += 4) {
        const red = read(sky[at]);
        const green = read(sky[at + 1]);
        const blue = read(sky[at + 2]);
        const grey = (red + green + blue) / 3;
        sky[at] = write(grey + (red - grey) * SKY_COLOUR);
        sky[at + 1] = write(grey + (green - grey) * SKY_COLOUR);
        sky[at + 2] = write(grey + (blue - grey) * SKY_COLOUR);
      }
      night.needsUpdate = true;
    }
    night.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = reflections.fromEquirectangular(night).texture;
    this.scene.environmentIntensity = 0.34;
    night.dispose();
    reflections.dispose();

    this.ride = new Ride();
    this.world = new World(network, solid, this.ride);
    this.reachOf = LANDMARKS.map((place) => {
      const node = this.world.nearestNode(place.x, place.z);
      return Math.max(place.radius, Math.hypot(this.world.nodeX[node] - place.x, this.world.nodeZ[node] - place.z) + 70);
    });
    this.scene.add(makeSky());
    const sea = makeSea();
    this.seaTime = sea.time;
    this.scene.add(sea.mesh);
    this.scene.add(ground.mesh());
    this.nearGround = new NearGround(ground, this.options.small ? 120 : 200, city.mapStep);
    this.scene.add(this.nearGround.mesh);

    atlas.colorSpace = THREE.SRGBColorSpace;
    const walls = buildingMaterial(atlas);
    for (const city of [near.scene, far.scene]) {
      city.traverse((item) => {
        if (item instanceof THREE.Mesh) item.material = walls;
      });
      this.scene.add(city);
    }

    const road = makeRoad(this.ride, { albedo: asphalt, normal: asphaltNormal, rough: asphaltRough }, this.options.small);
    this.roadEye = road.eye;
    this.scene.add(road.mesh);
    this.streets = new Streets(this.world, ground, { albedo: asphalt, normal: asphaltNormal, rough: asphaltRough }, this.options.small ? 700 : 1300);
    this.scene.add(this.streets.group);
    this.scene.add(makeWalls(this.ride));
    this.scene.add(makeCranes(this.ride, ground));
    this.furniture = new Furniture(streetKit.scene, streetSigns, leaves, this.ride, this.world, ground, this.options.small);
    this.scene.add(this.furniture.group);
    this.facades = await Facades.make(this.world, kit.scene, atlas, rail, signs, this.options.small);
    this.scene.add(this.facades.group);
    this.traffic = new Traffic(cars.scene, this.world, ground, this.options.small ? 8 : 15, this.options.small ? 10 : 20);
    this.scene.add(this.traffic.group);
    this.people = new People(peopleData, peopleSheet, this.ride, this.world, ground, this.options.small);
    this.scene.add(this.people.group);

    this.landmarkTime = dressLandmarks(landmarks.scene, marks);
    this.scene.add(landmarks.scene);

    const finishes = makeFinishes({ flake, carbonAlbedo, carbonNormal, tyreFront, tyreRear, suitAlbedo, suitNormal, suitRough });
    const missing = new Set([...dress(bike.scene, finishes), ...dress(rider.scene, finishes)]);
    if (missing.size) console.warn("Unfinished parts:", [...missing]);
    const names = bike.scene.getObjectByName("Marks");
    if (names) names.visible = SHOW_MARKS;
    this.bike = new Fang(bike.scene, this.ride, this.world, ground);
    this.bike.mount(rider.scene);
    this.scene.add(this.bike.holder);

    // What the bike's standing in: a soft dark patch where the street lamps can't reach.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas");
    const fade = context.createRadialGradient(64, 64, 4, 64, 64, 64);
    fade.addColorStop(0, "rgba(0,0,0,0.92)");
    fade.addColorStop(0.55, "rgba(0,0,0,0.6)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = fade;
    context.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 2.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.shadow.position.y = 0.025;
    this.bike.holder.add(this.shadow);

    this.scene.add(this.lampAhead, this.lampBehind);
    this.headlight.position.fromArray(spots.model.headlight);
    this.headlight.target.position.set(0, 0, 34);
    this.bike.holder.add(this.headlight, this.headlight.target);

    this.flame = new Flame(new THREE.Vector3().fromArray(spots.model.exhaust_tip), new THREE.Vector3().fromArray(spots.model.exhaust_direction));
    this.bike.attach(this.flame.group);
    const tail = finishes.get("TailLamp");
    if (tail instanceof THREE.MeshBasicMaterial) this.tailLamp = tail;

    this.reset();
    await this.warm();
  }

  /**
   * Builds the streets round the start and compiles every shader while the loading text is still up.
   * Left to the first frames, the title would appear and then sit frozen for seconds.
   */
  private async warm() {
    const x = this.bike.spotX;
    const z = this.bike.spotZ;
    this.nearGround.follow(x, z);
    for (let pass = 0, busy = true; busy && pass < 400; pass++) {
      const streets = this.streets.update(x, z);
      const fronts = this.facades?.update(x, z) ?? false;
      const furniture = this.furniture.update(x, z, 0);
      busy = streets || fronts || furniture;
      // The page has to keep breathing while this goes on.
      if (pass % 6 === 5) await new Promise((resolve) => setTimeout(resolve));
    }
    // The composer draws into its own target, and shaders are compiled for what they draw into.
    this.renderer.setRenderTarget(this.composer.renderTarget1);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  /** Back to the esplanade of Maqam Echahid. */
  reset() {
    this.bike.place(START_ALONG, START_ACROSS);
    this.rideTime = 0;
    this.odometer = 0;
    this.seen.clear();
    this.seen.add(0);
    this.target = 1;
    this.route = [];
    this.routeWait = 0;
    this.arrivedFor = 0;
    this.cameraHeading = this.bike.heading;
    this.input.steer = this.input.throttle = this.input.brake = this.input.nitro = this.input.wheelie = 0;
  }

  useCamera(sensor: PuppetSensor | null, video: HTMLVideoElement | null) {
    this.sensor = sensor;
    this.video = video;
  }

  useEngine(engine: Engine) {
    this.engine = engine;
  }

  useTouch(touch: ((input: Controls) => void) | null) {
    this.touch = touch;
  }

  begin() {
    this.reset();
    this.stage = "riding";
  }

  start() {
    this.lastTime = performance.now();
    const tick = (now: number) => {
      this.frameId = requestAnimationFrame(tick);
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      this.frame(dt);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  status(): Status {
    const bike = this.bike;
    return {
      stage: this.stage,
      kmh: Math.round(bike.kmh),
      gear: bike.reversing ? "R" : bike.gear + 1,
      rpm: bike.rpm / 14000,
      seconds: this.rideTime,
      top: Math.round(bike.topSpeed * 3.6),
      scraping: bike.scrape > 0.5,
      way: this.wayOut(),
      nitro: bike.nitro,
      boosting: bike.boost > 0.3,
      cabrage: bike.cabrage,
      target: this.targetNow(),
      seen: this.seen.size,
      total: LANDMARKS.length,
      arrived: this.arrivedFor > 0 ? this.arrived : null,
      atEdge: bike.atEdge,
      places: this.places(),
    };
  }

  private targetNow(): Target | null {
    const place = LANDMARKS[this.target];
    if (!place) return null;
    return { name: place.name, arabic: place.arabic, km: Math.hypot(place.x - this.bike.spotX, place.z - this.bike.spotZ) / 1000 };
  }

  /** The city's famous places, for the rider to choose from. */
  private places() {
    return LANDMARKS.map((place, index) => ({
      name: place.name,
      arabic: place.arabic,
      km: Math.hypot(place.x - this.bike.spotX, place.z - this.bike.spotZ) / 1000,
      seen: this.seen.has(index),
      chosen: index === this.target,
    }));
  }

  choose(index: number) {
    this.target = index;
    this.routeWait = 0;
  }

  /** On to the next place not yet been to. */
  nextTarget() {
    for (let step = 1; step <= LANDMARKS.length; step++) {
      const index = (this.target + step) % LANDMARKS.length;
      if (!this.seen.has(index)) {
        this.choose(index);
        return;
      }
    }
  }

  useMap(canvas: HTMLCanvasElement | null) {
    this.minimap = canvas ? new Minimap(canvas, this.land, this.world) : null;
  }

  /** Has the rider reached anywhere new? Then it's on to the nearest place still to see. */
  private watchPlaces(dt: number) {
    const x = this.bike.spotX;
    const z = this.bike.spotZ;
    this.arrivedFor = Math.max(this.arrivedFor - dt, 0);
    LANDMARKS.forEach((place, index) => {
      if (this.seen.has(index) || Math.hypot(place.x - x, place.z - z) > this.reachOf[index]) return;
      this.seen.add(index);
      this.arrived = place.name;
      this.arrivedFor = ARRIVED_FOR;
      if (index !== this.target) return;
      let best = -1;
      let nearest = Infinity;
      LANDMARKS.forEach((other, next) => {
        const gap = Math.hypot(other.x - x, other.z - z);
        if (!this.seen.has(next) && gap < nearest) {
          nearest = gap;
          best = next;
        }
      });
      if (best >= 0) this.choose(best);
    });
    if (this.seen.size === LANDMARKS.length) this.stage = "done";
    this.routeWait -= dt;
    if (this.routeWait <= 0) {
      this.routeWait = ROUTE_EVERY;
      const place = LANDMARKS[this.target];
      this.route = this.world.route(x, z, place.x, place.z);
    }
  }

  private wayOut() {
    const { bike, ride, spot } = this;
    if (Math.hypot(bike.spotX - MAQAM_X, bike.spotZ - MAQAM_Z) > STAGE_EDGE + 2) return null;
    ride.spot(ride.exit, spot);
    const at = bike.holder.position;
    const want = Math.atan2(spot.x - at.x, spot.z - at.z);
    // Heading falls as the bike turns right, and a turned arrow reads the other way round.
    return (-Math.atan2(Math.sin(want - bike.heading), Math.cos(want - bike.heading)) * 180) / Math.PI;
  }

  private frame(dt: number) {
    this.clock += dt;
    const bike = this.bike;

    // Read before the ride starts too: holding still with both hands up is what starts it.
    if (this.sensor && this.video) {
      const aspect = this.video.videoWidth / Math.max(this.video.videoHeight, 1) || 4 / 3;
      this.handlebars.read(this.sensor.frame, this.input, aspect);
    }

    if (this.stage === "riding") {
      this.keys.read(this.input, dt);
      this.touch?.(this.input);
      if (this.sensor && this.handlebars.nitro) this.input.nitro = 1;
      if (this.sensor && this.handlebars.wheelie) this.input.wheelie = 1;
      this.rideTime += dt;
      bike.update(dt, this.input);
      this.knockWait = Math.max(this.knockWait - dt, 0);
      this.odometer += Math.abs(bike.speed) * dt;
      this.watchPlaces(dt);
    } else if (this.stage === "done") {
      this.input.throttle = this.input.nitro = this.input.wheelie = 0;
      // Only until it stops: held on, it would start to roll backward.
      this.input.brake = bike.speed > 0.1 ? 0.7 : 0;
      this.input.steer = 0;
      bike.update(dt, this.input);
    } else {
      bike.update(dt, this.input);
    }

    const struck = this.traffic.update(dt, bike.spotX, bike.spotZ, bike.heading, bike.speed);
    if (struck > 1 && this.knockWait <= 0 && this.stage === "riding") {
      bike.knock(this.traffic.awayX, this.traffic.awayZ);
      this.knockWait = 0.8;
    }
    this.engine?.update(bike.rpm, this.input.throttle, Math.abs(bike.speed), bike.scrape, bike.boost);
    // A bark of fire as the throttle snaps shut high in the revs.
    if (this.lastThrottle > 0.7 && this.input.throttle < 0.3 && bike.rpm > 8500) this.flame.pop(0.7);
    if (bike.shifted > 0.08 && this.input.throttle > 0.8) this.flame.pop(0.45);
    this.lastThrottle = this.input.throttle;
    this.flame.update(dt, bike.boost, this.clock);
    (this.grade.uniforms.uBoost as { value: number }).value = this.options.calm ? 0 : bike.boost;
    this.tailLamp?.color.setRGB(this.input.brake > 0.1 ? 6 : 2.2, this.input.brake > 0.1 ? 0.12 : 0.05, this.input.brake > 0.1 ? 0.08 : 0.03);
    this.moveLamps();
    this.moveCamera(dt);
    this.seaTime.value = this.clock;
    this.landmarkTime.value = this.clock;
    const x = bike.spotX;
    const z = bike.spotZ;
    this.nearGround.follow(x, z);
    this.streets.update(x, z);
    this.facades?.update(x, z);
    this.furniture.update(x, z, this.clock);
    this.people.update(dt, x, z, bike.heading, bike.speed, this.clock);
    this.mapWait -= dt;
    if (this.minimap && this.mapWait <= 0) {
      this.mapWait = 1 / 30;
      this.minimap.draw(x, z, bike.heading, Math.abs(bike.speed), this.route, LANDMARKS, this.seen, this.target);
    }
    this.composer.render();
    (window as unknown as { __motoFrames?: number }).__motoFrames = ((window as unknown as { __motoFrames?: number }).__motoFrames ?? 0) + 1;
  }

  /** Two lamps, a street lamp's distance apart, pass over the bike as it rides, so highlights run down the paint. */
  private moveLamps() {
    const bike = this.bike;
    const at = bike.holder.position;
    const forwardX = Math.sin(bike.heading);
    const forwardZ = Math.cos(bike.heading);
    const run = this.odometer % LAMP_SPACING;
    const out = Math.abs(bike.across) < 30 && this.ride.medianAt(bike.along) > 0.5;
    const place = (light: THREE.PointLight, ahead: number) => {
      light.position.set(at.x + forwardX * ahead - forwardZ * 6, at.y + LAMP_HEIGHT - 0.2, at.z + forwardZ * ahead + forwardX * 6);
      // Kept low: any more and the highlights on the bike burn out to white.
      light.intensity = 22;
      // Sodium-warm in the city, the cold white of LEDs along the bay.
      light.color.copy(out ? LED_LIGHT : CITY_LIGHT);
    };
    place(this.lampBehind, -run);
    place(this.lampAhead, LAMP_SPACING - run);
  }

  private moveCamera(dt: number) {
    const bike = this.bike;
    const at = bike.holder.position;
    if (this.stage === "title") {
      // Low behind the rider, drifting slowly, with Maqam Echahid rising ahead of them. Their name
      // is the first thing you read.
      const way = Math.atan2(MAQAM.x - at.x, MAQAM.z - at.z);
      const sway = -1.9 + Math.sin(this.clock * 0.12) * 0.4;
      const back = 4.3;
      this.camera.position.set(at.x - Math.sin(way) * back - Math.cos(way) * sway, at.y + 0.72, at.z - Math.cos(way) * back + Math.sin(way) * sway);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(at.x + Math.sin(way) * 40, at.y + 17, at.z + Math.cos(way) * 40);
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    } else if (this.stage === "done") {
      // Low beside the bike, looking along the street it's stopped in.
      const way = bike.heading;
      this.camera.position.set(at.x - Math.sin(way) * 5.4 - Math.cos(way) * 2.6, at.y + 0.9, at.z - Math.cos(way) * 5.4 + Math.sin(way) * 2.6);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(at.x + Math.sin(way) * 40, at.y + 9, at.z + Math.cos(way) * 40);
      this.camera.fov = 66;
      this.camera.updateProjectionMatrix();
    } else {
      // Behind and above, a beat late into a turn, tipping a little with the rider.
      const rate = 1 - Math.exp(-dt * 5.5);
      const turnBy = Math.atan2(Math.sin(bike.heading - this.cameraHeading), Math.cos(bike.heading - this.cameraHeading));
      this.cameraHeading += turnBy * rate;
      const speed = Math.min(bike.speed / 90, 1);
      const back = 3.1 + speed * 0.75;
      const high = 1.62 - speed * 0.22;
      this.chase.set(at.x - Math.sin(this.cameraHeading) * back, at.y + high, at.z - Math.cos(this.cameraHeading) * back);
      this.camera.position.copy(this.chase);
      this.look.set(at.x + Math.sin(this.cameraHeading) * 5, at.y + 1.0, at.z + Math.cos(this.cameraHeading) * 5);
      this.cameraRoll += (bike.lean * 0.34 - this.cameraRoll) * (1 - Math.exp(-dt * 6));
      // Up leans with the bike, so the horizon goes with it.
      const sideX = -Math.cos(this.cameraHeading);
      const sideZ = Math.sin(this.cameraHeading);
      this.camera.up.set(sideX * -Math.sin(this.cameraRoll), Math.cos(this.cameraRoll), sideZ * -Math.sin(this.cameraRoll));
      this.camera.lookAt(this.look);
      if (!this.options.calm && bike.speed > 30) {
        const shake = (bike.speed - 30) * 0.00003 + bike.scrape * 0.006;
        this.camera.rotation.x += (Math.random() - 0.5) * shake;
        this.camera.rotation.y += (Math.random() - 0.5) * shake;
      }
      const wide = 58 + speed * speed * 24 + (this.options.calm ? 0 : bike.boost * 9);
      if (Math.abs(this.camera.fov - wide) > 0.05) {
        this.camera.fov += (wide - this.camera.fov) * (1 - Math.exp(-dt * 3));
        this.camera.updateProjectionMatrix();
      }
    }

    // The road needs to know where the eye is, in its own terms, to place the reflections.
    const eye = this.ride.locate(this.camera.position.x, this.camera.position.z, bike.along);
    this.ride.spot(eye.along, this.spot);
    if (Math.abs(eye.across) > 60) this.roadEye.value.set(-1e6, 0, 1);
    else this.roadEye.value.set(eye.along, eye.across / this.ride.widthAt(eye.along), Math.max(this.camera.position.y - this.spot.y, 0.3));
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.keys.dispose();
    this.renderer.dispose();
  }
}
