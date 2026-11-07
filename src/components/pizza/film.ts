import * as THREE from "three";

import notes from "@/content/pizza-film.json";

import { ROOM_AT } from "./pizzeria-room";

/*
 * The chef is filmed, not drawn. He's a Cycles render of the restaurant, played behind a
 * transparent scene with the same camera, so the only live thing in the shot is the pizza
 * the visitor made. `build_pizzeria.py film … track` writes where the peel's blade is on
 * every frame, and that's what the pizza rides.
 */

export const FILM = notes;

export type FilmName = "serve" | "meet";

/** What the lens lays under the scene. */
export type Plate = {
  texture: THREE.Texture | null;
  /** 0 is the live scene, 1 is the film. */
  mix: number;
  /** 1 keeps whatever the scene drew on top of the film, which is how the pizza gets there. */
  keep: number;
  /** Where the film sits on the canvas, as an offset and a size in its UVs. */
  box: THREE.Vector4;
  /** On a phone only part of the frame fits: which part, across it from 0 to 1. */
  focus: number;
};

export type PeelSocket = {
  at: THREE.Vector3;
  turn: THREE.Quaternion;
  /** How close to the fire it's got, from 0 to 1. The film's light warms as it goes in. */
  fire: number;
};

/** The serve's still, for when video can't play: the peel going in, at the mouth. */
export const STILL_FRAME = 66;

/** The frames over which the peel goes from the room's light to the fire's. */
const NEARING_THE_FIRE = [24, 66] as const;

/** A phone shows at least this share of the frame's width, and pans. */
const LEAST_SHOWN = 0.4;

const MEET_FOCUS = 0.4;

/** The frame, and where a tall screen looks in it: at him, at the mouth, and back at him. */
const SERVE_FOCUS = [
  [1, 0.62],
  [46, 0.62],
  [72, 0.36],
  [104, 0.36],
  [128, 0.62],
] as const;

export function focusAt(name: FilmName, frame: number) {
  if (name === "meet") return MEET_FOCUS;
  const after = SERVE_FOCUS.findIndex(([at]) => at > frame);
  if (after === 0) return SERVE_FOCUS[0][1];
  if (after < 0) return SERVE_FOCUS[SERVE_FOCUS.length - 1][1];
  const [fromFrame, from] = SERVE_FOCUS[after - 1];
  const [toFrame, to] = SERVE_FOCUS[after];
  return from + (to - from) * THREE.MathUtils.smoothstep(frame, fromFrame, toFrame);
}

/** The size the film is drawn at on this screen, and where the screen sits in it, in pixels. */
export function framing(width: number, height: number, focus: number) {
  const [filmWide, filmHigh] = FILM.size;
  const cover = Math.max(width / filmWide, height / filmHigh);
  const scale = Math.min(cover, width / (filmWide * LEAST_SHOWN));
  const fullWidth = filmWide * scale;
  const fullHeight = filmHigh * scale;
  return {
    fullWidth,
    fullHeight,
    x: THREE.MathUtils.clamp(focus * fullWidth - width / 2, 0, Math.max(fullWidth - width, 0)),
    y: (fullHeight - height) / 2,
  };
}

/** Puts the socket where the blade is on a frame, which can fall between two. */
export function seatOnPeel(socket: PeelSocket, frame: number) {
  const { track } = FILM.serve;
  const place = THREE.MathUtils.clamp(frame, 0, track.length - 1);
  const first = track[Math.floor(place)];
  const next = track[Math.min(Math.floor(place) + 1, track.length - 1)];
  const share = place - Math.floor(place);
  const between = (index: number) => first[index] + (next[index] - first[index]) * share;
  socket.at.set(between(0), between(2), -between(1)).add(ROOM_AT);
  socket.turn.set(first[3], first[4], first[5], first[6]);
  socket.fire = THREE.MathUtils.smoothstep(place, NEARING_THE_FIRE[0], NEARING_THE_FIRE[1]);
}

export type Film = { video: HTMLVideoElement; texture: THREE.VideoTexture; failed: boolean };

export function makeFilm(name: FilmName): Film {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.loop = name === "meet";
  video.preload = "auto";
  video.src = `/pizza/film-${name}.mp4`;
  const texture = new THREE.VideoTexture(video);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const film: Film = { video, texture, failed: false };
  video.addEventListener("error", () => {
    film.failed = true;
  });
  return film;
}

export function releaseFilm({ video, texture }: Film) {
  video.pause();
  video.removeAttribute("src");
  video.load();
  texture.dispose();
}
