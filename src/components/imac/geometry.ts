/**
 * Monitor dimensions.
 *
 * Modelled as a modern bezel-less display rather than a real 24-inch iMac: the
 * screen fills the whole front behind a uniform 6 mm frame, with no chin. The
 * first pass used Apple's actual enclosure, which put a 82 mm chin under the
 * glass and left a quarter of the machine as blank aluminium.
 *
 * Authored in millimetres and converted once, so the proportions stay legible
 * instead of becoming magic world units.
 */

/** Panel width in world units. Everything else derives from this. */
export const PANEL_WIDTH = 3.4;

/**
 * The desktop's aspect ratio is the source of truth. The screen is sized 16:9
 * from it and the panel is the screen plus a uniform frame, so the DOM can
 * never disagree with the glass it sits on.
 */
export const DESKTOP_CSS = { width: 800, height: 450 } as const;

const SCREEN_MM = { w: 520, h: 520 / (DESKTOP_CSS.width / DESKTOP_CSS.height) };
const BEZEL_MM = 6;
const PANEL_MM = {
  w: SCREEN_MM.w + BEZEL_MM * 2,
  h: SCREEN_MM.h + BEZEL_MM * 2,
  depth: 11.5,
};
const NECK_MM = { w: 120, h: 90, depth: 10 };
const FOOT_MM = { w: 230, depth: 147, h: 6 };

const MM = PANEL_WIDTH / PANEL_MM.w;
const mm = (value: number) => value * MM;

export const IMAC = {
  panel: {
    width: mm(PANEL_MM.w),
    height: mm(PANEL_MM.h),
    depth: mm(PANEL_MM.depth),
    radius: mm(16),
  },
  screen: {
    width: mm(SCREEN_MM.w),
    height: mm(SCREEN_MM.h),
    /** Inner radius = outer minus the frame, the way a real bezel works. */
    radius: mm(10),
  },
  neck: {
    width: mm(NECK_MM.w),
    height: mm(NECK_MM.h),
    depth: mm(NECK_MM.depth),
  },
  foot: {
    width: mm(FOOT_MM.w),
    depth: mm(FOOT_MM.depth),
    height: mm(FOOT_MM.h),
    radius: mm(3),
  },
  /** Panel centre above the desk surface. foot + neck + half the panel. */
  panelCentreY: mm(FOOT_MM.h + NECK_MM.h + PANEL_MM.h / 2),
  totalHeight: mm(FOOT_MM.h + NECK_MM.h + PANEL_MM.h),
} as const;

export const CAMERA_Z = 5.6;
export const CAMERA_FOV = 30;
/** Glass sits just proud of the panel's front face. */
export const GLASS_Z = IMAC.panel.depth * 0.55;

/** The desktop's own corner rounding, in its CSS pixels. */
export const DESKTOP_RADIUS_PX = Math.round(
  10 * (DESKTOP_CSS.width / SCREEN_MM.w),
);

/** Lifts the DOM off the glass so it cannot z-fight with the panel mesh. */
export const SCREEN_EPSILON = 0.002;

/**
 * Where the panel's centre sits, so the whole assembly is centred in frame.
 *
 * The model is raised rather than the camera lowered, and that is not
 * interchangeable: R3F aims its default camera at the world origin, so giving
 * the camera a y offset TILTS it instead of translating the view. A 3° tilt
 * projects this rectangle as a slight trapezoid and pushed the overlay about
 * 15% of the panel height too high. With the camera at y = 0, looking at the
 * origin IS looking straight ahead, and the projection below is exact.
 */
export const PANEL_Y = (IMAC.neck.height + IMAC.foot.height) / 2;

/**
 * Where the glass lands on the canvas, in CSS pixels.
 *
 * The desktop is a plain absolutely-positioned overlay placed from this, rather
 * than DOM embedded in the scene through drei's `<Html transform>`. Three
 * successive attempts to make that land on the glass left it offset, and its
 * CSS3D pipeline depends on R3F's asynchronously-measured canvas size, which is
 * not something this file can check.
 *
 * The monitor is static and square to camera, so its projection is an
 * axis-aligned rectangle — a closed-form perspective divide, verifiable on
 * paper, with no dependency on how anything else measures itself.
 */
export function projectScreen(canvasWidth: number, canvasHeight: number) {
  const distance = CAMERA_Z - GLASS_Z;
  const visibleHeight =
    2 * distance * Math.tan((CAMERA_FOV * Math.PI) / 360);
  const pxPerWorld = canvasHeight / visibleHeight;

  const width = IMAC.screen.width * pxPerWorld;
  const height = IMAC.screen.height * pxPerWorld;

  return {
    width,
    height,
    left: canvasWidth / 2 - width / 2,
    // The camera axis is y = 0, and the glass centre sits PANEL_Y above it, so
    // it projects that far above the canvas centre.
    top: canvasHeight / 2 - PANEL_Y * pxPerWorld - height / 2,
    scale: width / DESKTOP_CSS.width,
  };
}

export const IMAC_COLORS = {
  /** Saturated back shell — the blue iMac, which suits the site palette. */
  shell: "#2E6FA8",
  /** Pale painted aluminium: the frame around the glass. */
  front: "#DFE5EA",
  /** Anodised stand. */
  stand: "#C9CFD4",
  /** Behind the DOM panel, so any sliver of gap still reads as a screen. */
  glass: "#0B1015",
} as const;
