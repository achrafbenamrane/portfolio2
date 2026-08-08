"use client";

import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { GLASS_Z, IMAC, IMAC_COLORS, PANEL_Y } from "./geometry";

/**
 * A rounded rectangle as flat geometry.
 *
 * `RoundedBox` cannot do this: it clamps its radius to half the smallest
 * dimension, so on a panel a few millimetres deep the corners come out square.
 * The glass has to match the overlay's rounding or the corners show as black
 * squares behind it.
 */
function roundedPlane(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);

  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  return new THREE.ShapeGeometry(shape, 16);
}

/**
 * Just the hardware. The screen is a DOM overlay positioned over the canvas by
 * `projectScreen`, so nothing in here knows about the desktop.
 */
export default function ImacModel() {
  const { panel, screen, neck, foot } = IMAC;

  const glassGeometry = useMemo(
    () => roundedPlane(screen.width, screen.height, screen.radius),
    [screen.width, screen.height, screen.radius],
  );

  useEffect(() => () => glassGeometry.dispose(), [glassGeometry]);

  // The assembly is raised so its overall centre lands on the camera axis.
  // Offsetting the camera instead would tilt it — R3F aims the default camera
  // at the origin — and a tilted camera keystones the screen rectangle.
  const neckY = PANEL_Y - panel.height / 2 - neck.height / 2;
  const footY = PANEL_Y - panel.height / 2 - neck.height - foot.height / 2;

  return (
    <group>
      {/* Back shell — the saturated colour, reading as a thin edge from front. */}
      <RoundedBox
        args={[panel.width, panel.height, panel.depth]}
        radius={panel.radius}
        smoothness={5}
        position={[0, PANEL_Y, 0]}
      >
        <meshStandardMaterial
          color={IMAC_COLORS.shell}
          metalness={0.35}
          roughness={0.45}
        />
      </RoundedBox>

      {/* The frame: a uniform 6 mm border, no chin. */}
      <RoundedBox
        args={[
          panel.width - panel.depth * 0.35,
          panel.height - panel.depth * 0.35,
          panel.depth * 0.5,
        ]}
        radius={panel.radius * 0.85}
        smoothness={5}
        position={[0, PANEL_Y, panel.depth * 0.3]}
      >
        <meshStandardMaterial
          color={IMAC_COLORS.front}
          metalness={0.2}
          roughness={0.55}
        />
      </RoundedBox>

      {/* Glass, rounded to match the overlay. Only ever visible if the overlay
          is misplaced, which makes it a useful tell rather than dead geometry. */}
      <mesh geometry={glassGeometry} position={[0, PANEL_Y, GLASS_Z]}>
        <meshStandardMaterial
          color={IMAC_COLORS.glass}
          metalness={0.2}
          roughness={0.15}
        />
      </mesh>

      {/* Stand: a flat blade into a shallow foot. */}
      <mesh position={[0, neckY, -neck.depth * 0.2]}>
        <boxGeometry args={[neck.width, neck.height, neck.depth]} />
        <meshStandardMaterial
          color={IMAC_COLORS.stand}
          metalness={0.4}
          roughness={0.34}
        />
      </mesh>

      <RoundedBox
        args={[foot.width, foot.height, foot.depth]}
        radius={foot.radius}
        smoothness={4}
        position={[0, footY, foot.depth * 0.22]}
      >
        <meshStandardMaterial
          color={IMAC_COLORS.stand}
          metalness={0.4}
          roughness={0.36}
        />
      </RoundedBox>
    </group>
  );
}
