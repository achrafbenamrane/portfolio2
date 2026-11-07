"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { PuppetSensor } from "@/lib/vision/puppet-sensor";

import { Engine } from "./audio";
import type { Controls } from "./bike";
import type { Game, Status } from "./game";

type Phase = "title" | "linking" | "riding";
type Control = "keys" | "hands" | "touch";

/** What a thumb's holding down, read by the game every frame. */
class Thumbs {
  left = false;
  right = false;
  gas = false;
  stop = false;
  nitro = false;
  wheelie = false;

  hold(key: "left" | "right" | "gas" | "stop" | "nitro" | "wheelie", down: boolean) {
    this[key] = down;
  }

  apply(input: Controls) {
    if (this.nitro) input.nitro = 1;
    if (this.wheelie) input.wheelie = 1;
    if (!this.left && !this.right && !this.gas && !this.stop) return;
    input.steer = this.right ? 0.8 : this.left ? -0.8 : input.steer * 0.8;
    input.throttle = this.gas ? 1 : 0;
    input.brake = this.stop ? 1 : 0;
  }
}

const noChange = () => () => {};
const onTouchScreen = () => window.matchMedia("(pointer: coarse)").matches;
const onServer = () => false;

const privacy = "ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE";

function clockOf(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, "0")}`;
}

export default function MotoShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [sensor] = useState(() => new PuppetSensor());
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("title");
  const [control, setControl] = useState<Control>("keys");
  const [status, setStatus] = useState<Status | null>(null);
  const [label, setLabel] = useState("");
  const [linkShare, setLinkShare] = useState(0);
  const [problem, setProblem] = useState("");
  const [muted, setMuted] = useState(false);
  const [engine] = useState(() => new Engine());
  const [thumbs] = useState(() => new Thumbs());
  const mapRef = useRef<HTMLCanvasElement>(null);
  const [choosing, setChoosing] = useState(false);
  const touchScreen = useSyncExternalStore(noChange, onTouchScreen, onServer);

  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    const resized = () => game?.resize();
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
        game.useEngine(engine);
        (window as unknown as { __moto?: Game }).__moto = game;
        game.start();
        setReady(true);
      } catch (error) {
        console.error(error);
        if (!cancelled) setFailed(true);
      }
    })();
    window.addEventListener("resize", resized);
    const ticking = window.setInterval(() => {
      const running = gameRef.current;
      if (!running) return;
      setStatus(running.status());
      setLabel(running.handlebars.label);
      setLinkShare(running.handlebars.linkShare);
      // The ride starts the moment both hands have been read.
      if (running.handlebars.linked && running.stage === "title") {
        running.begin();
        setPhase("riding");
      }
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(ticking);
      window.removeEventListener("resize", resized);
      sensor.stop();
      engine.dispose();
      game?.dispose();
    };
  }, [sensor, engine]);

  const rideWithKeys = useCallback(() => {
    engine.unlock();
    setControl("keys");
    setPhase("riding");
    gameRef.current?.begin();
  }, [engine]);

  const rideWithThumbs = useCallback(() => {
    engine.unlock();
    setControl("touch");
    setPhase("riding");
    gameRef.current?.useTouch((input) => thumbs.apply(input));
    gameRef.current?.begin();
  }, [engine, thumbs]);

  const toggleSound = useCallback(() => {
    setMuted((now) => {
      engine.setMuted(!now);
      return !now;
    });
  }, [engine]);

  const rideWithHands = useCallback(async () => {
    const video = videoRef.current;
    const game = gameRef.current;
    if (!video || !game) return;
    engine.unlock();
    setProblem("");
    setControl("hands");
    setPhase("linking");
    await sensor.start(video, "hands");
    if (sensor.status === "denied") {
      setPhase("title");
      setProblem("The camera is blocked in your browser. You can allow it and try again, or ride with the keyboard.");
      return;
    }
    if (sensor.status !== "running") {
      setPhase("title");
      setProblem("The camera didn't start. You can ride with the keyboard.");
      return;
    }
    game.useCamera(sensor, video);
  }, [sensor, engine]);

  const again = useCallback(() => gameRef.current?.begin(), []);

  const done = status?.stage === "done";
  const riding = phase === "riding" && status !== null;

  // The map needs its canvas on the page, which only exists while riding.
  useEffect(() => {
    const game = gameRef.current;
    if (!game || !riding || done) return;
    game.useMap(mapRef.current);
    return () => game.useMap(null);
  }, [riding, done]);

  useEffect(() => {
    if (!riding) return;
    const press = (event: KeyboardEvent) => {
      if (event.code === "Tab") {
        event.preventDefault();
        gameRef.current?.nextTarget();
      }
      if (event.code === "KeyM") setChoosing((now) => !now);
      if (event.code === "Escape") setChoosing(false);
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, [riding]);

  const places = status?.places ?? [];

  return (
    <div className="moto" data-phase={phase}>
      <canvas ref={canvasRef} className="moto-world" aria-label="A motorcycle in the streets of Algiers at night" />

      <figure className="moto-rider" data-on={control === "hands" && phase !== "title"}>
        <video ref={videoRef} muted playsInline />
        <figcaption>{label || "Looking for your hands"}</figcaption>
        <p className="moto-private">{privacy}</p>
      </figure>

      {failed && (
        <section className="moto-card">
          <h1>Alger la Nuit</h1>
          <p>This device can&apos;t draw the ride. It needs a browser with WebGL 2, on a computer or a recent phone.</p>
          <Link href="/3d" className="moto-button">Back to 3D websites</Link>
        </section>
      )}

      {phase === "title" && !failed && (
        <section className="moto-title">
          <h1>Alger la Nuit</h1>
          <p className="moto-lead">All of central Algiers, street by real street. Start at Maqam Echahid and take any road you like, on the fastest thing I&apos;ve built.</p>
          <p className="moto-arabic" dir="rtl" lang="ar">الجزائر العاصمة، شارعاً شارعاً</p>
          {ready ? (
            <div className="moto-choices">
              {touchScreen ? (
                <button type="button" className="moto-button" data-main onClick={rideWithThumbs}>Ride with the touch screen</button>
              ) : (
                <button type="button" className="moto-button" data-main onClick={rideWithKeys}>Ride with the keyboard</button>
              )}
              <button type="button" className="moto-button" onClick={() => void rideWithHands()}>Ride with my hands</button>
            </div>
          ) : (
            <p className="moto-loading">Loading Algiers: {Math.round(loaded * 100)}%</p>
          )}
          {problem && <p className="moto-problem">{problem}</p>}
          <p className="moto-private">{privacy}</p>
          <p className="moto-credit">A game by Achraf Benamrane. Map data © OpenStreetMap contributors. Terrain from Mapzen, using SRTM.</p>
        </section>
      )}

      {phase === "linking" && (
        <section className="moto-link">
          <p>Hold both hands up, as if you were gripping the bars, and keep still.</p>
          <div className="moto-meter" role="progressbar" aria-valuenow={Math.round(linkShare * 100)} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ transform: `scaleX(${linkShare})` }} />
          </div>
          <button type="button" className="moto-quiet" onClick={rideWithKeys}>Ride with the keyboard instead</button>
        </section>
      )}

      {riding && !done && (
        <div className="moto-hud">
          <p className="moto-help">
            {control === "hands"
              ? "Tip your hands to lean. Lift them for gas, drop them to brake. Reach high for nitro, pull them together for a cabrage"
              : control === "touch"
                ? "Hold Gas, and lean with the arrows. Hold Brake at a stop to back up"
                : "W go · S brake · A D lean · Shift nitro · Space cabrage · hold S to back up · M places"}
          </p>
          {status.way !== null && (
            <p className="moto-way">
              <i aria-hidden="true" style={{ transform: `rotate(${status.way}deg)` }}>↑</i>
              Ride round the monument. The arrow points to the road out
            </p>
          )}
          {status.arrived && <p className="moto-arrived">You&apos;ve reached {status.arrived}</p>}
          {status.atEdge && <p className="moto-arrived">That&apos;s the edge of the map. Turn back</p>}
          <div className="moto-map">
            <button type="button" className="moto-dial" onClick={() => setChoosing((now) => !now)} aria-label="Choose a place to ride to">
              <canvas ref={mapRef} aria-hidden="true" />
            </button>
            {status.target && (
              <p>
                <strong>{status.target.name}</strong>
                <span lang="ar" dir="rtl">{status.target.arabic}</span>
                <span>{status.target.km.toFixed(1)} km · {status.seen} of {status.total} places</span>
              </p>
            )}
          </div>
          <div className="moto-speed">
            <strong>{status.kmh}</strong>
            <span>km/h · {status.gear === "R" ? "reverse" : `gear ${status.gear}`}</span>
            <div className="moto-rev"><i style={{ transform: `scaleX(${status.rpm})` }} data-hot={status.rpm > 0.9} /></div>
            <div className="moto-nitro" data-on={status.boosting}>
              <span>Nitro</span>
              <div><i style={{ transform: `scaleX(${status.nitro})` }} /></div>
            </div>
          </div>
          {status.cabrage > 0.4 && <p className="moto-cabrage">Cabrage {status.cabrage.toFixed(1)} s</p>}
          <div className="moto-tools">
            <button type="button" onClick={toggleSound}>{muted ? "Sound on" : "Sound off"}</button>
            <Link href="/3d">Leave</Link>
          </div>
        </div>
      )}

      {riding && !done && choosing && (
        <section className="moto-places" aria-label="Places to ride to">
          <h2>Where to?</h2>
          <ul>
            {places.map((place, index) => (
              <li key={place.name}>
                <button
                  type="button"
                  data-seen={place.seen}
                  data-chosen={place.chosen}
                  onClick={() => {
                    gameRef.current?.choose(index);
                    setChoosing(false);
                  }}
                >
                  <span>{place.name}</span>
                  <span lang="ar" dir="rtl">{place.arabic}</span>
                  <span>{place.seen ? "Been here" : `${place.km.toFixed(1)} km`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {riding && !done && control === "touch" && (
        <div className="moto-thumbs">
          <div>
            <button type="button" aria-label="Lean left" onPointerDown={() => thumbs.hold("left", true)} onPointerUp={() => thumbs.hold("left", false)} onPointerLeave={() => thumbs.hold("left", false)}>◀</button>
            <button type="button" aria-label="Lean right" onPointerDown={() => thumbs.hold("right", true)} onPointerUp={() => thumbs.hold("right", false)} onPointerLeave={() => thumbs.hold("right", false)}>▶</button>
          </div>
          <div>
            <button type="button" onPointerDown={() => thumbs.hold("nitro", true)} onPointerUp={() => thumbs.hold("nitro", false)} onPointerLeave={() => thumbs.hold("nitro", false)}>Nitro</button>
            <button type="button" onPointerDown={() => thumbs.hold("wheelie", true)} onPointerUp={() => thumbs.hold("wheelie", false)} onPointerLeave={() => thumbs.hold("wheelie", false)}>Cabrage</button>
            <button type="button" onPointerDown={() => thumbs.hold("stop", true)} onPointerUp={() => thumbs.hold("stop", false)} onPointerLeave={() => thumbs.hold("stop", false)}>Brake</button>
            <button type="button" onPointerDown={() => thumbs.hold("gas", true)} onPointerUp={() => thumbs.hold("gas", false)} onPointerLeave={() => thumbs.hold("gas", false)}>Gas</button>
          </div>
        </div>
      )}

      {riding && done && (
        <section className="moto-card">
          <h2 lang="ar" dir="rtl">الجزائر العاصمة</h2>
          <p>All {status.total} of the city&apos;s famous places, in {clockOf(status.seconds)}, at up to {status.top} km/h.</p>
          <div className="moto-choices">
            <Link href="/contact" className="moto-button" data-main>Start a project</Link>
            <button type="button" className="moto-button" onClick={again}>Ride it again</button>
            <Link href="/3d" className="moto-button">More 3D websites</Link>
          </div>
        </section>
      )}
    </div>
  );
}
