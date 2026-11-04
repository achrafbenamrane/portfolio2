"use client";

import HandControl from "./hand-control";
import Portrait from "./portrait";

/**
 * The computer-vision demo on its own, for screens too narrow for the iMac
 * it otherwise runs inside: the portrait, and the panel that turns the camera
 * on, on the same red they had as the home page's hero. Rendered from the
 * start so the page never moves for it; the portrait's WebGL waits for
 * `live`.
 */
export default function VisionDemo({ live }: { live: boolean }) {
  return (
    <div
      className="overflow-hidden rounded-2xl px-5 pb-6"
      style={{
        background:
          "radial-gradient(70% 90% at 72% 40%, #B81A33 0%, transparent 62%)," +
          "linear-gradient(160deg, #8F1024 0%, #A5142B 55%, #5A0B18 100%)",
      }}
    >
      <Portrait className="-mx-5 h-[34vh] min-h-52" live={live} />
      <HandControl className="mt-2" />
    </div>
  );
}
