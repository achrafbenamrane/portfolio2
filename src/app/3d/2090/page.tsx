import type { Metadata } from "next";

import TetherShell from "@/components/tether/shell";

export const metadata: Metadata = {
  title: "Tether",
  description:
    "A space game you play with your hands. It's 2090: drive a robot on the Moon through your webcam, fight, and fly a warship in orbit, by Achraf Benamrane.",
};

export default function TetherPage() {
  return <TetherShell />;
}
