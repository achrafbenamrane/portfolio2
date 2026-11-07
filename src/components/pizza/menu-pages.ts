import {
  MENU_PIZZAS,
  MENU_SECTIONS,
  money,
  PIZZA_SIZES,
  PIZZA_TOPPINGS,
  PIZZERIA,
} from "@/content/pizza";

export const PAGE_WIDE = 1024;
export const PAGE_HIGH = 1448;

const PAPER = "#f2e8d5";
const INK = "#26190f";
const RED = "#a11226";
const GREEN = "#1d5a3a";
const GOLD = "#d9b268";

/** A place on a page that can be pressed, in 0..1 from the top left. */
export type MenuHotspot = {
  kind: "pizza" | "extra";
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type PageName = "cover" | "welcome" | "pizze-1" | "pizze-2" | "antipasti" | "bevande" | "dolci" | "back";

/** The pages in the order they're bound, as the two sides of each leaf. */
export const LEAVES: [PageName, PageName][] = [
  ["cover", "welcome"],
  ["pizze-1", "pizze-2"],
  ["antipasti", "bevande"],
  ["dolci", "back"],
];

export type PageFonts = { serif: string; mono: string };

export function pageFonts(): PageFonts {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    serif: read("--font-instrument-serif", "Georgia"),
    mono: read("--font-geist-mono", "monospace"),
  };
}

function paper(context: CanvasRenderingContext2D) {
  context.fillStyle = PAPER;
  context.fillRect(0, 0, PAGE_WIDE, PAGE_HIGH);

  // Fibres and foxing, faint: flat colour is what gives a printed page away.
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let index = 0; index < 5200; index++) {
    context.fillStyle = `rgba(${90 + random() * 60}, ${60 + random() * 40}, 30, ${0.012 + random() * 0.03})`;
    context.fillRect(random() * PAGE_WIDE, random() * PAGE_HIGH, 1 + random() * 3, 1 + random() * 2);
  }
  const edge = context.createRadialGradient(
    PAGE_WIDE / 2,
    PAGE_HIGH / 2,
    PAGE_HIGH * 0.42,
    PAGE_WIDE / 2,
    PAGE_HIGH / 2,
    PAGE_HIGH * 0.72,
  );
  edge.addColorStop(0, "rgba(120, 80, 30, 0)");
  edge.addColorStop(1, "rgba(120, 80, 30, 0.16)");
  context.fillStyle = edge;
  context.fillRect(0, 0, PAGE_WIDE, PAGE_HIGH);
}

function border(context: CanvasRenderingContext2D) {
  context.strokeStyle = RED;
  context.lineWidth = 3;
  context.strokeRect(46, 46, PAGE_WIDE - 92, PAGE_HIGH - 92);
  context.strokeStyle = GREEN;
  context.lineWidth = 1.5;
  context.strokeRect(56, 56, PAGE_WIDE - 112, PAGE_HIGH - 112);
}

