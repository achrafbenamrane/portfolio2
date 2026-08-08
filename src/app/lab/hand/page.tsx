"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";

import { notFound } from "next/navigation";

import { HandSensor, type SensorStatus } from "@/lib/vision/hand-sensor";
import { HAND_CONNECTIONS } from "@/lib/vision/landmarks";
import {
  DEFAULT_OPENNESS_CONFIG,
  FINGER_NAMES,
  GESTURE_ENTER_CLOSED,
  GESTURE_EXIT_CLOSED,
  type OpennessConfig,
} from "@/lib/vision/openness";

const STORAGE_KEY = "hand-openness-config";

/** Stable server snapshot — the sensor's version counter always starts at 0. */
const getServerVersion = () => 0;

const STATUS_LABEL: Record<SensorStatus, string> = {
  idle: "IDLE",
  requesting: "REQUESTING CAMERA",
  loading: "LOADING MODEL",
  running: "TRACKING",
  denied: "PERMISSION DENIED",
  unsupported: "NO CAMERA / UNSUPPORTED",
  error: "ERROR",
};

/**
 * Not part of the site. This is the bench for tuning the openness constants —
 * unlinked from the nav and 404s in production, but worth keeping, because
 * re-deriving `curlMax` and the filter parameters by eye against a live hero is
 * miserable.
 */
export default function HandLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HandLab />;
}

function HandLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Every readout below is written imperatively from the rAF loop. None of it
  // goes through React — see the note on HandFrame.
  const opennessTextRef = useRef<HTMLSpanElement>(null);
  const opennessBarRef = useRef<HTMLDivElement>(null);
  const rawBarRef = useRef<HTMLDivElement>(null);
  const smoothBarRef = useRef<HTMLDivElement>(null);
  const fingerBarsRef = useRef<(HTMLDivElement | null)[]>([]);
  const fpsTextRef = useRef<HTMLSpanElement>(null);
  const handTextRef = useRef<HTMLSpanElement>(null);
  const gestureTextRef = useRef<HTMLSpanElement>(null);
  const rangeTextRef = useRef<HTMLSpanElement>(null);

  // The sensor owns status and config; React just subscribes to its version
  // counter. Keeping React out of the loop means first paint is identical on
  // server and client, and the controls re-render a handful of times over the
  // sensor's whole lifetime instead of sixty times a second.
  const [sensor] = useState(() => new HandSensor());
  useSyncExternalStore(sensor.subscribe, sensor.getVersion, getServerVersion);
  const { status, config } = sensor;

  const [copied, setCopied] = useState(false);

  // Restore tuning across reloads — otherwise every refresh throws away the
  // calibration you just spent five minutes dialing in.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      sensor.setConfig(JSON.parse(saved) as Partial<OpennessConfig>);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [sensor]);

  useEffect(() => () => sensor.stop(), [sensor]);

  const patchConfig = useCallback(
    (patch: Partial<OpennessConfig>) => {
      sensor.setConfig(patch);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sensor.config));
    },
    [sensor],
  );

  const handleStart = useCallback(() => {
    const video = videoRef.current;
    if (video) void sensor.start(video);
  }, [sensor]);

  const handleRecalibrate = useCallback(() => sensor.recalibrate(), [sensor]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [config]);

  // ── display loop ────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const frame = sensor.frame;

      if (opennessTextRef.current) {
        opennessTextRef.current.textContent = `${Math.round(frame.openness * 100)}`;
      }
      setBar(opennessBarRef.current, frame.openness);
      setBar(rawBarRef.current, frame.raw);
      setBar(smoothBarRef.current, frame.smoothedRaw);

      for (let i = 0; i < frame.perFinger.length; i++) {
        setBar(fingerBarsRef.current[i], frame.perFinger[i]);
      }

      if (fpsTextRef.current) {
        fpsTextRef.current.textContent = frame.detectFps
          ? frame.detectFps.toFixed(0)
          : "--";
      }
      if (handTextRef.current) {
        handTextRef.current.textContent = frame.hasHand
          ? (frame.handedness ?? "HAND").toUpperCase()
          : "NO HAND";
      }
      if (gestureTextRef.current) {
        gestureTextRef.current.textContent = frame.isClosed ? "CLOSED" : "OPEN";
      }
      if (rangeTextRef.current) {
        rangeTextRef.current.textContent = `${frame.rangeMin.toFixed(3)} / ${frame.rangeMax.toFixed(3)}`;
      }

      drawOverlay(overlayRef.current, videoRef.current, frame.landmarks);
      drawFragmentPreview(previewRef.current, frame.openness);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sensor]);

  const isLive = status === "running";
  const isBusy = status === "requesting" || status === "loading";

  return (
    <main className="grain min-h-dvh px-6 py-10 md:px-12">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="meta text-dim">LAB / 001</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            Hand openness sensor
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${isLive ? "bg-accent" : isBusy ? "bg-warn" : "bg-line"}`}
          />
          <span className="meta text-dim">{STATUS_LABEL[status]}</span>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── camera + signal ── */}
        <section className="space-y-6">
          <div className="relative overflow-hidden rounded-lg border border-line bg-surface-1">
            <div className="relative aspect-4/3 w-full">
              <video
                ref={videoRef}
                className="absolute inset-0 size-full -scale-x-100 object-cover"
                playsInline
                muted
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 size-full -scale-x-100"
              />

              {!isLive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-canvas/80 px-6 text-center">
                  {status === "denied" || status === "unsupported" ? (
                    <p className="max-w-xs text-sm text-dim">
                      {status === "denied"
                        ? "Camera blocked. Allow it in your browser's site settings, then reload."
                        : "No camera available on this device."}
                    </p>
                  ) : (
                    <>
                      <button
                        onClick={handleStart}
                        disabled={isBusy}
                        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-80 disabled:opacity-40"
                      >
                        {isBusy ? STATUS_LABEL[status] : "Enable hand control"}
                      </button>
                      <p className="meta text-dim">
                        ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2">
                <span className="meta text-dim">HAND CONTROL</span>
                <span className="meta text-accent">
                  <span ref={handTextRef}>NO HAND</span>
                  {" · "}
                  <span ref={fpsTextRef}>--</span> FPS
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="rounded-lg border border-line bg-surface-1 p-5">
              <p className="meta text-dim">OPENNESS</p>
              <p className="mt-2 font-mono text-5xl font-medium tabular-nums">
                <span ref={opennessTextRef}>0</span>
                <span className="text-dim">%</span>
              </p>
              <Bar ref={opennessBarRef} accent className="mt-4" />
              <p className="meta mt-4 text-dim">
                GESTURE · <span ref={gestureTextRef}>OPEN</span>
              </p>
            </div>

            <div className="space-y-4 rounded-lg border border-line bg-surface-1 p-5">
              <Readout label="RAW (instant)" barRef={rawBarRef} />
              <Readout label="SMOOTHED (one euro)" barRef={smoothBarRef} />
              <div className="border-t border-line pt-4">
                {FINGER_NAMES.map((name, i) => (
                  <Readout
                    key={name}
                    label={name.toUpperCase()}
                    barRef={(el) => {
                      fingerBarsRef.current[i] = el;
                    }}
                    compact
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── controls ── */}
        <aside className="space-y-6">
          <Panel title="OBSERVED RANGE">
            <p className="mb-4 text-xs leading-relaxed text-dim">
              Self-calibrating — bounds jump outward instantly and contract
              slowly. Open and close once and they settle.
            </p>
            <div className="flex items-baseline justify-between font-mono text-xs">
              <span className="text-dim">min / max</span>
              <span className="tabular-nums text-accent">
                <span ref={rangeTextRef}>—</span>
              </span>
            </div>
            <button
              onClick={handleRecalibrate}
              disabled={!isLive}
              className="mt-4 w-full rounded border border-line px-3 py-2 text-xs font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-30"
            >
              Forget observed range
            </button>
            <Slider
              label="deadzone"
              hint="Flat region at each end so the extremes are exact"
              value={config.deadzone}
              min={0}
              max={0.25}
              step={0.01}
              onChange={(v) => patchConfig({ deadzone: v })}
            />
          </Panel>

          <Panel title="METRIC">
            <Slider
              label="curlMax (rad)"
              hint="Curl angle counted as fully closed"
              value={config.curlMax}
              min={1.2}
              max={3.0}
              step={0.02}
              onChange={(v) => patchConfig({ curlMax: v })}
            />
          </Panel>

          <Panel title="ONE EURO FILTER">
            <Slider
              label="minCutoff"
              hint="Lower = less jitter. Tune with hand still."
              value={config.minCutoff}
              min={0.1}
              max={5}
              step={0.05}
              onChange={(v) => patchConfig({ minCutoff: v })}
            />
            <Slider
              label="beta"
              hint="Higher = less lag. Tune while waving."
              value={config.beta}
              min={0}
              max={0.05}
              step={0.001}
              decimals={3}
              onChange={(v) => patchConfig({ beta: v })}
            />
          </Panel>

          <Panel title="PREVIEW">
            <p className="mb-3 text-xs leading-relaxed text-dim">
              Stand-in for the shatter shader — same 0–1 signal, so what feels
              right here will feel right in 3D.
            </p>
            <canvas
              ref={previewRef}
              width={600}
              height={400}
              className="w-full rounded border border-line bg-canvas"
            />
            <p className="meta mt-3 text-dim">
              HYSTERESIS {GESTURE_ENTER_CLOSED} / {GESTURE_EXIT_CLOSED}
            </p>
          </Panel>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 rounded border border-line px-3 py-2 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              {copied ? "Copied ✓" : "Copy tuned config"}
            </button>
            <button
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                sensor.setConfig(DEFAULT_OPENNESS_CONFIG);
              }}
              className="rounded border border-line px-3 py-2 text-xs font-medium text-dim transition-colors hover:text-ink"
            >
              Reset
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ── presentational bits ─────────────────────────────────────────── */

function Bar({
  ref,
  accent = false,
  className = "",
}: {
  ref: Ref<HTMLDivElement>;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`}>
      {/* No `style` prop by design: the rAF loop owns this element's transform,
          and React only resets props it was given. Passing an inline transform
          here would make the bars snap to zero on every unrelated re-render. */}
      <div
        ref={ref}
        className={`h-full w-full origin-left scale-x-0 rounded-full ${accent ? "bg-accent" : "bg-ink"}`}
      />
    </div>
  );
}

