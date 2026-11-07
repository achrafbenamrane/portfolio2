"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { type PuppetMode, PuppetSensor } from "@/lib/vision/puppet-sensor";

import { Audio } from "./audio";
import type { Game, Stage, Status } from "./game";
import { Strings } from "./strings";
import TouchPad from "./touch-pad";

type Control = "hands" | "body" | "keys" | "touch";
type Phase = "title" | "linking" | "playing";

const HANDS: ReadonlyArray<readonly [string, string]> = [
  ["Raise your open hand", "Walk"],
  ["Raise it further", "Run"],
  ["Lower it", "Back up"],
  ["Move it left or right", "Turn"],
  ["Flick it up", "Jump"],
  ["Close it", "Punch"],
  ["Keep it closed", "Block"],
  ["One finger", "Crouch"],
  ["Two fingers", "Lie down, or get up"],
  ["Pinch", "Use"],
  ["In the air: tilt your hand", "Roll"],
  ["In the air: raise or lower it", "Dive or climb"],
  ["In the air: close it", "Fire"],
  ["In the air: two fingers", "Launch a missile"],
];

const BODY: ReadonlyArray<readonly [string, string]> = [
  ["March on the spot", "Walk"],
  ["March harder", "Run"],
  ["Lean left or right", "Turn"],
  ["Jump", "Jump"],
  ["Bend your knees", "Crouch"],
  ["Crouch right down and hold it", "Lie down"],
  ["Throw a punch", "Punch"],
  ["Hands up at your face", "Block"],
  ["Both hands over your head", "Use"],
  ["In the air: arms out, and tip them", "Roll"],
  ["In the air: raise or lower your arms", "Climb or dive"],
  ["In the air: bring your hands together", "Fire"],
  ["In the air: both hands over your head", "Launch a missile"],
];

const KEYS: ReadonlyArray<readonly [string, string]> = [
  ["W and S, or the arrows", "Walk"],
  ["A and D", "Turn, or circle"],
  ["Shift", "Run"],
  ["Space", "Jump"],
  ["C", "Crouch"],
  ["Z", "Lie down, or get up"],
  ["J and K", "Punch"],
  ["L", "Block"],
  ["E", "Use"],
  ["In the air: W, S, A, D", "Steer"],
  ["In the air: J", "Fire"],
  ["In the air: F", "Missile"],
  ["In the air: R and V", "Throttle"],
];

const HELP = { hands: HANDS, body: BODY, keys: KEYS, touch: KEYS } as const;

const neverChanges = () => () => {};
const hasTouchScreen = () => window.matchMedia("(pointer: coarse)").matches;

/** What to do next, in the words that fit how they're playing. */
function objective(stage: Stage, control: Control, atShip: boolean) {
  const camera = control === "hands" || control === "body";
  const body = control === "body";
  const touch = control === "touch";
  switch (stage) {
    case "walk":
      return body ? "March on the spot to walk to the beacon" : camera ? "Raise your open hand to walk to the beacon" : touch ? "Push the stick up to walk to the beacon" : "Hold W to walk to the beacon";
    case "jump":
      return body ? "Jump" : camera ? "Flick your hand up to jump" : touch ? "Press Jump" : "Press Space to jump";
    case "lie":
      return body ? "Crouch right down and hold it, then stand up" : camera ? "Show two fingers to lie down, then again to get up" : touch ? "Press Lie down, then again to get up" : "Press Z to lie down, then Z to get up";
    case "warning":
      return "Contact overhead";
    case "fight":
      if (atShip) return "Beat it first, then you can board";
      return body ? "Throw punches. Hands at your face to block" : camera ? "Close your hand to punch. Keep it closed to block" : touch ? "Punch it down" : "J and K to punch, L to block";
    case "reach":
      return body ? "Walk to the beacon, or put both hands over your head to go aboard" : camera ? "Walk to the beacon, or pinch to go aboard" : touch ? "Walk to the beacon, or press Use to go aboard" : "Walk to the beacon, or press E to go aboard";
    case "boarding":
      return "Boarding";
    case "launch":
      return "Launching";
    case "orbit":
      return body ? "Arms out and tip them to steer. Hands together to fire, overhead for a missile" : camera ? "Tilt your hand to steer. Close it to fire, two fingers for a missile" : touch ? "Steer with the stick and fire" : "WASD steers, J fires, F launches a missile";
    default:
      return "";
  }
}

