import type { Metadata } from "next";

import MotoShell from "@/components/moto/shell";

export const metadata: Metadata = {
  title: "Alger la Nuit",
  description:
    "Ride a supercharged motorcycle through the real streets of Algiers at night, with your keyboard or your bare hands, by Achraf Benamrane.",
};

export default function AlgerLaNuitPage() {
  return <MotoShell />;
}
