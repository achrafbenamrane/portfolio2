"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  certifications,
  experiences,
  projects,
  site,
} from "@/content/site";
import type { VoiceAction } from "@/content/voice";
import type { HeroSignal } from "@/lib/vision/hero-signal";
import { ContactApp, QuranApp, SettingsApp } from "./apps";
import {
  DesktopPointerProvider,
  localRect,
  useAimTarget,
} from "./desktop-pointer";
import Dock, { type DockApp } from "./dock";
import FolderWindow, { type FolderSpec } from "./folder-windows";
import SiriApp from "./siri-app";
import { DESKTOP_CSS } from "./geometry";

const getServerVersion = () => 0;

/** One clock for the whole open sequence, matching iOS's ~450–500 ms. */
const OPEN_MS = 500;
/** Apple's spring, approximated — the standard iOS ease. */
const OPEN_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const FOLDERS: readonly FolderSpec[] = [
  {
    id: "works",
    label: "WORKS",
    href: "/work",
    count: projects.length,
    hint: "projects",
  },
  {
    id: "experiences",
    label: "EXPERIENCES",
    href: "/experience",
    count: experiences.length,
    hint: "roles",
  },
  {
    id: "certifications",
    label: "CERTIFICATIONS",
    href: "/certifications",
    count: certifications.length,
    hint: "credentials",
  },
  {
    id: "contacts",
    label: "CONTACTS",
    href: "/contact",
    count: site.links.length + 2,
    hint: "channels",
  },
];

type AppId = "quran" | "settings" | "phone" | "siri" | null;

interface Opening {
  folder: FolderSpec;
  rect: { x: number; y: number; w: number; h: number };
}

export default function Desktop({
  signal,
  onNavigate,
  reducedMotion,
}: {
  signal: HeroSignal;
  onNavigate: (href: string) => void;
  reducedMotion: boolean;
}) {
  // Subscribe to the sensor's version counter so the menu bar and Settings
  // reflect the camera coming up. Without this they read `signal.status` once
  // and never update — the store only notifies subscribers.
  useSyncExternalStore(signal.subscribe, signal.getVersion, getServerVersion);

  const rootRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [openPhase, setOpenPhase] = useState(false);
  const [opened, setOpened] = useState<FolderSpec | null>(null);
  const [app, setApp] = useState<AppId>(null);
  const [handControl, setHandControl] = useState(true);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const update = () =>
      setClock(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  // The folder opens INTO the machine — the tray expands out of the icon and
  // hands over to a real window. `onNavigate` is kept for the window's explicit
  // "Open page" button, so the desktop is a preview rather than a dead end.
  const openFolder = useCallback(
    (folder: FolderSpec, element: HTMLElement) => {
      const root = rootRef.current;
      if (!root || reducedMotion) {
        setOpened(folder);
        return;
      }
      setOpening({ folder, rect: localRect(element, root) });
      // Two frames: one to commit the start styles, one to flip to the end
      // styles so the transition actually has something to interpolate from.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setOpenPhase(true)),
      );
      setTimeout(() => {
        setOpened(folder);
        setOpening(null);
        setOpenPhase(false);
      }, OPEN_MS);
    },
    [reducedMotion],
  );

  const closeFolder = useCallback(() => setOpened(null), []);

  // Voice drives the same state as the mouse and the finger — it opens the
  // real windows rather than a parallel voice-only view.
  const runVoiceAction = useCallback((action: VoiceAction) => {
    switch (action.kind) {
      case "folder": {
        const folder = FOLDERS.find((entry) => entry.id === action.id);
        if (folder) setOpened(folder);
        break;
      }
      case "app":
        setApp(action.id);
        break;
      case "link":
        window.open(action.href, "_blank", "noopener");
        break;
      case "close":
        setOpened(null);
        setApp(null);
        break;
      case "none":
        break;
    }
  }, []);

  const enableCamera = useCallback(() => {
    const video = document.querySelector<HTMLVideoElement>(
      "[data-hero-video]",
    );
    if (video) void signal.enableCamera(video);
  }, [signal]);

  const dockApps: readonly DockApp[] = [
    {
      id: "github",
      label: "GitHub",
      tint: "linear-gradient(160deg,#3B4552,#171B21)",
      icon: <GithubGlyph />,
      onOpen: () => window.open(site.links[0].href, "_blank", "noopener"),
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      tint: "linear-gradient(160deg,#3C93D4,#0A66C2)",
      icon: <span className="glyph-text">in</span>,
      onOpen: () => window.open(site.links[1].href, "_blank", "noopener"),
    },
    {
      id: "phone",
      label: "Phone",
      tint: "linear-gradient(160deg,#7BE495,#2FA84F)",
      icon: <PhoneGlyph />,
      onOpen: () => setApp("phone"),
    },
    {
      id: "cv",
      label: "CV (PDF)",
      tint: "linear-gradient(160deg,#F05B4A,#C2160B)",
      icon: <span className="glyph-text glyph-pdf">PDF</span>,
      onOpen: () => window.open(site.cvHref, "_blank", "noopener"),
    },
    {
      id: "quran",
      label: "Quran",
      tint: "linear-gradient(160deg,#2FBFA0,#0E7C63)",
      icon: <MusicGlyph />,
      onOpen: () => setApp("quran"),
    },
    {
      id: "siri",
      label: "Assistant",
      tint: "linear-gradient(160deg,#2E6FA8,#12304A)",
      icon: <RobotGlyph />,
      onOpen: () => setApp("siri"),
    },
    {
      id: "settings",
      label: "Settings",
      tint: "linear-gradient(160deg,#9BA4AF,#5B6672)",
      icon: <GearGlyph />,
      onOpen: () => setApp("settings"),
    },
  ];

  const diving = openPhase || opened !== null;
  const tracking = signal.status === "running";

  return (
    <DesktopPointerProvider
      signal={signal}
      rootRef={rootRef}
      cursorRef={cursorRef}
      enabled={handControl}
    >
      <div
        ref={rootRef}
        className="desktop"
        style={{ width: DESKTOP_CSS.width, height: DESKTOP_CSS.height }}
      >
        <div className={`desktop-wall${diving ? " is-diving" : ""}`} />

        <div className="menubar">
          <span className="menubar-brand">{site.initials}</span>
          <span>{site.shortName}</span>
          <span className="menubar-spacer" />
          <span>{tracking ? "◉ Hand control" : "○ Hand control off"}</span>
          <span>{clock}</span>
        </div>

        <div
          className={`icon-layer${diving ? " is-diving" : ""}`}
          style={
            opening
              ? {
                  transformOrigin: `${opening.rect.x + opening.rect.w / 2}px ${
                    opening.rect.y + opening.rect.h / 2
                  }px`,
                }
              : undefined
          }
        >
          <div className="folder-grid">
            {FOLDERS.map((folder) => (
              <FolderIcon
                key={folder.id}
                folder={folder}
                onOpen={openFolder}
              />
            ))}
          </div>
        </div>

        {opening && (
          <div className={`open-tray${openPhase ? " is-open" : ""}`}>
            <div
              className="open-tray-panel"
              style={{
                left: opening.rect.x,
                top: opening.rect.y,
                width: opening.rect.w,
                height: opening.rect.h,
                transitionDuration: `${OPEN_MS}ms`,
                transitionTimingFunction: OPEN_EASE,
              }}
            >
              <p className="open-tray-title">{opening.folder.label}</p>
              <p className="open-tray-sub">
                {opening.folder.count} {opening.folder.hint}
              </p>
            </div>
          </div>
        )}

        {opened && (
          <div className="fw-layer">
            <FolderWindow
              folder={opened}
              onClose={closeFolder}
              onOpenPage={onNavigate}
            />
          </div>
        )}

        {app && (
          <div className="app-layer">
            {app === "quran" && <QuranApp onClose={() => setApp(null)} />}
            {app === "phone" && <ContactApp onClose={() => setApp(null)} />}
            {app === "siri" && (
              <SiriApp onClose={() => setApp(null)} onAction={runVoiceAction} />
            )}
            {app === "settings" && (
              <SettingsApp
                onClose={() => setApp(null)}
                handControl={handControl}
                onToggleHandControl={() => {
                  if (!handControl && !tracking) enableCamera();
                  setHandControl((on) => !on);
                }}
                status={tracking ? "Live" : "Camera not enabled"}
              />
            )}
          </div>
        )}

        <Dock apps={dockApps} />

        <div ref={cursorRef} className="finger-cursor" aria-hidden>
          <span className="finger-ring" />
          <span className="finger-dot" />
        </div>
      </div>
    </DesktopPointerProvider>
  );
}

