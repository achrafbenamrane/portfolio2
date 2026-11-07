import type { Metadata } from "next";

import PizzaExperience from "@/components/pizza/pizza-experience";

export const metadata: Metadata = {
  title: "Wolfexo Fast Food",
  description:
    "A whole Italian pizzeria in 3D: take a seat, turn the pages of the menu, make your pizza, and watch the chef put it in the wood-fired oven.",
};

export default function PizzaKitchenPage() {
  return <PizzaExperience />;
}
