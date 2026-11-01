/**
 * Colours for a badge drawn in a project's brand colour.
 *
 * The badge is tinted with the brand and lettered in it, but a brand colour
 * is chosen for a logo, not for 11px type on a white page — a teal or a
 * green can sit well under 4.5:1 there. So the lettering is darkened, a
 * tenth at a time towards black, until it reads at WCAG AA against the
 * tinted fill. A brand that already passes is used exactly.
 */

type Rgb = [number, number, number];

/** The page the badges sit on: `--color-canvas`, #FAFCFE. */
const CANVAS: Rgb = [0xfa, 0xfc, 0xfe];
const BLACK: Rgb = [0, 0, 0];
const AA = 4.5;

const parse = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toHex = (rgb: Rgb) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const mix = (from: Rgb, to: Rgb, amount: number): Rgb => [
  Math.round(from[0] + (to[0] - from[0]) * amount),
  Math.round(from[1] + (to[1] - from[1]) * amount),
  Math.round(from[2] + (to[2] - from[2]) * amount),
];

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** `brand` is a six-digit hex colour, e.g. "#249CA8". */
export function badgeColors(brand: string) {
  const rgb = parse(brand);
  const fill = mix(CANVAS, rgb, 0.1);
  let ink = rgb;
  for (let step = 1; step <= 10 && contrast(ink, fill) < AA; step++) {
    ink = mix(rgb, BLACK, step / 10);
  }
  return {
    color: toHex(ink),
    backgroundColor: toHex(fill),
    borderColor: toHex(mix(CANVAS, rgb, 0.45)),
  };
}
