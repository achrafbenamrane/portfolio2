import { palmOf, rollOf, sizeOf } from "@/components/tether/gestures";
import type { PuppetFrame } from "@/lib/vision/puppet-sensor";

import type { Controls } from "./bike";

/*
 * Invisible handlebars. Hold both hands up as if you were gripping the bars: tip them to lean, the
 * way the bike tips, lift them to open the throttle, and drop them to brake. Those are big, slow
 * movements on purpose. The last game taught us what a camera can read from across a room: a whole
 * arm, easily; a finger, not always. Everything's measured in palm lengths, so it plays the same
 * near the camera or far from it.
 *
 * Two more moves, just as big: reach right up above full gas for the nitro, and pull both hands in
 * close together, as if hauling the bars back, for a cabrage. Stay down on the brake at a stop and
 * the bike rolls backward.
 *
 * One hand works too: tilt it to lean, and lift or drop it the same way.
 */

/** A full lean, in radians of tilt across the bar. */
const FULL_TILT = 0.5;
/** A full push on the throttle or the brake, in lengths of the rider's palm. */
const FULL_REACH = 1.5;
const STILL_ZONE = 0.12;
const LINK_SECONDS = 1;
/** How far past full gas the hands go for the nitro, and how close they come for a cabrage, as a share of their width at the start. */
const NITRO_REACH = 1.15;
const CABRAGE_IN = 0.6;
const CABRAGE_OUT = 0.74;

const clampUnit = (value: number) => Math.min(Math.max(value, -1), 1);
const deadZone = (value: number, zone: number) => (Math.abs(value) < zone ? 0 : Math.sign(value) * ((Math.abs(value) - zone) / (1 - zone)));

export class Handlebars {
  /** What's on screen for the rider. */
  label = "";
  /** Holding still to set the middle: 0 to 1, then done. */
  linkShare = 0;
  linked = false;
  driving = false;
  /** Where the bar is drawn, in the raw video, for the overlay. */
  leftHand: { x: number; y: number } | null = null;
  rightHand: { x: number; y: number } | null = null;
  /** The two moves a key can't be held for, read from the hands. */
  nitro = false;
  wheelie = false;

  private restY = 0.55;
  private restSpread = 0;
  private spread = 0;
  private lastAt = 0;
  private tilt = 0;
  private lift = 0;

  read(frame: PuppetFrame, input: Controls, aspect: number) {
    const now = frame.at;
    if (now === this.lastAt) return;
    const dt = Math.min((now - this.lastAt) / 1000, 0.1);
    this.lastAt = now;

    const hands = frame.hands;
    this.driving = hands.length > 0;
    if (!this.driving) {
      // Hands gone: shut the throttle, sit the bike up. Nothing runs away with the rider.
      input.throttle = 0;
      input.brake = 0;
      input.steer *= 0.9;
      this.nitro = this.wheelie = false;
      this.leftHand = this.rightHand = null;
      this.label = this.linked ? "Can't see your hands" : "Hold your hands up";
      return;
    }

    let tilt: number;
    let height: number;
    let palm: number;
    if (hands.length >= 2) {
      const [a, b] = [...hands].sort((p, q) => palmOf(p).x - palmOf(q).x);
      const left = palmOf(a);
      const right = palmOf(b);
      this.leftHand = left;
      this.rightHand = right;
      // palmOf is already mirrored, so left and right here are the rider's own. Leaning right
      // means their right hand has dropped below their left.
      tilt = Math.atan2((right.y - left.y) / aspect, Math.abs(right.x - left.x) + 0.001);
      height = (left.y + right.y) / 2;
      palm = (sizeOf(a, aspect) + sizeOf(b, aspect)) / 2;
      const wide = Math.abs(right.x - left.x) / Math.max(palm, 0.02);
      this.spread = this.spread === 0 ? wide : this.spread + (wide - this.spread) * 0.5;
    } else {
      const hand = hands[0];
      const middle = palmOf(hand);
      this.leftHand = middle;
      this.rightHand = null;
      tilt = rollOf(hand, aspect);
      height = middle.y;
      palm = sizeOf(hand, aspect);
    }

    this.tilt += (tilt - this.tilt) * 0.5;
    this.lift += (height - this.lift) * 0.5;

    if (!this.linked) {
      this.linkShare = Math.min(this.linkShare + dt / LINK_SECONDS, 1);
      this.restY = this.lift;
      this.restSpread = this.spread;
      this.label = "Hold still";
      if (this.linkShare >= 1) this.linked = true;
      return;
    }

    // Hands come up one after the other, so the second may only arrive once the ride has begun. Its
    // first sight sets how far apart they rest, or a cabrage could never be asked for.
    if (this.restSpread === 0) this.restSpread = this.spread;

    input.steer = deadZone(clampUnit(this.tilt / FULL_TILT), STILL_ZONE);
    const push = (this.restY - this.lift) / Math.max(palm * FULL_REACH, 0.04);
    const pedal = deadZone(clampUnit(push), STILL_ZONE);
    input.throttle = Math.max(pedal, 0);
    input.brake = Math.max(-pedal, 0);
    this.nitro = push > NITRO_REACH;
    // Needs both hands, and it lets go a little later than it catches, so it doesn't flutter.
    const closeness = hands.length >= 2 && this.restSpread > 0 ? this.spread / this.restSpread : 1;
    this.wheelie = closeness < (this.wheelie ? CABRAGE_OUT : CABRAGE_IN);
    this.label = this.wheelie ? "Cabrage" : this.nitro ? "Nitro" : input.brake > 0.05 ? "Braking" : input.throttle > 0.05 ? "On the gas" : Math.abs(input.steer) > 0.1 ? "Leaning" : "Rolling";
  }
}
