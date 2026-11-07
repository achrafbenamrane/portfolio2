/**
 * The WASM build sends everything native code writes to stderr to console.error, so
 * TensorFlow Lite's routine start-up note lands as an error, and Next's dev overlay shows
 * it to whoever is testing. It's printed with the GPU delegate too, so it isn't a sign
 * that tracking fell back to the CPU.
 */
const ROUTINE_NOTE = /^INFO: Created TensorFlow Lite XNNPACK delegate/;

let filtering = false;

/**
 * Call before loading MediaPipe. Its loader binds console.error once, when it runs, so
 * a filter added after that is never called. Every other error still gets through.
 */
export function filterRoutineMediaPipeNotes(): void {
  if (filtering) return;
  filtering = true;
  const report = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && ROUTINE_NOTE.test(args[0])) return;
    report.apply(console, args);
  };
}
