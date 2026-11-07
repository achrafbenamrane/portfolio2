import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import world from "@/content/tether-world.json";
import type { PuppetSensor } from "@/lib/vision/puppet-sensor";

import type { Audio } from "./audio";
import { Brain } from "./brain";
import { Effects, makeEngines, makeJets } from "./fx";
import { Flight } from "./flight";
import { Ground } from "./ground";
import { emptyIntent, type Intent, Keyboard } from "./intent";
import { Puppeteer } from "./puppeteer";
import { Rig } from "./rig";
import { Robot, type RobotEvents } from "./robot";
import { addEarth, addMoon, addSky, addSun, Debris, scatterRocks } from "./scenery";
import type { Anchor, Strings } from "./strings";

export type GameOptions = { small: boolean; calm: boolean };

/** Where the operator has got to. */
export type Stage = "walk" | "jump" | "lie" | "warning" | "fight" | "reach" | "boarding" | "launch" | "orbit" | "won" | "lost";

export type Status = {
  stage: Stage;
  health: number;
  enemy: number | null;
  ship: number | null;
  missiles: number;
  raiders: number;
  throttle: number;
  distance: number | null;
  /** Close enough to the ship to touch it. */
  atShip: boolean;
};

/** How far the shadow map reaches around the robot. Past that the ground's baked sun takes over. */
const SHADOW_REACH = 36;
const SUN_POWER = 4.5;
/** Facing away from the sun, with the light raking in from one side, and Earth ahead. */
const START_YAW = 2.62;
/** What each string ties to. */
const ANCHOR_JOINTS = ["Head", "HandL", "HandR", "FootL", "FootR"];
const anchorAt = new THREE.Vector3();
/** Shoulders touching. */
const MOST_CLOSE = 2.1;

const MARKER_DISTANCE = 26;
const PAD_DISTANCE = 96;
/** The Heron on its pad, off to one side of the way the robot starts out facing. */
const PAD_TURN = 0.5;
const RAMP_TOP = 13.3;
const RAMP_FOOT = 20.2;
const HOLD_MIDDLE = 6;
const LAUNCH_SECONDS = 9;
const WAVES = [3, 4, 5];
/** The way the ship is pointing when it reaches orbit: with the sun behind it, and Earth ahead. */
const ORBIT_YAW = 2.44;
/** The ramp, in radians from flat: down on the pad, and shut. */
const RAMP_SHUT = 1.3;
/** Come this close to the middle of the ship, from any side, and the robot goes aboard by itself. */
const SHIP_ZONE = 25;
/** Metres back from the ship's middle where the tail ends, and out from it where the wings do. */
const SHIP_TAIL = 17;
const WING_CLEAR = 18;
const BOARDING_LIMIT = 40;
const HOLD_LIGHT = 26;
/** How close a rock has to come to the ship's middle, in metres. */
const SHIP_REACH = 11;
const MOON_RADIUS = 14000;
/** How far from the base the link reaches, in metres. */
const LINK_RANGE = 430;
/** How high orbit is, in this game's scale. It's far lower than real, to fill the frame. */
const ORBIT_HEIGHT = 620;

/** What the robot can't walk through, in the base's own space: x, z and radius. */
const SOLID_THINGS: ReadonlyArray<readonly [number, number, number]> = [
  [46, -20, 7], [46, -35, 7], [60, -27, 7],
  [34, -40, 3.4],
  [-40, 30, 4], [-40, 18, 4], [-40, 6, 4],
  [30, 32, 6],
];

