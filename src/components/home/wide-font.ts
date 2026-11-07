import { Archivo } from "next/font/google";

/**
 * The site's display face: Archivo at its widest, standing in for Treize's
 * Moderat Extended, a paid face. Shared by the home page and the case
 * studies, and loaded only where it is used — not in the root layout.
 */
export const wide = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-wide",
  display: "swap",
});
