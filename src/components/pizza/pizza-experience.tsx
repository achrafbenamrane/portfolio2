"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  Component,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  MENU_PIZZAS,
  MENU_SECTIONS,
  type MenuExtra,
  money,
  PIZZA_SIZES,
  PIZZA_TOPPINGS,
  PIZZERIA,
  type PizzaSizeId,
  type ToppingId,
} from "@/content/pizza";
import { HandSensor } from "@/lib/vision/hand-sensor";

import type { MenuHotspot } from "./menu-pages";
import { PizzaBridge, type PizzaView } from "./pizza-bridge";

/** Three and the pizza's textures only load here, in the browser, on this page. */
const PizzaStage = dynamic(() => import("./pizza-stage"), { ssr: false });

type Step =
  | "room"
  | "meet"
  | "table"
  | "menu"
  | "start"
  | "sauce"
  | "cheese"
  | "toppings"
  | "chef"
  | "oven"
  | "out"
  | "sent";

const STEPS: { name: string; covers: Step[] }[] = [
  { name: "Menu", covers: ["table", "menu"] },
  { name: "Dough", covers: ["start"] },
  { name: "Sauce", covers: ["sauce"] },
  { name: "Cheese", covers: ["cheese"] },
  { name: "Toppings", covers: ["toppings"] },
  { name: "Oven", covers: ["chef", "oven"] },
  { name: "Order", covers: ["out", "sent"] },
];

const HEADINGS: Record<Step, { title: string; hint: string }> = {
  room: { title: "Benvenuti.", hint: `${PIZZERIA.line} Take a seat, or meet the chef.` },
  meet: { title: "", hint: "" },
  table: { title: "Your table.", hint: "The menu's waiting for you." },
  menu: { title: "", hint: "" },
  start: { title: "On the bench.", hint: "Pick a size, then make the pizza yourself." },
  sauce: { title: "Sauce on.", hint: "Now the mozzarella." },
  cheese: { title: "Cheese on.", hint: "On to the toppings." },
  toppings: { title: "Your toppings.", hint: "Tap a pan for a handful, or drag to place them yourself." },
  chef: { title: "", hint: "" },
  oven: { title: "", hint: "" },
  out: { title: "Buon appetito.", hint: "Straight from the fire to your table." },
  sent: { title: "Buon appetito.", hint: "" },
};

/** Which view each step looks at. */
const VIEWS: Record<Step, PizzaView> = {
  room: "room",
  meet: "meet",
  table: "table",
  menu: "book",
  start: "build",
  sauce: "build",
  cheese: "build",
  toppings: "build",
  chef: "chef",
  oven: "oven",
  out: "served",
  sent: "served",
};

const LAST_SPREAD = 3;

/** How long the fire takes on screen. The clock counts down a real bake's seconds. */
const OVEN_SECONDS = 9;
const REAL_BAKE_SECONDS = 90;
/** Long enough for the curtain to close before the scene changes behind it. */
const CURTAIN_MS = 460;
/** How far a dragged pan has to move before it counts as dragging. */
const DRAG_START_PX = 8;
/** How far apart pieces land while dragging, in metres. */
const SPRINKLE_GAP = 0.028;

const EXTRAS = MENU_SECTIONS.flatMap((section) => section.items);

type Ordered = { quantity: number; choice: string };

function useMedia(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const media = matchMedia(query);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
      },
      [query],
    ),
    () => matchMedia(query).matches,
    () => serverValue,
  );
}

let webglSupport: boolean | null = null;

/** Asked once and remembered, and the test context handed straight back: React reads
 *  this on every render, and past about 16 contexts a browser kills the oldest. */
