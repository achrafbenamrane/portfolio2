import type { Metadata } from "next";

import StoreExperience from "@/components/store/store-experience";

export const metadata: Metadata = {
  title: "Sports store",
  description:
    "A 3D football shop by Achraf Benamrane. Watch the floor from the corner camera, take a shirt off the wall and turn it in your hands, then wear it in a mirror that tracks your body on your own device.",
};

export default function SportsStorePage() {
  return <StoreExperience />;
}