function heading(context: CanvasRenderingContext2D, fonts: PageFonts, title: string, subtitle: string) {
  context.textAlign = "center";
  context.fillStyle = RED;
  context.font = `italic 118px ${fonts.serif}`;
  context.fillText(title, PAGE_WIDE / 2, 196);
  context.fillStyle = INK;
  context.font = `500 26px ${fonts.mono}`;
  context.fillText(subtitle.toUpperCase().split("").join(" "), PAGE_WIDE / 2, 250);

  // The flag, small, under each heading.
  const y = 276;
  [GREEN, "#efe6d2", RED].forEach((colour, index) => {
    context.fillStyle = colour;
    context.fillRect(PAGE_WIDE / 2 - 60 + index * 40, y, 40, 5);
  });
  context.strokeStyle = "rgba(38, 25, 15, 0.3)";
  context.lineWidth = 1;
  context.strokeRect(PAGE_WIDE / 2 - 60, y, 120, 5);
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function basePrice(pizzaId: string): number {
  const pizza = MENU_PIZZAS.find((item) => item.id === pizzaId);
  const start = PIZZA_SIZES[1].price;
  return (
    start +
    (pizza?.toppings ?? []).reduce(
      (sum, id) => sum + (PIZZA_TOPPINGS.find((item) => item.id === id)?.price ?? 0),
      0,
    )
  );
}

function badge(context: CanvasRenderingContext2D, fonts: PageFonts, x: number, y: number, label: string) {
  context.fillStyle = RED;
  context.beginPath();
  context.arc(x, y, 30, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.font = `600 26px ${fonts.mono}`;
  context.fillText(label, x, y + 9);
}

function pizzaRows(
  context: CanvasRenderingContext2D,
  fonts: PageFonts,
  pizzas: typeof MENU_PIZZAS,
  pictures: Map<string, HTMLImageElement>,
  chosenPizza: string | null,
  spots: MenuHotspot[],
) {
  let y = 330;
  const rowHigh = 340;
  for (const pizza of pizzas) {
    const picture = pictures.get(pizza.id);
    if (picture) context.drawImage(picture, 92, y, 300, 300);

    context.textAlign = "left";
    context.fillStyle = INK;
    context.font = `76px ${fonts.serif}`;
    context.fillText(pizza.name, 420, y + 98);

    context.font = `500 25px ${fonts.mono}`;
    context.fillStyle = "rgba(38, 25, 15, 0.82)";
    wrap(context, pizza.note, 490)
      .slice(0, 3)
      .forEach((line, index) => context.fillText(line, 420, y + 146 + index * 36));

    context.fillStyle = RED;
    context.font = `600 34px ${fonts.mono}`;
    context.fillText(`from ${money(basePrice(pizza.id))}`, 420, y + 268);
    if (chosenPizza === pizza.id) badge(context, fonts, 900, y + 70, "✓");

    spots.push({
      kind: "pizza",
      id: pizza.id,
      left: 70 / PAGE_WIDE,
      top: y / PAGE_HIGH,
      right: (PAGE_WIDE - 70) / PAGE_WIDE,
      bottom: (y + rowHigh - 16) / PAGE_HIGH,
    });
    y += rowHigh;
  }
}

function extraRows(
  context: CanvasRenderingContext2D,
  fonts: PageFonts,
  section: (typeof MENU_SECTIONS)[number],
  quantities: Record<string, number>,
  spots: MenuHotspot[],
) {
  let y = 390;
  const rowHigh = 300;
  for (const item of section.items) {
    context.textAlign = "left";
    context.fillStyle = INK;
    context.font = `84px ${fonts.serif}`;
    context.fillText(item.name, 110, y + 40);
    const nameEnd = 110 + context.measureText(item.name).width;

    context.font = `600 38px ${fonts.mono}`;
    const price = money(item.price);
    const priceWide = context.measureText(price).width;
    context.fillStyle = RED;
    context.fillText(price, PAGE_WIDE - 110 - priceWide, y + 40);

    // Dotted leaders, as every menu has.
    context.fillStyle = "rgba(38, 25, 15, 0.42)";
    for (let x = nameEnd + 24; x < PAGE_WIDE - 130 - priceWide; x += 15) {
      context.fillRect(x, y + 38, 4, 4);
    }

    context.font = `500 27px ${fonts.mono}`;
    context.fillStyle = "rgba(38, 25, 15, 0.82)";
    context.fillText(item.note, 110, y + 96);
    context.fillStyle = GREEN;
    context.font = `500 24px ${fonts.mono}`;
    context.fillText(`${item.choices.label}: ${item.choices.options.join(" / ")}`, 110, y + 138);

    const count = quantities[item.id] ?? 0;
    if (count > 0) badge(context, fonts, PAGE_WIDE - 138, y + 104, `×${count}`);

    spots.push({
      kind: "extra",
      id: item.id,
      left: 80 / PAGE_WIDE,
      top: (y - 60) / PAGE_HIGH,
      right: (PAGE_WIDE - 80) / PAGE_WIDE,
      bottom: (y + rowHigh - 90) / PAGE_HIGH,
    });
    y += rowHigh;
  }
}

function welcome(context: CanvasRenderingContext2D, fonts: PageFonts) {
  context.textAlign = "center";
  context.fillStyle = RED;
  context.font = `italic 104px ${fonts.serif}`;
  context.fillText("Benvenuti", PAGE_WIDE / 2, 330);

  context.fillStyle = INK;
  context.font = `52px ${fonts.serif}`;
  const lines = [
    "Every pizza here is stretched,",
    "dressed and fired to order.",
    "",
    "Choose one from these pages,",
    "change whatever you like on it,",
    "and we'll put it in the oven",
    "in front of you.",
  ];
  lines.forEach((line, index) => context.fillText(line, PAGE_WIDE / 2, 480 + index * 72));

  context.fillStyle = RED;
  context.font = `italic 76px ${fonts.serif}`;
  context.fillText(PIZZERIA.chef, PAGE_WIDE / 2, 1120);
  context.fillStyle = INK;
  context.font = `500 26px ${fonts.mono}`;
  context.fillText(PIZZERIA.chefTitle.toUpperCase().split("").join(" "), PAGE_WIDE / 2, 1176);
}

function cover(context: CanvasRenderingContext2D, fonts: PageFonts) {
  const leather = context.createLinearGradient(0, 0, PAGE_WIDE, PAGE_HIGH);
  leather.addColorStop(0, "#143f2a");
  leather.addColorStop(0.55, "#0f3322");
  leather.addColorStop(1, "#0b2719");
  context.fillStyle = leather;
  context.fillRect(0, 0, PAGE_WIDE, PAGE_HIGH);

  // The grain of the hide.
  let seed = 31;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let index = 0; index < 26000; index++) {
    context.fillStyle = random() > 0.5 ? "rgba(255, 255, 255, 0.022)" : "rgba(0, 0, 0, 0.06)";
    context.fillRect(random() * PAGE_WIDE, random() * PAGE_HIGH, 2 + random() * 4, 2 + random() * 3);
  }

  context.strokeStyle = GOLD;
  context.lineWidth = 4;
  context.strokeRect(58, 58, PAGE_WIDE - 116, PAGE_HIGH - 116);
  context.lineWidth = 1.5;
  context.strokeRect(74, 74, PAGE_WIDE - 148, PAGE_HIGH - 148);

  context.textAlign = "center";
  context.fillStyle = GOLD;
  context.font = `150px ${fonts.serif}`;
  context.fillText(PIZZERIA.mark, PAGE_WIDE / 2, 580);
  context.font = `500 42px ${fonts.mono}`;
  context.fillText(PIZZERIA.markLine.toUpperCase().split("").join(" "), PAGE_WIDE / 2, 662);
  context.fillRect(PAGE_WIDE / 2 - 100, 706, 200, 3);
  context.font = `italic 92px ${fonts.serif}`;
  context.fillText("Il Menù", PAGE_WIDE / 2, 860);
}

function back(context: CanvasRenderingContext2D) {
  const leather = context.createLinearGradient(0, 0, PAGE_WIDE, PAGE_HIGH);
  leather.addColorStop(0, "#0f3322");
  leather.addColorStop(1, "#0b2719");
  context.fillStyle = leather;
  context.fillRect(0, 0, PAGE_WIDE, PAGE_HIGH);
}

export type PageState = {
  pictures: Map<string, HTMLImageElement>;
  chosenPizza: string | null;
  quantities: Record<string, number>;
};

/** Draws one page, and says what on it can be pressed. */
export function drawPage(
  canvas: HTMLCanvasElement,
  page: PageName,
  fonts: PageFonts,
  state: PageState,
): MenuHotspot[] {
  const context = canvas.getContext("2d");
  const spots: MenuHotspot[] = [];
  if (!context) return spots;

  if (page === "cover") {
    cover(context, fonts);
    return spots;
  }
  if (page === "back") {
    back(context);
    return spots;
  }

  paper(context);
  border(context);

  if (page === "welcome") welcome(context, fonts);

  if (page === "pizze-1" || page === "pizze-2") {
    heading(context, fonts, "Le Pizze", "From the fire");
    const pizzas = page === "pizze-1" ? MENU_PIZZAS.slice(0, 3) : MENU_PIZZAS.slice(3);
    pizzaRows(context, fonts, pizzas, state.pictures, state.chosenPizza, spots);
  }

  const section = MENU_SECTIONS.find((item) => item.id === page);
  if (section) {
    heading(context, fonts, section.title, section.subtitle);
    extraRows(context, fonts, section, state.quantities, spots);
  }
  return spots;
}