function supportsWebgl(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    webglSupport = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const subscribeNever = () => () => {};
const getServerVersion = () => 0;

/** A missing file must cost the 3D, not the order. */
class SceneBoundary extends Component<
  { children: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The chef's name, arriving a letter at a time. */
function ChefName() {
  return (
    <div className="pizza-name" aria-label={`${PIZZERIA.chef}, ${PIZZERIA.chefTitle}`}>
      <span className="pizza-name-title" aria-hidden>
        {PIZZERIA.chefTitle}
      </span>
      <span className="pizza-name-letters" aria-hidden>
        {PIZZERIA.chef.split("").map((letter, index) => (
          <span key={index} style={{ animationDelay: `${0.35 + index * 0.055}s` }}>
            {letter === " " ? " " : letter}
          </span>
        ))}
      </span>
      <span className="pizza-name-rule" aria-hidden />
    </div>
  );
}

/**
 * Wolfexo Fast Food: the restaurant, and the order ticket that follows the visitor round it.
 *
 * It starts like the sports store, on the whole room from a corner. From there it's a meal:
 * a table, a menu to leaf through, a pizza made on the bench, the chef sliding it into the
 * oven, and the fire. All of it works without the 3D too: the ticket is the order, and the
 * restaurant is only the best way of filling it in.
 */
export default function PizzaExperience() {
  const [bridge] = useState(() => new PizzaBridge());
  const [hands] = useState(() => (typeof document === "undefined" ? null : new HandSensor()));
  const [step, setStep] = useState<Step>("room");
  const [size, setSize] = useState<PizzaSizeId>("medium");
  const [pizza, setPizza] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ToppingId[]>([]);
  const [ordered, setOrdered] = useState<Record<string, Ordered>>({});
  const [spread, setSpread] = useState(0);
  const [sheet, setSheet] = useState<{ item: MenuExtra; choice: string; quantity: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [curtain, setCurtain] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(REAL_BAKE_SECONDS);
  const [ghost, setGhost] = useState<{ topping: ToppingId; x: number; y: number } | null>(null);

  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)", false);
  const small = useMedia("(max-width: 860px)", false);
  const webgl = useSyncExternalStore(subscribeNever, supportsWebgl, () => true);
  const live = webgl && !failed;

  useSyncExternalStore(hands?.subscribe ?? subscribeNever, hands?.getVersion ?? getServerVersion, getServerVersion);
  const handStatus = hands?.status ?? "idle";
  const stageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const debug = window as unknown as { __pizzaBridge?: PizzaBridge; __pizzaHands?: HandSensor | null };
      debug.__pizzaBridge = bridge;
      debug.__pizzaHands = hands;
    }
  }, [bridge, hands]);

  const sizeChoice = PIZZA_SIZES.find((item) => item.id === size) ?? PIZZA_SIZES[1];
  const menuPizza = MENU_PIZZAS.find((item) => item.id === pizza) ?? null;
  const extraLines = EXTRAS.filter((item) => ordered[item.id]);
  const pizzaTotal = pizza
    ? sizeChoice.price +
      PIZZA_TOPPINGS.filter((item) => chosen.includes(item.id)).reduce((sum, item) => sum + item.price, 0)
    : 0;
  const total =
    pizzaTotal + extraLines.reduce((sum, item) => sum + item.price * ordered[item.id].quantity, 0);

  const onFail = useCallback(() => setFailed(true), []);
  const noop = useCallback(() => {}, []);
  const onProgress = useCallback((percent: number) => {
    setProgress(percent);
    if (percent >= 100) setReady(true);
  }, []);

  /** Runs `change` behind the curtain, so a cut between rooms never shows. */
  const cutTo = useCallback(
    (change: () => void) => {
      if (reducedMotion || !live) {
        change();
        return;
      }
      setCurtain(true);
      window.setTimeout(() => {
        change();
        window.setTimeout(() => setCurtain(false), 160);
      }, CURTAIN_MS);
    },
    [live, reducedMotion],
  );

  const sit = useCallback(() => setStep(live ? "table" : "menu"), [live]);
  const meet = useCallback(() => setStep("meet"), []);

  const openMenu = useCallback(() => {
    setSpread(1);
    setStep("menu");
  }, []);

  const startPizza = useCallback(
    (id: string) => {
      const choice = MENU_PIZZAS.find((item) => item.id === id);
      if (!choice) return;
      cutTo(() => {
        bridge.reset();
        setPizza(id);
        setChosen(choice.toppings);
        setStep("start");
      });
    },
    [bridge, cutTo],
  );

  const onBookPress = useCallback(
    (spot: MenuHotspot) => {
      if (spot.kind === "pizza") {
        startPizza(spot.id);
        return;
      }
      const item = EXTRAS.find((extra) => extra.id === spot.id);
      if (!item) return;
      const already = ordered[item.id];
      setSheet({
        item,
        choice: already?.choice ?? item.choices.options[0],
        quantity: already?.quantity ?? 1,
      });
    },
    [ordered, startPizza],
  );

  const saveSheet = () => {
    if (!sheet) return;
    setOrdered((now) => {
      const next = { ...now };
      if (sheet.quantity > 0) next[sheet.item.id] = { quantity: sheet.quantity, choice: sheet.choice };
      else delete next[sheet.item.id];
      return next;
    });
    setSheet(null);
  };

  const fire = useCallback(() => {
    if (!live) {
      setStep("out");
      return;
    }
    cutTo(() => setStep("chef"));
  }, [cutTo, live]);

  // The chef has finished at the mouth of the oven: on to the fire.
  const onServed = useCallback(() => {
    cutTo(() => {
      setStep("oven");
      setSecondsLeft(REAL_BAKE_SECONDS);
      bridge.bake(reducedMotion ? OVEN_SECONDS / 2 : OVEN_SECONDS, (share) => {
        setSecondsLeft(Math.ceil(REAL_BAKE_SECONDS * (1 - share)));
        if (share < 1) return;
        cutTo(() => setStep("out"));
      });
    });
  }, [bridge, cutTo, reducedMotion]);

  const send = useCallback(() => {
    const lines = [
      ...(menuPizza ? [`${sizeChoice.name} ${menuPizza.name} (${sizeChoice.centimetres} cm)`] : []),
      ...PIZZA_TOPPINGS.filter((item) => pizza && chosen.includes(item.id)).map((item) => `+ ${item.name}`),
      ...extraLines.map((item) => `${ordered[item.id].quantity} × ${item.name} (${ordered[item.id].choice})`),
      `Total ${money(total)}`,
    ];
    if (PIZZERIA.whatsapp) {
      const text = encodeURIComponent(lines.join("\n"));
      window.open(`https://wa.me/${PIZZERIA.whatsapp}?text=${text}`, "_blank", "noopener");
    }
    setStep("sent");
  }, [chosen, extraLines, menuPizza, ordered, pizza, sizeChoice, total]);

  const again = useCallback(() => {
    cutTo(() => {
      bridge.reset();
      setChosen([]);
      setPizza(null);
      setOrdered({});
      setSpread(1);
      setStep("menu");
    });
  }, [bridge, cutTo]);

  const act = () => {
    if (step === "start") {
      bridge.ladle();
      setStep("sauce");
    } else if (step === "sauce") {
      bridge.sprinkle();
      setStep("cheese");
      window.setTimeout(
        () => {
          setStep("toppings");
          // A pizza from the menu arrives with its own toppings on, to change at will.
          chosen.forEach((topping, index) => {
            const portion = PIZZA_TOPPINGS.find((item) => item.id === topping);
            if (portion) window.setTimeout(() => bridge.portion(topping, portion.pieces), index * 420);
          });
        },
        reducedMotion ? 0 : 1500,
      );
    } else if (step === "toppings") {
      fire();
    } else if (step === "out" || step === "menu") {
      send();
    } else if (step === "sent") {
      again();
    }
  };

  const toggle = useCallback(
    (topping: ToppingId) => {
      const portion = PIZZA_TOPPINGS.find((item) => item.id === topping);
      if (!portion) return;
      // Not inside a state updater: React may run those twice, and that's two handfuls.
      if (chosen.includes(topping)) {
        bridge.remove(topping);
        setChosen(chosen.filter((item) => item !== topping));
      } else {
        bridge.portion(topping, portion.pieces);
        setChosen([...chosen, topping]);
      }
    },
    [bridge, chosen],
  );

  // A pan is a button for a tap and a handful of toppings for a drag. A mouse, a finger and
  // a pinch in front of the camera all come through these three.
  const grip = useRef<{
    topping: ToppingId;
    x: number;
    y: number;
    dragging: boolean;
    last: { x: number; y: number } | null;
  } | null>(null);

  const gripStart = useCallback((topping: ToppingId, x: number, y: number) => {
    grip.current = { topping, x, y, dragging: false, last: null };
  }, []);

  const gripMove = useCallback(
    (x: number, y: number) => {
      const now = grip.current;
      if (!now) return;
      if (!now.dragging) {
        if (Math.hypot(x - now.x, y - now.y) < DRAG_START_PX) return;
        now.dragging = true;
      }
      setGhost({ topping: now.topping, x, y });

      const spot = bridge.pointOnPizza(x, y);
      if (!spot) return;
      if (now.last && Math.hypot(spot.x - now.last.x, spot.y - now.last.y) < SPRINKLE_GAP) return;
      now.last = spot;
      bridge.drop(now.topping, spot.x, spot.y);
      setChosen((list) => (list.includes(now.topping) ? list : [...list, now.topping]));
    },
    [bridge],
  );

  const gripEnd = useCallback(() => {
    const now = grip.current;
    grip.current = null;
    setGhost(null);
    if (now && !now.dragging) toggle(now.topping);
  }, [toggle]);

  const onPanDown = (event: ReactPointerEvent<HTMLButtonElement>, topping: ToppingId) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gripStart(topping, event.clientX, event.clientY);
  };

  const onPanCancel = () => {
    grip.current = null;
    setGhost(null);
  };

  const startHands = () => {
    if (hands && videoRef.current) void hands.start(videoRef.current);
  };

  // The camera is only for the toppings, and it goes off the moment they're done.
  useEffect(() => {
    if (step !== "toppings") hands?.stop();
  }, [hands, step]);

  useEffect(() => () => hands?.stop(), [hands]);

  // Read straight from the sensor in a loop of its own: a hand moves sixty times a second.
  const actions = useRef({ gripStart, gripMove, gripEnd });
  useEffect(() => {
    actions.current = { gripStart, gripMove, gripEnd };
  }, [gripStart, gripMove, gripEnd]);

  useEffect(() => {
    if (!hands || handStatus !== "running") return;
    let frameId = 0;
    let wasPinching = false;

    const follow = () => {
      frameId = requestAnimationFrame(follow);
      const stage = stageRef.current;
      const cursor = handRef.current;
      if (!stage || !cursor) return;

      const hand = hands.frame;
      const box = stage.getBoundingClientRect();
      const x = box.left + hand.pointerX * box.width;
      const y = box.top + hand.pointerY * box.height;
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      cursor.dataset.seen = String(hand.hasHand);
      cursor.dataset.pinching = String(hand.pinching);

      const pinching = hand.hasHand && hand.pinching;
      if (pinching && !wasPinching) {
        const pan = document
          .elementsFromPoint(x, y)
          .map((element) => element.closest<HTMLElement>("[data-topping]"))
          .find(Boolean);
        if (pan) actions.current.gripStart(pan.dataset.topping as ToppingId, x, y);
      } else if (pinching) {
        actions.current.gripMove(x, y);
      } else if (wasPinching) {
        actions.current.gripEnd();
      }
      wasPinching = pinching;
    };

    frameId = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frameId);
  }, [hands, handStatus]);

  // The book's pages answer to the arrow keys too.
  useEffect(() => {
    if (step !== "menu") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") setSpread((now) => Math.min(now + 1, LAST_SPREAD));
      if (event.key === "ArrowLeft") setSpread((now) => Math.max(now - 1, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const heading = HEADINGS[step];
  const building = step === "start" || step === "sauce" || step === "cheese" || step === "toppings";
  const stepIndex = STEPS.findIndex((item) => item.covers.includes(step));
  const showTicket = step !== "room" && step !== "meet" && step !== "table" && step !== "chef" && step !== "oven";
  const canSendEarly = step === "menu" && !pizza && extraLines.length > 0;
  const actionLabel: Partial<Record<Step, string>> = {
    start: "Ladle the sauce",
    sauce: "Throw the mozzarella",
    cheese: "Throwing…",
    toppings: "Fire it",
    out: PIZZERIA.demo ? "Send the order" : "Send to the kitchen",
    sent: "Order again",
    menu: "Send the order",
  };
  const quantities = Object.fromEntries(Object.entries(ordered).map(([id, line]) => [id, line.quantity]));

  return (
    <main ref={stageRef} className="pizza-stage" data-step={step}>
      {!live && (
        <Image
          src="/pizza/poster.webp"
          alt="The Wolfexo Fast Food dining room: checked tablecloths, a brick oven and a bar of bottles."
          fill
          sizes="100vw"
          className="object-cover"
        />
      )}

      {live && (
        <div className="pizza-canvas">
          <SceneBoundary onFail={onFail}>
            <PizzaStage
              bridge={bridge}
              view={VIEWS[step]}
              scale={sizeChoice.scale}
              small={small}
              reducedMotion={reducedMotion}
              book={{ spread, chosenPizza: pizza, quantities, onPress: onBookPress, onOpen: openMenu }}
              onSeat={sit}
              onMeet={meet}
              onServed={onServed}
              onLanded={noop}
              onProgress={onProgress}
            />
          </SceneBoundary>
        </div>
      )}

      <div className="pizza-curtain" data-on={curtain} aria-hidden />

      {live && !ready && (
        <div className="pizza-loading" role="status">
          <span>Lighting the oven</span>
          <div className="pizza-loading-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {step === "room" && (
        <p className="pizza-cam" aria-hidden>
          <span className="pizza-cam-dot" /> Live · Sala 01 · {PIZZERIA.name}
        </p>
      )}

      <div className="pizza-head">
        {stepIndex >= 0 && (
          <ol className="pizza-steps" aria-label="Steps">
            {STEPS.map((item, index) => (
              <li
                key={item.name}
                data-state={index === stepIndex ? "now" : index < stepIndex ? "done" : "next"}
                aria-current={index === stepIndex ? "step" : undefined}
              >
                {item.name}
              </li>
            ))}
          </ol>
        )}
        {heading.title && (
          <h1 className="pizza-title" key={step}>
            {heading.title}
          </h1>
        )}
        {heading.hint && (
          <p className="pizza-hint" key={`${step}-hint`}>
            {heading.hint}
          </p>
        )}
        {step === "room" && (
          <div className="pizza-enter">
            <button type="button" className="pizza-enter-main" onClick={sit}>
              Take a seat
            </button>
            {live && (
              <button type="button" className="pizza-enter-other" onClick={meet}>
                Meet the chef
              </button>
            )}
          </div>
        )}
      </div>

      {(step === "table" || step === "menu" || step === "meet") && (
        <button
          type="button"
          className="pizza-back"
          onClick={() => {
            setSpread(0);
            setStep("room");
          }}
        >
          ← Back to the room
        </button>
      )}

      {step === "table" && (
        <button type="button" className="pizza-open" onClick={openMenu}>
          Open the menu
        </button>
      )}

      {step === "menu" && live && (
        <nav className="pizza-pages" aria-label="Pages of the menu">
          <button type="button" disabled={spread <= 1} onClick={() => setSpread(spread - 1)}>
            ← Turn back
          </button>
          <span>
            {spread} / {LAST_SPREAD}
          </span>
          <button type="button" disabled={spread >= LAST_SPREAD} onClick={() => setSpread(spread + 1)}>
            Turn the page →
          </button>
        </nav>
      )}

      {/* The same menu as plain text: for no 3D, and for anyone who can't see the book. */}
      {step === "menu" && (
        <section className={live ? "sr-only" : "pizza-plain"} aria-label="Menu">
          <h2>Le Pizze</h2>
          <ul>
            {MENU_PIZZAS.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => startPizza(item.id)}>
                  {item.name}: {item.note}
                </button>
              </li>
            ))}
          </ul>
          {MENU_SECTIONS.map((section) => (
            <div key={section.id}>
              <h2>{section.title}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onBookPress({ kind: "extra", id: item.id, left: 0, top: 0, right: 0, bottom: 0 })}
                    >
                      {item.name}, {money(item.price)}: {item.note}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {sheet && (
        <div className="pizza-sheet" role="dialog" aria-label={sheet.item.name}>
          <p className="pizza-sheet-name">{sheet.item.name}</p>
          <p className="pizza-sheet-note">{sheet.item.note}</p>
          <p className="pizza-sheet-label">{sheet.item.choices.label}</p>
          <div className="pizza-sheet-choices">
            {sheet.item.choices.options.map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={sheet.choice === option}
                onClick={() => setSheet({ ...sheet, choice: option })}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="pizza-sheet-count">
            <button
              type="button"
              aria-label="One fewer"
              onClick={() => setSheet({ ...sheet, quantity: Math.max(sheet.quantity - 1, 0) })}
            >
              −
            </button>
            <span>{sheet.quantity}</span>
            <button type="button" aria-label="One more" onClick={() => setSheet({ ...sheet, quantity: sheet.quantity + 1 })}>
              +
            </button>
          </div>
          <button type="button" className="pizza-action" onClick={saveSheet}>
            {sheet.quantity > 0 ? `Add to the ticket · ${money(sheet.item.price * sheet.quantity)}` : "Take it off"}
          </button>
          <button type="button" className="pizza-sheet-close" onClick={() => setSheet(null)}>
            Close
          </button>
        </div>
      )}

      {step === "toppings" && (
        <ul className="pizza-tray" aria-label="Toppings">
          {PIZZA_TOPPINGS.map((item) => {
            const on = chosen.includes(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="pizza-pan"
                  aria-pressed={on}
                  aria-label={`${item.name}, ${money(item.price)}`}
                  data-topping={item.id}
                  onPointerDown={(event) => onPanDown(event, item.id)}
                  onPointerMove={(event) => gripMove(event.clientX, event.clientY)}
                  onPointerUp={gripEnd}
                  onPointerCancel={onPanCancel}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(item.id);
                    }
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a cut-out, sized by the pan */}
                  <img className="pizza-pan-picture" src={`/pizza/pan-${item.id}.webp`} alt="" draggable={false} />
                  <span className="pizza-pan-name">{item.name}</span>
                  <span className="pizza-pan-price">+{money(item.price)}</span>
                  {on && (
                    <span className="pizza-pan-on" aria-hidden>
                      ●
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pizza-camera" data-on={handStatus === "running"} hidden={step !== "toppings" || small}>
        <video ref={videoRef} aria-hidden playsInline muted className="pizza-camera-view" />
        {handStatus === "running" ? (
          <>
            <p className="pizza-camera-line">Pinch a pan, carry it over, let go.</p>
            <p className="pizza-camera-privacy">ON-DEVICE · VIDEO NEVER LEAVES YOUR MACHINE</p>
            <button type="button" className="pizza-camera-button" onClick={() => hands?.stop()}>
              Stop camera
            </button>
          </>
        ) : handStatus === "requesting" || handStatus === "loading" ? (
          <p className="pizza-camera-line" role="status">
            {handStatus === "requesting" ? "Allow the camera in your browser." : "Getting ready…"}
          </p>
        ) : handStatus === "idle" ? (
          <button type="button" className="pizza-camera-button" onClick={startHands}>
            Use your hands
          </button>
        ) : (
          <p className="pizza-camera-line" role="status">
            No camera here. Tap or drag the pans instead.
          </p>
        )}
      </div>

      {handStatus === "running" && step === "toppings" && (
        <div ref={handRef} className="pizza-hand" aria-hidden data-seen="false" data-pinching="false" />
      )}

      {ghost && (
        // eslint-disable-next-line @next/next/no-img-element -- follows the pointer
        <img
          className="pizza-ghost"
          src={`/pizza/pan-${ghost.topping}.webp`}
          alt=""
          style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}
        />
      )}

      {(step === "chef" || step === "meet") && <ChefName />}

      {step === "oven" && (
        <div className="pizza-clock" role="status" aria-live="off">
          <span className="pizza-clock-seconds">{secondsLeft}</span>
          <span className="pizza-clock-label">Seconds in the fire</span>
        </div>
      )}

      {showTicket && <div className="pizza-rail" aria-hidden />}

      {showTicket && (
        <aside className="pizza-ticket-hang" aria-label="Your order">
          <div className="pizza-ticket">
            <p className="pizza-brand">{PIZZERIA.mark}</p>
            <p className="pizza-brand-line">{PIZZERIA.markLine}</p>
            <p className="pizza-ticket-meta">
              <span>Order 0417</span>
              <span>Table 7</span>
            </p>

            {building && (
              <fieldset className="pizza-sizes">
                <legend>Size</legend>
                {PIZZA_SIZES.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="pizza-size"
                    aria-pressed={size === item.id}
                    onClick={() => setSize(item.id)}
                  >
                    {item.name}
                    <small>{item.centimetres} cm</small>
                  </button>
                ))}
              </fieldset>
            )}

            <ul className="pizza-lines" aria-live="polite">
              {menuPizza && (
                <li className="pizza-line">
                  <span>
                    {sizeChoice.name} {menuPizza.name}
                  </span>
                  <span>{money(sizeChoice.price)}</span>
                </li>
              )}
              {menuPizza && step !== "start" && (
                <li className="pizza-line">
                  <span>Tomato sauce</span>
                  <span>incl.</span>
                </li>
              )}
              {menuPizza && step !== "start" && step !== "sauce" && (
                <li className="pizza-line">
                  <span>Mozzarella</span>
                  <span>incl.</span>
                </li>
              )}
              {menuPizza &&
                step !== "start" &&
                step !== "sauce" &&
                step !== "cheese" &&
                PIZZA_TOPPINGS.filter((item) => chosen.includes(item.id)).map((item) => (
                  <li className="pizza-line" key={item.id}>
                    <span>{item.name}</span>
                    <span>{money(item.price)}</span>
                  </li>
                ))}
              {extraLines.map((item) => (
                <li className="pizza-line" key={item.id}>
                  <span>
                    {ordered[item.id].quantity} × {item.name}
                  </span>
                  <span>{money(item.price * ordered[item.id].quantity)}</span>
                </li>
              ))}
              {!menuPizza && extraLines.length === 0 && (
                <li className="pizza-line pizza-line-empty">
                  <span>Choose something from the book</span>
                </li>
              )}
            </ul>

            <p className="pizza-total">
              <span>Total</span>
              <span>{money(total)}</span>
            </p>

            {step === "sent" && (
              <>
                <span className="pizza-stamp">{PIZZERIA.demo ? "Demo order" : "Sent"}</span>
                {PIZZERIA.demo && (
                  <p className="pizza-note">
                    This restaurant is a demo, so nothing was ordered. On your site, this ticket goes
                    straight to your kitchen. <Link href="/contact">Talk to me about yours</Link>
                  </p>
                )}
              </>
            )}

            {(step !== "menu" || canSendEarly) && (
              <button type="button" className="pizza-action" onClick={act} disabled={step === "cheese"}>
                {actionLabel[step]}
              </button>
            )}
          </div>
        </aside>
      )}

      <p className="pizza-credit">
        A 3D website by Achraf Benamrane. This restaurant is a demo. <Link href="/contact">Want one for yours?</Link>
      </p>
    </main>
  );
}