function FolderIcon({
  folder,
  onOpen,
}: {
  folder: FolderSpec;
  onOpen: (folder: FolderSpec, element: HTMLElement) => void;
}) {
  const ref = useAimTarget<HTMLButtonElement>(
    `folder:${folder.id}`,
    (element) => onOpen(folder, element),
  );

  return (
    <button
      ref={ref}
      type="button"
      className="folder"
      onClick={(event) => onOpen(folder, event.currentTarget)}
    >
      <span className="folder-tile">
        <span className="folder-preview">
          {Array.from({ length: 6 }).map((_, index) => (
            <i key={index} />
          ))}
        </span>
      </span>
      <span className="folder-label">{folder.label}</span>
      <span className="folder-count">
        {folder.count} {folder.hint}
      </span>
    </button>
  );
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.35.78 1.05.78 2.12v3.15c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.6 2h3.1l1.6 4-2.1 1.5a13 13 0 0 0 6 6l1.5-2.1 4 1.6v3.1c0 1-.8 1.9-1.9 1.9A17.4 17.4 0 0 1 4.7 3.9C4.7 2.8 5.6 2 6.6 2Z" />
    </svg>
  );
}

function MusicGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20 3.5 9 6v9.6a3.4 3.4 0 1 0 2 3.1V9.2l7-1.6v5.4a3.4 3.4 0 1 0 2 3.1V3.5Z" />
    </svg>
  );
}

/** The assistant's own face, so the dock identifies it rather than describing
 *  it. Overflows its tile slightly on purpose — the head reads at 36 px only
 *  if it is not also padded. */
function RobotGlyph() {
  return (
    <Image
      src="/robot-head.webp"
      alt=""
      width={96}
      height={96}
      className="dock-face"
    />
  );
}

function GearGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm9 3.5-2.2 1.3.5 2.5-2.2 1.3-2-1.6-2.4.8-.7 2.4h-2.5l-.7-2.4-2.4-.8-2 1.6L2.2 15.8l.5-2.5L.5 12l2.2-1.3-.5-2.5 2.2-1.3 2 1.6 2.4-.8.7-2.4h2.5l.7 2.4 2.4.8 2-1.6 2.2 1.3-.5 2.5L21 12Z" />
    </svg>
  );
}
