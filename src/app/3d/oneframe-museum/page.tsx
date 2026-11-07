import type { Metadata } from "next";

import MuseumExperience from "@/components/museum/museum-experience";

export const metadata: Metadata = {
  title: "The ONEFRAME museum",
  description:
    "A black hall of six lit frames, each made only once. Your screen becomes a window: lean in to step closer, bring a car out of its frame, then hang it on your own wall.",
};

export default function OneFrameMuseumPage() {
  return <MuseumExperience />;
}
