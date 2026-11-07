import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored MediaPipe and Draco WASM glue — emscripten output, not ours to lint.
    "public/mediapipe/**",
    "public/draco/**",
    // Source material and retired work, kept out of the app.
    "assets-source/**",
  ]),
]);

export default eslintConfig;
