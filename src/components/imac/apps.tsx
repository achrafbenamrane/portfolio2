"use client";

import { useCallback, useRef, useState } from "react";

import { audioUrl, reciters, surahs } from "@/content/quran";
import { site } from "@/content/site";
import { useAimTarget } from "./desktop-pointer";

/** Shared chrome for every window that opens on the desktop. */
export function AppWindow({
  title,
  onClose,
  children,
  width = 380,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  const closeRef = useAimTarget<HTMLButtonElement>("window:close", onClose);

  return (
    <div className="app-window" style={{ width }}>
      <div className="app-titlebar">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="app-close"
          aria-label="Close window"
        >
          <span />
        </button>
        <span className="app-title">{title}</span>
      </div>
      <div className="app-body">{children}</div>
    </div>
  );
}

/**
 * Quran player. Streams full-surah MP3s directly, which works because every
 * source sends `Access-Control-Allow-Origin: *` and supports range requests —
 * so the scrubber works rather than only play/pause.
 */
export function QuranApp({ onClose }: { onClose: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [reciter, setReciter] = useState(reciters[0]);
  const [playing, setPlaying] = useState<number | null>(null);

  const play = useCallback(
    (surahNumber: number) => {
      const surah = surahs.find((s) => s.number === surahNumber);
      const audio = audioRef.current;
      if (!surah || !audio) return;

      if (playing === surahNumber && !audio.paused) {
        audio.pause();
        setPlaying(null);
        return;
      }
      audio.src = audioUrl(reciter, surah);
      void audio.play().catch(() => setPlaying(null));
      setPlaying(surahNumber);
    },
    [playing, reciter],
  );

  return (
    <AppWindow title="Quran" onClose={onClose} width={430}>
      <div className="quran-reciters">
        {reciters.map((entry) => (
          <ReciterChip
            key={entry.id}
            active={entry.id === reciter.id}
            label={entry.name}
            onSelect={() => {
              setReciter(entry);
              setPlaying(null);
              audioRef.current?.pause();
            }}
          />
        ))}
      </div>

      <p className="quran-arabic" dir="rtl">
        {reciter.arabicName}
      </p>

      <ul className="quran-list">
        {surahs.map((surah) => (
          <SurahRow
            key={surah.number}
            surah={surah}
            playing={playing === surah.number}
            onPlay={() => play(surah.number)}
          />
        ))}
      </ul>

      <audio
        ref={audioRef}
        onEnded={() => setPlaying(null)}
        preload="none"
      />
    </AppWindow>
  );
}

function ReciterChip({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const ref = useAimTarget<HTMLButtonElement>(`reciter:${label}`, onSelect);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={`quran-chip${active ? " is-active" : ""}`}
    >
      {label}
    </button>
  );
}

function SurahRow({
  surah,
  playing,
  onPlay,
}: {
  surah: (typeof surahs)[number];
  playing: boolean;
  onPlay: () => void;
}) {
  const ref = useAimTarget<HTMLButtonElement>(`surah:${surah.number}`, onPlay);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={onPlay}
        className={`quran-row${playing ? " is-playing" : ""}`}
      >
        <span className="quran-num">
          {String(surah.number).padStart(3, "0")}
        </span>
        <span className="quran-name">
          {surah.name}
          <em>{surah.meaning}</em>
        </span>
        <span className="quran-ar" dir="rtl">
          {surah.arabicName}
        </span>
        <span className="quran-play">{playing ? "❚❚" : "▶"}</span>
      </button>
    </li>
  );
}

export function ContactApp({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(site.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);
  const copyRef = useAimTarget<HTMLButtonElement>("contact:copy", copy);

  return (
    <AppWindow title="Phone" onClose={onClose} width={300}>
      <p className="app-lead">{site.phone}</p>
      <p className="app-sub">{site.location}</p>
      <div className="app-actions">
        <a href={site.phoneHref} className="app-button is-primary">
          Call
        </a>
        <button
          ref={copyRef}
          type="button"
          onClick={copy}
          className="app-button"
        >
          {copied ? "Copied" : "Copy number"}
        </button>
      </div>
    </AppWindow>
  );
}

export function SettingsApp({
  onClose,
  handControl,
  onToggleHandControl,
  status,
}: {
  onClose: () => void;
  handControl: boolean;
  onToggleHandControl: () => void;
  status: string;
}) {
  const toggleRef = useAimTarget<HTMLButtonElement>(
    "settings:hand",
    onToggleHandControl,
  );

  return (
    <AppWindow title="Settings" onClose={onClose} width={360}>
      <div className="setting-row">
        <div>
          <p className="setting-name">Hand control</p>
          <p className="setting-hint">
            Point with your index finger, pinch to click. Runs on-device.
          </p>
        </div>
        <button
          ref={toggleRef}
          type="button"
          role="switch"
          aria-checked={handControl}
          onClick={onToggleHandControl}
          className={`switch${handControl ? " is-on" : ""}`}
        >
          <span />
        </button>
      </div>

      <dl className="setting-meta">
        <div>
          <dt>Tracking</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Privacy</dt>
          <dd>Video never leaves this device</dd>
        </div>
      </dl>
    </AppWindow>
  );
}