export default function TetherShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const gameRef = useRef<Game | null>(null);
  const stringsRef = useRef<Strings | null>(null);
  const audioRef = useRef<Audio | null>(null);
  const [sensor] = useState(() => new PuppetSensor());
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [control, setControl] = useState<Control>("keys");
  const [status, setStatus] = useState<Status | null>(null);
  const [label, setLabel] = useState("");
  const [linkShare, setLinkShare] = useState(0);
  const [help, setHelp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState(false);
  const [problem, setProblem] = useState("");
  const [playing, setPlaying] = useState<Game | null>(null);
  const isTouch = useSyncExternalStore(neverChanges, hasTouchScreen, () => false);
  useSyncExternalStore(sensor.subscribe, sensor.getVersion, () => 0);

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    const audio = new Audio();
    audioRef.current = audio;
    const resized = () => {
      game?.resize();
      stringsRef.current?.resize();
    };
    void (async () => {
      try {
        const { Game: Engine } = await import("./game");
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        game = new Engine(canvas, { small: window.innerWidth < 760, calm });
        await game.load(setLoaded);
        if (cancelled) return;
        gameRef.current = game;
        game.useAudio(audio);
        game.onFlash = () => {
          setFlash(true);
          window.setTimeout(() => setFlash(false), 900);
        };
        if (overlayRef.current) {
          stringsRef.current = new Strings(overlayRef.current);
          game.useOverlay(stringsRef.current);
        }
        (window as unknown as { __tether?: Game }).__tether = game;
        game.start();
        setPlaying(game);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    window.addEventListener("resize", resized);
    const ticking = window.setInterval(() => {
      const running = gameRef.current;
      if (!running) return;
      setStatus(running.status());
      setLabel(running.puppeteer.label);
      setLinkShare(running.puppeteer.linkShare);
      // Once there's a fight on, the list of controls is in the way of it.
      if (running.stage === "fight" || running.stage === "orbit") setHelp((now) => (now && running.stageAge < 0.2 ? false : now));
      // The mission starts the moment the operator's hand has been read.
      if (running.puppeteer.linked && !running.begun) {
        running.begin();
        setPhase("playing");
        setHelp(true);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearInterval(ticking);
      window.removeEventListener("resize", resized);
      sensor.stop();
      audio.dispose();
      game?.dispose();
    };
  }, [sensor]);

  const startWithCamera = useCallback(
    async (mode: PuppetMode) => {
      const video = videoRef.current;
      const game = gameRef.current;
      if (!video || !game) return;
      audioRef.current?.unlock();
      setProblem("");
      setControl(mode);
      setPhase("linking");
      await sensor.start(video, mode);
      if (sensor.status === "running") {
        game.link(sensor, video);
        return;
      }
      setPhase("title");
      setProblem(
        sensor.status === "denied"
          ? "The camera is blocked in your browser. You can allow it and try again, or play another way."
          : "The camera didn't start on this device. You can still play another way.",
      );
    },
    [sensor],
  );

  const startWithoutCamera = useCallback(() => {
    audioRef.current?.unlock();
    setControl(isTouch ? "touch" : "keys");
    setPhase("playing");
    setHelp(!isTouch);
    gameRef.current?.begin();
  }, [isTouch]);

  const toggleSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.unlock();
    setMuted((now) => {
      audio.setMuted(!now);
      return !now;
    });
  }, []);

  const stage = status?.stage;
  const over = stage === "won" || stage === "lost";
  const usingCamera = control === "hands" || control === "body";
  const target = status ? objective(status.stage, control, status.atShip) : "";

  return (
    <div className="tether" data-phase={phase}>
      <canvas ref={canvasRef} className="tether-world" aria-label="The Moon, with a robot standing on it" />
      <canvas ref={overlayRef} className="tether-strings" aria-hidden />
      <div className="tether-flash" data-on={flash} aria-hidden />

      <figure className="tether-operator" data-on={sensor.status === "running"}>
        <video ref={videoRef} muted playsInline />
        <figcaption>{label || (usingCamera ? "Looking for you" : "")}</figcaption>
        <p className="tether-private">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
      </figure>

      {failed && (
        <section className="tether-card">
          <h1>Tether</h1>
          <p>This device can&apos;t draw the game. It needs a browser with WebGL 2, on a computer or a recent phone.</p>
          <Link href="/3d" className="tether-button">Back to 3D websites</Link>
        </section>
      )}

      {phase === "title" && !failed && (
        <section className="tether-title">
          <h1>Tether</h1>
          <p className="tether-lead">It&apos;s 2090. Your robot is on the Moon. You&apos;re not.</p>
          <p>Drive it from where you are, touching nothing: your hands are its strings.</p>
          {ready ? (
            <div className="tether-choices">
              <button type="button" className="tether-button" data-main onClick={() => void startWithCamera("hands")}>Play with my hands</button>
              <button type="button" className="tether-button" onClick={() => void startWithCamera("body")}>Play with my whole body</button>
              <button type="button" className="tether-button" onClick={startWithoutCamera}>{isTouch ? "Play with the touch screen" : "Play with the keyboard"}</button>
            </div>
          ) : (
            <p className="tether-loading" role="status">Reaching the Moon: {Math.round(loaded * 100)}%</p>
          )}
          {problem && <p className="tether-problem" role="alert">{problem}</p>}
          <p className="tether-private">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
          <p className="tether-credit">
            A game by Achraf Benamrane. Earth, Moon and star maps by Solar System Scope, CC BY 4.0, from NASA data.
          </p>
        </section>
      )}

      {phase === "linking" && (
        <section className="tether-link" role="status">
          {sensor.status === "running" ? (
            <>
              <h2>{control === "hands" ? "Hold your open hand up, and keep it still" : "Stand back until your whole body is in the picture"}</h2>
              <div className="tether-meter"><span style={{ transform: `scaleX(${linkShare})` }} /></div>
            </>
          ) : (
            <h2>{sensor.status === "requesting" ? "Allow the camera to link up" : "Starting the link"}</h2>
          )}
          <p className="tether-private">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
        </section>
      )}

      {phase === "playing" && status && (
        <div className="tether-hud">
          {target && !over && <p className="tether-objective" aria-live="polite">{target}{status.distance !== null && status.distance >= 9 ? ` · ${status.distance} m` : ""}</p>}

          {!over && (
            <div className="tether-gauges">
              {status.ship === null ? (
                <Gauge name="WX-09" share={status.health} />
              ) : (
                <>
                  <Gauge name="Heron" share={status.ship} />
                  <Gauge name="Throttle" share={status.throttle} quiet />
                  <p className="tether-count">{status.missiles} missiles, {status.raiders} raiders left</p>
                </>
              )}
            </div>
          )}
          {status.enemy !== null && !over && <div className="tether-enemy"><Gauge name="Hostile" share={status.enemy} red /></div>}

          <div className="tether-tools">
            <button type="button" onClick={() => setHelp((now) => !now)}>{help ? "Hide controls" : "Controls"}</button>
            <button type="button" onClick={toggleSound}>{muted ? "Sound on" : "Sound off"}</button>
            <Link href="/3d">Leave</Link>
          </div>

          {help && !over && (
            <dl className="tether-help">
              {HELP[control].map(([what, does]) => (
                <div key={what}>
                  <dt>{what}</dt>
                  <dd>{does}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {phase === "playing" && control === "touch" && playing && !over && <TouchPad game={playing} flying={stage === "orbit"} />}

      {stage === "won" && (
        <section className="tether-card">
          <h2>Orbit is clear</h2>
          <p>You drove a machine on the Moon and flew a warship, with nothing in your hands. That&apos;s what I build: things that feel impossible and run in a browser.</p>
          <div className="tether-choices">
            <Link href="/contact" className="tether-button" data-main>Start a project</Link>
            <button type="button" className="tether-button" onClick={() => window.location.reload()}>Play again</button>
            <Link href="/3d" className="tether-button">More 3D websites</Link>
          </div>
        </section>
      )}

      {stage === "lost" && (
        <section className="tether-card">
          <h2>We&apos;ve lost the link</h2>
          <div className="tether-choices">
            <button type="button" className="tether-button" data-main onClick={() => playing?.retry()}>Try again</button>
            <Link href="/3d" className="tether-button">Leave</Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Gauge({ name, share, quiet, red }: { name: string; share: number; quiet?: boolean; red?: boolean }) {
  return (
    <div className="tether-gauge" data-quiet={quiet} data-red={red} role="meter" aria-label={name} aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span>{name}</span>
      <div><i style={{ transform: `scaleX(${Math.max(share, 0)})` }} /></div>
    </div>
  );
}