function Readout({
  label,
  barRef,
  compact = false,
}: {
  label: string;
  barRef: Ref<HTMLDivElement>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-2.5" : ""}>
      <p className="meta mb-1.5 text-dim">{label}</p>
      <Bar ref={barRef} />
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface-1 p-5">
      <h2 className="meta mb-4 text-dim">{title}</h2>
      {children}
    </section>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  decimals = 2,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <label className="font-mono text-xs text-dim">{label}</label>
        <span className="font-mono text-xs tabular-nums text-accent">
          {value.toFixed(decimals)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-accent"
      />
      {hint && <p className="mt-1 text-[11px] leading-snug text-dim">{hint}</p>}
    </div>
  );
}

/* ── canvas drawing ──────────────────────────────────────────────── */

function setBar(el: HTMLDivElement | null, value: number): void {
  if (el) el.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  landmarks: { x: number; y: number }[] | null,
): void {
  if (!canvas || !video || !video.videoWidth) return;

  if (canvas.width !== video.videoWidth) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;

  const px = (i: number) => landmarks[i].x * canvas.width;
  const py = (i: number) => landmarks[i].y * canvas.height;

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
  }
  ctx.stroke();

  ctx.fillStyle = "#24689B";
  for (let i = 0; i < landmarks.length; i++) {
    ctx.beginPath();
    ctx.arc(px(i), py(i), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Deterministic pseudo-random per fragment — same shape every frame, no
 * allocation, and it mirrors the per-face random axis the real shader will bake
 * into a vertex attribute.
 */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

const FRAGMENT_COUNT = 90;

function drawFragmentPreview(
  canvas: HTMLCanvasElement | null,
  openness: number,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const spread = 1 - openness;

  for (let i = 0; i < FRAGMENT_COUNT; i++) {
    const angle = hash(i) * Math.PI * 2;
    const radius = 30 + hash(i + 100) * 95;
    const size = 7 + hash(i + 200) * 13;
    const spin = (hash(i + 300) - 0.5) * 5;

    // Collapsed state pulls every fragment toward the center and spins it —
    // the 2D stand-in for pushing along the face normal in the vertex shader.
    const r = radius * (1 - spread * 0.72);
    const x = cx + Math.cos(angle) * r * 1.35;
    const y = cy + Math.sin(angle) * r;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + spin * spread);
    ctx.fillStyle = `rgba(232,235,240,${0.25 + openness * 0.6})`;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.9, size * 0.7);
    ctx.lineTo(-size * 0.9, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