const scratch = new THREE.Vector3();
const scratch2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  readonly intent = emptyIntent();
  readonly puppeteer = new Puppeteer();
  player!: Robot;
  enemy!: Robot;
  flight!: Flight;
  stage: Stage = "walk";
  /** Called the moment the picture should cut to white. */
  onFlash: (() => void) | null = null;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.3, 60000);
  private readonly sun = new THREE.DirectionalLight("#fff6ea", SUN_POWER);
  private readonly keyboard: Keyboard;
  private readonly options: GameOptions;
  private readonly surfaceGroup = new THREE.Group();
  private readonly auto: Intent = emptyIntent();
  private ground!: Ground;
  private brain!: Brain;
  private effects!: Effects;
  private playerJets!: { value: number };
  private enemyJets!: { value: number };
  private enemyGlow!: THREE.MeshBasicMaterial;
  private shipGlow!: THREE.MeshBasicMaterial;
  private heron!: THREE.Object3D;
  private sky!: THREE.Object3D;
  private earth!: THREE.Object3D;
  private moon!: THREE.Object3D;
  private sunDisc!: THREE.Object3D;
  private sunWay = new THREE.Vector3();
  private engines!: { value: number };
  private solid: { x: number; z: number; radius: number }[] = [];
  private marker!: THREE.Mesh;
  private debris!: Debris;
  private padAt = new THREE.Vector3();
  /** On its way up the ramp: past here the ship's outline stops being a wall. */
  private climbing = false;
  private rampFoot = new THREE.Vector3();
  private rampTop = new THREE.Vector3();
  private holdAt = new THREE.Vector3();
  private shake = 0;
  private time = 0;
  private stageTime = 0;
  private frameId = 0;
  private last = 0;
  private cameraYaw = START_YAW;
  private readonly cameraAt = new THREE.Vector3(0, 6, -12);
  private readonly cameraLook = new THREE.Vector3(0, 2.4, 0);
  private sensor: PuppetSensor | null = null;
  private overlay: Strings | null = null;
  private video: HTMLVideoElement | null = null;
  private jumped = false;
  private layDown = false;
  private waveIndex = 0;
  private audio: Audio | null = null;
  private started = false;
  private touch: ((intent: Intent) => void) | null = null;
  private lostFrom: "fight" | "orbit" = "fight";

  constructor(canvas: HTMLCanvasElement, options: GameOptions) {
    this.options = options;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.small ? 1.25 : 1.5));
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: options.small ? 0 : 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.26, 0.7, 1.7));
    this.composer.addPass(new OutputPass());

    this.scene.background = new THREE.Color("#000000");
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(options.small ? 2048 : 4096, options.small ? 2048 : 4096);
    sun.shadow.camera.left = -SHADOW_REACH;
    sun.shadow.camera.right = SHADOW_REACH;
    sun.shadow.camera.top = SHADOW_REACH;
    sun.shadow.camera.bottom = -SHADOW_REACH;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 280;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun, sun.target, this.surfaceGroup);

    this.keyboard = new Keyboard(this.intent);
    this.resize();
  }

  async load(onProgress: (share: number) => void) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, done, total) => onProgress(done / total);
    const textures = new THREE.TextureLoader(manager);
    const draco = new DRACOLoader(manager).setDecoderPath("/draco/");
    const models = new GLTFLoader(manager).setDRACOLoader(draco);

    const pbr = async (name: string) => {
      // Only the robots come in two sizes: they're what the camera gets close to.
      const size = name === "robot" && this.options.small ? "-small" : "";
      const [map, normalMap, orm] = await Promise.all(
        ["albedo", "normal", "orm"].map((kind) => textures.loadAsync(`/2090/${name}-${kind}${size}.webp`)),
      );
      for (const texture of [map, normalMap, orm]) {
        texture.flipY = false;
        texture.anisotropy = 8;
      }
      map.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: orm, metalnessMap: orm, aoMap: orm, roughness: 1, metalness: 1 });
    };

    const [ground, robot, heron, raider, base, rocks, paint, heronPaint, raiderPaint, basePaint, enemyAlbedo, decals] = await Promise.all([
      Ground.load(textures, this.options.small),
      models.loadAsync("/2090/robot.glb"),
      models.loadAsync("/2090/heron.glb"),
      models.loadAsync("/2090/raider.glb"),
      models.loadAsync("/2090/base.glb"),
      models.loadAsync("/2090/rocks.glb"),
      pbr("robot"),
      pbr("heron"),
      pbr("raider"),
      pbr("base"),
      textures.loadAsync(`/2090/enemy-albedo${this.options.small ? "-small" : ""}.webp`),
      textures.loadAsync("/2090/decals.webp"),
    ]);
    draco.dispose();

    this.ground = ground;
    this.surfaceGroup.add(ground.mesh);
    const sunWay = new THREE.Vector3(...(world.sun as [number, number, number]));
    this.sky = await addSky(this.scene, textures);
    this.earth = await addEarth(this.scene, textures, sunWay);
    this.moon = await addMoon(this.scene, textures, sunWay, this.options.small);
    this.moon.visible = false;
    this.sunWay.copy(sunWay);
    this.sunDisc = addSun(this.scene);
    this.makeReflections(sunWay);

    decals.colorSpace = THREE.SRGBColorSpace;
    decals.anisotropy = 8;
    const printing = new THREE.MeshStandardMaterial({ map: decals, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.4, 2.2) });
    this.shipGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.8, 2.8) });

    const dress = (root: THREE.Object3D, solid: THREE.Material, light: THREE.Material, names: string[]) => {
      root.traverse((item) => {
        if (!(item instanceof THREE.Mesh)) return;
        if (item.name.includes("_Print")) item.material = printing;
        else if (names.includes(item.name)) item.material = light;
        else {
          item.material = solid;
          item.castShadow = true;
          item.receiveShadow = true;
        }
      });
    };

    const model = robot.scene;
    dress(model, paint, glow, ["Visor", "ChestLamps"]);

    // The second machine shares every vertex with the first: only its paint and its eye differ.
    const enemyModel = model.clone(true);
    const enemyPaint = paint.clone();
    enemyAlbedo.flipY = false;
    enemyAlbedo.colorSpace = THREE.SRGBColorSpace;
    enemyAlbedo.anisotropy = 8;
    enemyPaint.map = enemyAlbedo;
    this.enemyGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 1.6, 0.2) });
    enemyModel.traverse((item) => {
      if (!(item instanceof THREE.Mesh)) return;
      if (item.name.includes("_Print")) item.visible = false;
      else if (item.name === "Visor" || item.name === "ChestLamps") item.material = this.enemyGlow;
      else item.material = enemyPaint;
    });

    this.effects = new Effects(this.options.small);
    this.surfaceGroup.add(model, enemyModel);
    this.scene.add(this.effects.group);

    this.player = new Robot(new Rig(model), ground);
    this.enemy = new Robot(new Rig(enemyModel), ground);
    this.player.place(0, 0, START_YAW);
    this.brain = new Brain(this.enemy, this.player);
    this.playerJets = makeJets(this.player.rig.bones.Chest);
    this.enemyJets = makeJets(this.enemy.rig.bones.Chest);
    enemyModel.visible = false;

    const events: RobotEvents = {
      footfall: (at, strength, yaw, normal) => {
        this.effects.kick(at, strength * 0.42);
        this.effects.press(at, yaw, normal);
        this.audio?.footfall(strength * this.nearness(at));
      },
      landed: (at, strength) => {
        this.effects.kick(at, 0.4 + strength * 0.5, 1.6);
        this.shake = Math.max(this.shake, strength * 0.05);
        this.audio?.landed(strength);
      },
      launched: (at) => {
        this.effects.kick(at, 1.1, 1.4);
        this.audio?.launched();
      },
      struck: (at, strength, blocked) => {
        this.effects.strike(at, blocked ? strength * 0.3 : strength);
        this.shake = Math.max(this.shake, blocked ? 0.06 : 0.2);
        if (this.overlay) this.overlay.shiver = 1;
        this.audio?.struck(blocked);
      },
    };
    this.player.toughness = 1.4;
    this.player.events = events;
    this.enemy.events = events;

    // Lay out the base, along the way the robot is facing to start with.
    const padTurn = START_YAW + PAD_TURN;
    const padX = Math.sin(padTurn) * PAD_DISTANCE;
    const padZ = Math.cos(padTurn) * PAD_DISTANCE;
    const padHeight = ground.surfaceAt(padX, padZ);
    this.padAt.set(padX, padHeight, padZ);

    const camp = base.scene;
    dress(camp, basePaint, new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 4, 2) }), ["Glow"]);
    camp.position.copy(this.padAt);
    camp.rotation.y = padTurn;
    this.surfaceGroup.add(camp);

    this.heron = heron.scene;
    dress(this.heron, heronPaint, this.shipGlow, ["Glow"]);
    this.heron.position.copy(this.padAt).setY(padHeight + 0.3);
    this.heron.rotation.y = padTurn;
    this.scene.add(this.heron);
    this.heron.updateWorldMatrix(true, true);
    const toWorld = (y: number, height: number) => scratch.set(0, height, -y).applyMatrix4(this.heron.matrixWorld).clone();
    this.rampFoot.copy(toWorld(RAMP_FOOT, 0)).setY(padHeight + 0.3);
    this.rampTop.copy(toWorld(RAMP_TOP, 1.42));
    this.holdAt.copy(toWorld(HOLD_MIDDLE, 1.42));
    const ramp = this.heron.getObjectByName("Ramp");
    // Down on the ground: it hinges at the top, and swings to meet the pad.
    if (ramp) ramp.rotation.x = -Math.asin(1.7 / (RAMP_FOOT - RAMP_TOP));
    this.engines = makeEngines(this.heron);

    // The base's solid things, turned to match it, and the ship's own length laid out as circles.
    const turnAround = (x: number, z: number, radius: number) => {
      const point = scratch.set(x, 0, z).applyAxisAngle(UP, padTurn).add(this.padAt);
      this.solid.push({ x: point.x, z: point.z, radius });
    };
    for (const [x, z, radius] of SOLID_THINGS) turnAround(x, z, radius);
    for (let along = -14; along <= 13; along += 4.5) turnAround(0, along, 4.8);
    turnAround(7, -8, 2.6);
    turnAround(-7, -8, 2.6);

    const raiderModel = raider.scene;
    dress(raiderModel, raiderPaint, new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 3, 1) }), ["Glow"]);
    this.flight = new Flight(new THREE.Object3D(), raiderModel);
    this.flight.events = {
      blast: (at, size) => {
        this.effects.blast(at, size);
        this.audio?.blast();
      },
      hit: (at) => this.effects.hit(at),
      shipHit: () => {
        this.shake = Math.max(this.shake, 0.5);
        this.audio?.shipHit();
      },
      fired: () => this.audio?.gun(),
    };

    scatterRocks(rocks.scene, this.surfaceGroup, ground, this.options.small, [this.padAt]);
    this.debris = new Debris(rocks.scene, this.options.small);
    this.flight.group.add(this.debris.group);

    // Work lights down the hold, so there's something to walk into.
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.4, 3.4) });
    for (const x of [-2.2, 2.2]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 9.2), strip);
      lamp.position.set(x, 6.0, -8.1);
      this.heron.add(lamp);
    }
    for (const z of [-5.2, -10.6]) {
      const light = new THREE.PointLight(new THREE.Color(1, 0.88, 0.72), HOLD_LIGHT, 15, 1.6);
      light.position.set(0, 5.2, z);
      this.heron.add(light);
    }

    this.marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 60, 12, 1, true),
      new THREE.ShaderMaterial({
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "varying vec2 vUv; void main() { float fade = 1.0 - vUv.y; fade = fade * fade * fade; gl_FragColor = vec4(vec3(1.0, 0.42, 0.4) * fade * 3.0, fade * 0.5); }",
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    const markX = Math.sin(START_YAW) * MARKER_DISTANCE;
    const markZ = Math.cos(START_YAW) * MARKER_DISTANCE;
    this.marker.position.set(markX, ground.surfaceAt(markX, markZ) + 30, markZ);
    this.marker.visible = false;
    this.surfaceGroup.add(this.marker);

    this.cameraAt.set(Math.sin(START_YAW) * -11, ground.surfaceAt(0, 0) + 5, Math.cos(START_YAW) * -11);
  }

  private makeReflections(sunWay: THREE.Vector3) {
    // What metal has to reflect here: a black sky, and bright ground below it.
    const room = new THREE.Scene();
    room.background = new THREE.Color("#000000");
    const floor = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.52, 0.48), side: THREE.BackSide }),
    );
    room.add(floor);
    const disc = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(60, 58, 54) }));
    disc.position.copy(sunWay).multiplyScalar(45);
    room.add(disc);
    const reflections = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = reflections.fromScene(room, 0.02).texture;
    this.scene.environmentIntensity = 0.62;
    reflections.dispose();
  }

  /** Hands the machine over to the operator on the camera. */
  link(sensor: PuppetSensor, video: HTMLVideoElement) {
    this.sensor = sensor;
    this.video = video;
  }

  unlink() {
    this.sensor = null;
    this.video = null;
    this.overlay?.clear();
  }

  useOverlay(overlay: Strings) {
    this.overlay = overlay;
  }

  useAudio(audio: Audio) {
    this.audio = audio;
  }

  /** The touch controls, if there are any, read once a frame. */
  useTouch(read: ((intent: Intent) => void) | null) {
    this.touch = read;
  }

  get begun() {
    return this.started;
  }

  get stageAge() {
    return this.stageTime;
  }

  /** The mission starts: before this, the title sits over a quiet shot of the machine. */
  begin() {
    if (this.started) return;
    this.started = true;
    this.marker.visible = true;
    this.audio?.say("link");
    window.setTimeout(() => {
      if (this.stage === "walk") this.audio?.say("walk");
    }, 2600);
  }

  /** Back to the start of whatever went wrong, rather than the start of the game. */
  retry() {
    if (this.lostFrom === "orbit") {
      this.flight.reset();
      this.flight.startAt(ORBIT_YAW, this.moon.position, MOON_RADIUS);
      this.waveIndex = 0;
      this.flight.spawnWave(WAVES[0]);
      this.become("orbit");
      return;
    }
    const { player, enemy } = this;
    player.place(player.position.x, player.position.z, player.yaw);
    const ahead = scratch.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(14).add(player.position);
    enemy.place(ahead.x, ahead.z, player.yaw + Math.PI);
    this.intent.prone = false;
    this.become("fight");
  }

  /** Things further off are quieter. */
  private nearness(at: THREE.Vector3) {
    return Math.min(14 / Math.max(at.distanceTo(this.player.position), 1), 1);
  }

  /** Where the machine's joints are on the screen: the far end of each string. */
  private anchors(): Anchor[] {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const toScreen = (point: THREE.Vector3) => ({ x: (point.x * 0.5 + 0.5) * width, y: (0.5 - point.y * 0.5) * height });
    if (this.flying) return [toScreen(scratch.copy(this.flight.position).project(this.camera))];
    const bone = this.player.rig.bones;
    return ANCHOR_JOINTS.map((name) => toScreen(bone[name].getWorldPosition(anchorAt).project(this.camera)));
  }

  private drawOverlay(dt: number) {
    const { overlay, sensor, video } = this;
    if (!overlay) return;
    overlay.clear();
    const canvas = this.renderer.domElement;
    if (this.stage === "orbit") {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      scratch.set(0, 0, 900).applyQuaternion(this.flight.turn).add(this.flight.position).project(this.camera);
      overlay.drawFlight(this.flight.targets(this.camera, width, height), { x: (scratch.x * 0.5 + 0.5) * width, y: (0.5 - scratch.y * 0.5) * height });
    }
    if (!sensor || !video) return;
    const aspect = video.videoWidth / Math.max(video.videoHeight, 1) || 4 / 3;
    const slack = 1 - Math.min(this.player.speed / 6, 1);
    if (sensor.frame.body) overlay.drawBody(sensor.frame.body, this.anchors(), aspect, slack, dt);
    else if (sensor.frame.hands.length) overlay.drawHands(sensor.frame.hands, this.anchors(), aspect, slack, dt);
  }

  start() {
    if (this.frameId) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.frameId = requestAnimationFrame(loop);
      if (document.hidden) {
        this.last = now;
        return;
      }
      const dt = Math.min((now - this.last) / 1000, 0.05);
      this.last = now;
      this.frame(dt);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private become(stage: Stage) {
    if (stage === "lost") this.lostFrom = this.flying ? "orbit" : "fight";
    this.stage = stage;
    this.stageTime = 0;
    this.audio?.say(stage);
  }

  private get atShip() {
    return Math.hypot(this.player.position.x - this.padAt.x, this.player.position.z - this.padAt.z) < SHIP_ZONE;
  }

  get flying() {
    return this.stage === "orbit" || this.stage === "won";
  }

  status(): Status {
    const at = this.player.position;
    let distance: number | null = null;
    if (this.stage === "reach") distance = Math.round(at.distanceTo(this.rampFoot));
    if (this.stage === "walk") distance = Math.round(Math.hypot(at.x - this.marker.position.x, at.z - this.marker.position.z));
    return {
      stage: this.stage,
      health: this.player.healthShare,
      enemy: this.stage === "fight" ? this.enemy.healthShare : null,
      ship: this.flying ? Math.max(this.flight.health / 100, 0) : null,
      missiles: this.flight.missiles,
      raiders: this.flight.standing,
      throttle: this.intent.throttle,
      distance,
      atShip: this.atShip,
    };
  }

  private frame(dt: number) {
    this.keyboard.read();
    if (this.sensor && this.video) {
      const aspect = this.video.videoWidth / Math.max(this.video.videoHeight, 1) || 4 / 3;
      this.puppeteer.read(this.sensor.frame, this.intent, this.flying ? "flight" : "ground", aspect);
    }
    this.touch?.(this.intent);
    if (!this.started) {
      Object.assign(this.intent, emptyIntent());
    }
    this.time += dt;
    this.stageTime += dt;
    this.mission(dt);

    if (this.flying) {
      this.flight.update(dt, this.intent);
      this.followShip(dt);
      const rock = this.debris.update(dt, this.flight.position, SHIP_REACH);
      if (rock) this.flight.struckRock(rock);
      this.audio?.burn(0.22 + this.intent.throttle * 0.4);
      this.audio?.servos(0);
    } else {
      this.brain.think(dt);
      this.player.update(dt, this.stage === "boarding" ? this.auto : this.intent);
      if (this.enemy.rig.model.visible) this.enemy.update(dt, this.brain.intent);
      this.keepApart();
      this.keepInRange();
      if (this.enemy.rig.model.visible && !this.enemy.alive) this.smoulder(dt);
      if (!this.climbing) this.keepOutOfThings(this.player);
      if (this.enemy.rig.model.visible) this.keepOutOfThings(this.enemy);
      this.playerJets.value = this.player.thrust;
      this.enemyJets.value = this.enemy.thrust;
      this.audio?.servos(Math.min(this.player.speed / 7, 1));
      this.audio?.burn(Math.max(this.player.thrust * 0.5, this.stage === "launch" ? this.engines.value : 0));
      const flare = (1 + this.brain.tell * 3) * (this.enemy.alive ? 1 : 0.04);
      this.enemyGlow.color.setRGB(10 * flare, 1.6 * flare, 0.2 * flare);
      this.followRobot(dt);
    }

    this.effects.tick(dt, this.renderer.domElement.height, this.camera.fov);
    this.placeSun();
    this.sky.position.copy(this.camera.position);
    this.sunDisc.position.copy(this.camera.position).addScaledVector(this.sunWay, 26000);
    this.composer.render(dt);
    this.drawOverlay(dt);
    const stats = window as unknown as { __tetherFrames?: number };
    stats.__tetherFrames = (stats.__tetherFrames ?? 0) + 1;
  }

  private placeSun() {
    const at = this.flying ? this.flight.position : this.stage === "launch" ? this.heron.position : this.player.position;
    const sunWay = world.sun as [number, number, number];
    this.sun.target.position.copy(at);
    this.sun.position.set(at.x + sunWay[0] * 130, at.y + sunWay[1] * 130, at.z + sunWay[2] * 130);
  }

  private mission(dt: number) {
    const player = this.player;
    const seconds = this.stageTime;
    if (this.stage !== "reach") this.intent.use = false;

    // Anyone who heads straight for the ship has skipped the drills, and that's their business.
    // The enemy just comes to them sooner.
    if ((this.stage === "walk" || this.stage === "jump" || this.stage === "lie") && this.atShip) {
      this.marker.visible = false;
      this.become("warning");
    }

    switch (this.stage) {
      case "walk": {
        const gap = Math.hypot(player.position.x - this.marker.position.x, player.position.z - this.marker.position.z);
        if (gap < 4) {
          this.marker.visible = false;
          this.become("jump");
        }
        break;
      }
      case "jump":
        if (!player.grounded) this.jumped = true;
        if (this.jumped && player.grounded) this.become("lie");
        break;
      case "lie":
        if (player.prone > 0.8) this.layDown = true;
        if (this.layDown && player.prone < 0.2) this.become("warning");
        break;
      case "warning":
        if (seconds > 3.2) {
          // It comes down out of the black, ahead of the robot, on its jets.
          const ahead = scratch.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
          // Not on top of the ship, though.
          if (this.atShip) ahead.copy(player.position).sub(this.padAt).setY(0).normalize();
          ahead.multiplyScalar(22).add(player.position);
          this.enemy.rig.model.visible = true;
          this.enemy.dropIn(ahead.x, ahead.z, 70, Math.atan2(player.position.x - ahead.x, player.position.z - ahead.z));
          this.player.opponent = this.enemy;
          this.enemy.opponent = this.player;
          this.become("fight");
        }
        break;
      case "fight":
        if (!this.enemy.alive && seconds > 1) {
          this.player.opponent = null;
          this.enemy.rig.bones.Chest.getWorldPosition(scratch);
          this.effects.strike(scratch, 3);
          this.effects.strike(scratch, 3);
          this.audio?.blast();
          this.shake = Math.max(this.shake, 0.5);
          // A beacon on the foot of the ramp, so there's no question where to go.
          this.marker.position.set(this.rampFoot.x, this.ground.surfaceAt(this.rampFoot.x, this.rampFoot.z) + 30, this.rampFoot.z);
          this.marker.visible = true;
          this.become("reach");
        }
        if (!player.alive) this.become("lost");
        break;
      case "reach":
        // Nobody has to find the exact spot or land the exact gesture: from across a room, that's
        // too much to ask. Get to the ship, or ask from anywhere, and the robot does the rest.
        if (this.atShip || this.intent.use) {
          this.intent.prone = false;
          this.climbing = false;
          this.marker.visible = false;
          this.become("boarding");
        }
        this.intent.use = false;
        break;
      case "boarding":
        this.board();
        break;
      case "launch":
        this.launch(dt);
        break;
      case "orbit":
        if (this.flight.standing === 0) {
          this.waveIndex += 1;
          if (this.waveIndex < WAVES.length) this.flight.spawnWave(WAVES[this.waveIndex]);
          else this.become("won");
        }
        if (!this.flight.alive) this.become("lost");
        break;
      default:
        break;
    }
  }

  /** The floor of the ramp and the hold, for anything walking up them. */
  private onRamp(x: number, z: number) {
    scratch2.set(x - this.rampFoot.x, 0, z - this.rampFoot.z);
    const along = scratch.copy(this.holdAt).sub(this.rampFoot).setY(0);
    const length = along.length();
    const share = scratch2.dot(along.normalize());
    const ramp = RAMP_FOOT - RAMP_TOP;
    if (share <= 0) return null;
    if (share < ramp) return this.rampFoot.y + (share / ramp) * (this.rampTop.y - this.rampFoot.y);
    if (share < length + 8) return this.rampTop.y;
    return null;
  }

  /**
   * The walk aboard, which the game does for itself once it's been asked. It goes round the wings
   * rather than through them, lines up on the foot of the ramp, and only then leaves the ground.
   */
  private board() {
    const player = this.player;
    const auto = this.auto;
    const local = this.heron.worldToLocal(scratch.copy(player.position));
    const across = local.x;
    const along = -local.z;
    let goal = this.holdAt;
    if (!this.climbing) {
      if (along < SHIP_TAIL) {
        const side = across < 0 ? -1 : 1;
        const round = Math.abs(across) < WING_CLEAR - 1 ? along : RAMP_FOOT + 1;
        goal = this.heron.localToWorld(scratch2.set(side * WING_CLEAR, 0, -round));
      } else {
        goal = this.rampFoot;
        if (Math.hypot(goal.x - player.position.x, goal.z - player.position.z) < 2.4) {
          this.climbing = true;
          player.floor = (x, z) => this.onRamp(x, z);
        }
      }
    }
    const facing = Math.atan2(goal.x - player.position.x, goal.z - player.position.z);
    const off = Math.atan2(Math.sin(facing - player.yaw), Math.cos(facing - player.yaw));
    auto.turn = -THREE.MathUtils.clamp(off * 3, -1, 1);
    auto.move = Math.abs(off) < 0.6 ? 1 : 0;
    auto.run = !this.climbing && Math.hypot(goal.x - player.position.x, goal.z - player.position.z) > 8;
    const left = Math.hypot(this.holdAt.x - player.position.x, this.holdAt.z - player.position.z);
    if ((this.climbing && left < 2.5) || this.stageTime > BOARDING_LIMIT) {
      auto.move = 0;
      auto.run = false;
      this.climbing = true;
      this.become("launch");
    }
  }

  private launch(dt: number) {
    const t = this.stageTime;
    const ramp = this.heron.getObjectByName("Ramp");
    if (ramp) ramp.rotation.x = THREE.MathUtils.damp(ramp.rotation.x, RAMP_SHUT, 2.2, dt);
    this.engines.value = Math.min(t / 3, 1);
    this.player.rig.model.visible = t < 2;
    const lift = Math.max(t - 2.4, 0);
    this.heron.position.y = this.padAt.y + 0.3 + 0.45 * lift * lift * lift;
    this.heron.rotation.x = -Math.min(lift * 0.05, 0.36);
    const burn = Math.min(t, 3);
    this.shipGlow.color.setRGB(2 + burn * 6, 3 + burn * 8, 4 + burn * 11);
    if (t > 2 && t < 6 && Math.random() < dt * 40) this.effects.kick(scratch.copy(this.padAt).setY(this.padAt.y + 0.5), 1.7, 3.2);
    this.shake = Math.max(this.shake, 0.09 * Math.min(t / 3, 1));
    const gearShare = THREE.MathUtils.smoothstep(lift, 1, 2.4);
    for (const name of ["GearNose", "GearL", "GearR"]) {
      const gear = this.heron.getObjectByName(name);
      if (gear) gear.scale.y = 1 - gearShare * 0.95;
    }
    if (t > LAUNCH_SECONDS) {
      if (!this.options.calm) this.onFlash?.();
      this.toOrbit();
    }
  }

  private toOrbit() {
    this.surfaceGroup.visible = false;
    this.moon.visible = true;
    this.moon.position.set(0, -(MOON_RADIUS + ORBIT_HEIGHT), 0);
    this.earth.position.set(Math.sin(ORBIT_YAW) * 27000 + 4500, 2600, Math.cos(ORBIT_YAW) * 27000 + 3000);
    this.earth.scale.setScalar(2.6);
    this.scene.add(this.flight.group);
    const ramp = this.heron.getObjectByName("Ramp");
    if (ramp) ramp.rotation.x = RAMP_SHUT;
    this.flight.adoptShip(this.heron);
    this.flight.startAt(ORBIT_YAW, this.moon.position, MOON_RADIUS);
    this.flight.spawnWave(WAVES[0]);
    this.waveIndex = 0;
    this.intent.throttle = 0.6;
    const shadow = this.sun.shadow.camera;
    shadow.left = -46;
    shadow.right = 46;
    shadow.top = 46;
    shadow.bottom = -46;
    shadow.updateProjectionMatrix();
    this.scene.environmentIntensity = 0.32;
    this.cameraAt.copy(scratch.set(0, 12, -70).applyQuaternion(this.flight.turn).add(this.flight.position));
    this.become("orbit");
  }

  /** Two four-tonne machines don't pass through each other. */
  private keepApart() {
    const a = this.player;
    const b = this.enemy;
    if (!b.rig.model.visible) return;
    const x = b.position.x - a.position.x;
    const z = b.position.z - a.position.z;
    const gap = Math.hypot(x, z);
    if (gap >= MOST_CLOSE || gap < 0.001) return;
    const push = ((MOST_CLOSE - gap) / gap) * 0.5;
    a.shove(-x * push, -z * push);
    b.shove(x * push, z * push);
  }

  /** The link only reaches so far from the base's mast. */
  private keepInRange() {
    const at = this.player.position;
    const far = Math.hypot(at.x, at.z);
    if (far > LINK_RANGE) this.player.shove((-at.x / far) * (far - LINK_RANGE), (-at.z / far) * (far - LINK_RANGE));
  }

  /** A beaten machine doesn't just go quiet: it spits for a while. */
  private smoulder(dt: number) {
    if (Math.random() < dt * 5 && this.stageTime < 40) {
      this.enemy.rig.bones.Chest.getWorldPosition(scratch);
      this.effects.strike(scratch, 1);
    }
  }

  /** Slides a robot round anything solid, rather than stopping it dead. */
  private keepOutOfThings(robot: Robot) {
    for (const thing of this.solid) {
      const x = robot.position.x - thing.x;
      const z = robot.position.z - thing.z;
      const gap = Math.hypot(x, z);
      const reach = thing.radius + 1.3;
      if (gap < reach && gap > 0.001) robot.shove((x / gap) * (reach - gap), (z / gap) * (reach - gap));
    }
  }

  private followRobot(dt: number) {
    const player = this.player;
    const damp = THREE.MathUtils.damp;

    if (!this.started) {
      // The title: behind the machine, low down, with the Earth it's looking at above it.
      const drift = Math.sin(this.time * 0.08) * 0.8;
      this.cameraAt.set(-3.4 + drift, this.ground.surfaceAt(-3.4, 7.6) + 1.1, 7.6);
      this.cameraLook.set(1.2, player.position.y + 4.3, -2.5);
    } else if (this.stage === "boarding") {
      // Stands back from the ramp and watches it walk in, rather than following it inside.
      const back = scratch.copy(this.rampFoot).sub(this.holdAt).setY(0).normalize();
      const x = this.rampFoot.x + back.x * 13 + back.z * 7;
      const z = this.rampFoot.z + back.z * 13 - back.x * 7;
      this.cameraAt.x = damp(this.cameraAt.x, x, 2, dt);
      this.cameraAt.y = damp(this.cameraAt.y, this.ground.surfaceAt(x, z) + 5, 2, dt);
      this.cameraAt.z = damp(this.cameraAt.z, z, 2, dt);
      this.cameraLook.lerp(scratch2.copy(player.position).setY(player.position.y + 2.6), 1 - Math.exp(-dt * 5));
    } else if (this.stage === "launch") {
      // Stands off on the ground, and looks up as it goes.
      const off = scratch.set(Math.sin(this.heron.rotation.y - 2.36), 0, Math.cos(this.heron.rotation.y - 2.36)).multiplyScalar(62);
      const x = this.padAt.x + off.x;
      const z = this.padAt.z + off.z;
      this.cameraAt.x = damp(this.cameraAt.x, x, 1.2, dt);
      this.cameraAt.y = damp(this.cameraAt.y, this.ground.surfaceAt(x, z) + 7, 1.2, dt);
      this.cameraAt.z = damp(this.cameraAt.z, z, 1.2, dt);
      this.cameraLook.lerp(scratch2.copy(this.heron.position).setY(this.heron.position.y + 3), 1 - Math.exp(-dt * 3));
    } else {
      // Swings round behind the robot, a little over one shoulder.
      this.cameraYaw += Math.atan2(Math.sin(player.yaw - this.cameraYaw), Math.cos(player.yaw - this.cameraYaw)) * (1 - Math.exp(-dt * 2.4));
      const behind = (this.stage === "fight" ? 10.5 : 8.4) + player.speed * 0.3;
      const x = player.position.x - Math.sin(this.cameraYaw) * behind + Math.cos(this.cameraYaw) * 2.6;
      const z = player.position.z - Math.cos(this.cameraYaw) * behind - Math.sin(this.cameraYaw) * 2.6;
      const floor = this.ground.surfaceAt(x, z) + 1.4;
      const y = Math.max(player.position.y + 4.6, floor);
      this.cameraAt.x = damp(this.cameraAt.x, x, 6, dt);
      this.cameraAt.y = damp(this.cameraAt.y, y, 4, dt);
      this.cameraAt.z = damp(this.cameraAt.z, z, 6, dt);
      // In a fight it looks past the robot at what it's fighting, to keep them both in shot.
      const foe = this.stage === "fight" && this.enemy.alive ? this.enemy.position : null;
      const lookX = foe ? player.position.x + (foe.x - player.position.x) * 0.4 : player.position.x;
      const lookZ = foe ? player.position.z + (foe.z - player.position.z) * 0.4 : player.position.z;
      this.cameraLook.x = damp(this.cameraLook.x, lookX, 9, dt);
      this.cameraLook.y = damp(this.cameraLook.y, player.position.y + 2.7, 5, dt);
      this.cameraLook.z = damp(this.cameraLook.z, lookZ, 9, dt);
    }
    this.camera.position.copy(this.cameraAt);
    this.applyShake(dt);
    this.camera.lookAt(this.cameraLook);
  }

  private followShip(dt: number) {
    const flight = this.flight;
    // A long lens from behind and above, with the ship swinging against the frame in a turn.
    const behind = scratch.set(0, 11, -50).applyQuaternion(flight.turn).add(flight.position);
    this.cameraAt.lerp(behind, 1 - Math.exp(-dt * 7));
    const ahead = scratch2.set(0, 2, 60).applyQuaternion(flight.turn).add(flight.position);
    this.cameraLook.lerp(ahead, 1 - Math.exp(-dt * 9));
    this.camera.position.copy(this.cameraAt);
    this.camera.up.set(0, 1, 0).applyQuaternion(flight.turn);
    this.applyShake(dt);
    this.camera.lookAt(this.cameraLook);
    this.engines.value = 0.35 + this.intent.throttle * 0.65;
  }

  private applyShake(dt: number) {
    this.shake = THREE.MathUtils.damp(this.shake, 0, 5, dt);
    if (this.shake > 0.002 && !this.options.calm) {
      this.camera.position.x += Math.sin(this.time * 71) * this.shake;
      this.camera.position.y += Math.sin(this.time * 93) * this.shake;
    }
  }

  resize() {
    const canvas = this.renderer.domElement;
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.stop();
    this.keyboard.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
