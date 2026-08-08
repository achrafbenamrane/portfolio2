/**
 * Copies the MediaPipe WASM runtime out of node_modules into /public.
 *
 * Self-hosting rather than pulling from a CDN keeps the hero working offline,
 * dodges third-party CSP rules, and removes a runtime dependency on someone
 * else's uptime. The catch is that the vendored binaries must match the
 * installed JS API exactly — a version bump that updates one but not the other
 * fails at runtime, in the browser, with an opaque error. Running this on
 * postinstall makes that impossible.
 *
 * Only the two variants `FilesetResolver.forVisionTasks()` actually requests
 * are copied: SIMD and the no-SIMD fallback. The `_module_` pair is for GenAI
 * tasks and would add ~12 MB for nothing.
 */

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(root, "public", "mediapipe", "wasm");

const NEEDED = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

try {
  const available = new Set(await readdir(source));
  const missing = NEEDED.filter((file) => !available.has(file));
  if (missing.length) {
    throw new Error(
      `MediaPipe renamed its WASM assets — missing ${missing.join(", ")}. ` +
        `Check FilesetResolver's path construction before bumping the version.`,
    );
  }

  await mkdir(target, { recursive: true });
  await Promise.all(
    NEEDED.map((file) => copyFile(join(source, file), join(target, file))),
  );
  console.log(`✓ synced ${NEEDED.length} MediaPipe WASM files to public/`);
} catch (error) {
  if (error.code === "ENOENT" && error.path === source) {
    // Not an error during a fresh install where deps aren't linked yet.
    console.warn("· @mediapipe/tasks-vision not installed, skipping WASM sync");
    process.exit(0);
  }
  console.error(`✗ MediaPipe WASM sync failed: ${error.message}`);
  process.exit(1);
}
