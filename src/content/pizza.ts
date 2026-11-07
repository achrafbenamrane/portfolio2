import stamps from "./pizza-stamps.json";

/**
 * Everything a restaurant would change, in one place. To sell this to a real pizzeria:
 * set its name, menu, prices and WhatsApp number here, and the page takes them from there.
 * A new topping also needs a stamp: see `TOPPINGS` in scripts/pizza_stamps.py.
 */
export const PIZZERIA = {
  name: "Wolfexo Fast Food",
  /** The two lines of the sign and the book's cover. */
  mark: "Wolfexo",
  markLine: "Fast Food",
  line: "Cucina italiana, fired by hand.",
  chef: "Achraf Benamrane",
  chefTitle: "Il pizzaiolo",
  /** Nothing is really ordered, so the page says so. */
  demo: true,
  /** Country code and number, digits only. Orders open a WhatsApp chat to it. */
  whatsapp: "",
  currency: "€",
};

export const PIZZA_SIZES = [
  { id: "small", name: "Small", centimetres: 26, price: 8.5, scale: 0.87 },
  { id: "medium", name: "Medium", centimetres: 30, price: 10.5, scale: 1 },
  { id: "large", name: "Large", centimetres: 34, price: 12.5, scale: 1.13 },
] as const;

export type PizzaSizeId = (typeof PIZZA_SIZES)[number]["id"];

export type ToppingId = (typeof stamps.toppings)[number] extends string
  ? "pepperoni" | "mushroom" | "olive" | "onion" | "pepper" | "basil"
  : never;

/** `pieces` is how many land in one portion. */
export const PIZZA_TOPPINGS: {
  id: ToppingId;
  name: string;
  price: number;
  pieces: number;
}[] = [
  { id: "pepperoni", name: "Beef pepperoni", price: 2.5, pieces: 14 },
  { id: "mushroom", name: "Mushrooms", price: 1.5, pieces: 11 },
  { id: "olive", name: "Black olives", price: 1.5, pieces: 13 },
  { id: "onion", name: "Red onion", price: 1, pieces: 10 },
  { id: "pepper", name: "Green pepper", price: 1, pieces: 10 },
  { id: "basil", name: "Fresh basil", price: 1, pieces: 6 },
];

/** The pizzas on the menu. Each one arrives in the kitchen with these on, to change at will. */
export const MENU_PIZZAS: {
  id: string;
  name: string;
  note: string;
  toppings: ToppingId[];
}[] = [
  { id: "margherita", name: "Margherita", note: "Tomato, mozzarella, fresh basil", toppings: ["basil"] },
  { id: "diavola", name: "Diavola", note: "Beef pepperoni, black olives", toppings: ["pepperoni", "olive"] },
  { id: "funghi", name: "Funghi", note: "Mushrooms, red onion", toppings: ["mushroom", "onion"] },
  { id: "ortolana", name: "Ortolana", note: "Green pepper, red onion, mushrooms, olives", toppings: ["pepper", "onion", "mushroom", "olive"] },
  { id: "casa", name: "Della casa", note: "The chef's own: pepperoni, mushrooms, olives, basil", toppings: ["pepperoni", "mushroom", "olive", "basil"] },
  { id: "tua", name: "La tua", note: "Yours. Start from the dough and build it", toppings: [] },
];

/** Everything else. `choices` are what can be changed about it. */
export type MenuExtra = {
  id: string;
  name: string;
  note: string;
  price: number;
  choices: { label: string; options: string[] };
};

export const MENU_SECTIONS: { id: string; title: string; subtitle: string; items: MenuExtra[] }[] = [
  {
    id: "antipasti",
    title: "Antipasti",
    subtitle: "To start",
    items: [
      { id: "bruschetta", name: "Bruschetta", note: "Toasted bread, tomato, basil", price: 4.5, choices: { label: "Topping", options: ["Tomato", "Mushroom", "Olive"] } },
      { id: "focaccia", name: "Focaccia", note: "From the same oven, with rosemary", price: 3.5, choices: { label: "Style", options: ["Rosemary", "Garlic", "Plain"] } },
      { id: "caprese", name: "Caprese", note: "Mozzarella, tomato, olive oil", price: 6, choices: { label: "Size", options: ["Small", "To share"] } },
    ],
  },
  {
    id: "bevande",
    title: "Bevande",
    subtitle: "To drink",
    items: [
      { id: "acqua", name: "Acqua", note: "Still or sparkling", price: 2, choices: { label: "Kind", options: ["Still", "Sparkling"] } },
      { id: "limonata", name: "Limonata", note: "Made here, with Sicilian lemons", price: 3.5, choices: { label: "Sugar", options: ["Regular", "Less sweet"] } },
      { id: "espresso", name: "Espresso", note: "To finish, the Italian way", price: 2, choices: { label: "Shot", options: ["Single", "Double"] } },
    ],
  },
  {
    id: "dolci",
    title: "Dolci",
    subtitle: "To finish",
    items: [
      { id: "tiramisu", name: "Tiramisù", note: "Coffee, mascarpone, cocoa", price: 5.5, choices: { label: "Coffee", options: ["With", "Without"] } },
      { id: "pannacotta", name: "Panna cotta", note: "With a red berry sauce", price: 5, choices: { label: "Sauce", options: ["Berry", "Caramel"] } },
      { id: "gelato", name: "Gelato", note: "Two scoops", price: 4.5, choices: { label: "Flavour", options: ["Pistachio", "Lemon", "Chocolate"] } },
    ],
  },
];

/** Must match scripts/pizza_web.py. */
export const PIZZA_MAP = {
  metres: 0.38,
  beautyRange: 2,
  heightRange: 0.03,
  stampHeightRange: 0.008,
  /** How far from the centre a piece may land: inside the rim. */
  landingRadius: 0.116,
};

export const PIZZA_SHEET = {
  cell: stamps.cell,
  variants: stamps.variants,
  rows: stamps.toppings.length,
  cellMetres: stamps.cellMetres,
  reach: stamps.reachMetres as Record<ToppingId, number>,
  row: (topping: ToppingId) => stamps.toppings.indexOf(topping),
};

/** One topping lying on the pizza, in metres from its centre. */
export type PizzaPiece = {
  topping: ToppingId;
  variant: number;
  x: number;
  y: number;
  turn: number;
};

export const money = (value: number) => `${PIZZERIA.currency}${value.toFixed(2)}`;
