import * as THREE from "three";

/*
 * The bike's finishes, for a browser. They're the same as the ones it's rendered in: a dark mirror
 * chrome, a green frame under a clear coat, carbon as a real twill, stainless that's run hot. It's a
 * night street, so all of it is tuned to stay out of pure white under a street lamp: nothing big and
 * curved is both glossy and pale.
 */

export type Maps = {
  flake: THREE.Texture;
  carbonAlbedo: THREE.Texture;
  carbonNormal: THREE.Texture;
  tyreFront: THREE.Texture;
  tyreRear: THREE.Texture;
  suitAlbedo: THREE.Texture;
  suitNormal: THREE.Texture;
  suitRough: THREE.Texture;
};

type Finish = THREE.MeshPhysicalMaterialParameters;

function heatRamp() {
  const stops: [number, string][] = [
    [0, "#8a7560"],
    [0.2, "#9a7f5c"],
    [0.42, "#a89a84"],
    [0.7, "#b0aeaa"],
  ];
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No 2D canvas");
  const fade = context.createLinearGradient(0, 0, 0, 256);
  for (const [at, colour] of stops) fade.addColorStop(at, colour);
  context.fillStyle = fade;
  context.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The pipe's length is in metres along v, which glTF stores as one minus v.
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, -1 / 1.3);
  texture.offset.set(0, 1 / 1.3);
  return texture;
}

export function makeFinishes(maps: Maps) {
  for (const texture of [maps.flake, maps.carbonAlbedo, maps.carbonNormal]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.flipY = false;
    texture.anisotropy = 8;
  }
  maps.carbonAlbedo.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [maps.suitAlbedo, maps.suitNormal, maps.suitRough]) {
    texture.flipY = false;
    texture.anisotropy = 8;
  }
  maps.suitAlbedo.colorSpace = THREE.SRGBColorSpace;
  maps.flake.repeat.set(90, 90);
  maps.carbonAlbedo.repeat.set(26, 26);
  maps.carbonNormal.repeat.set(26, 26);
  for (const texture of [maps.tyreFront, maps.tyreRear]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.flipY = false;
    texture.anisotropy = 8;
  }

  const metal = (colour: THREE.ColorRepresentation, roughness: number): Finish => ({ color: colour, metalness: 1, roughness });
  const lacquer = {
    map: maps.carbonAlbedo,
    normalMap: maps.carbonNormal,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.26,
    specularIntensity: 0.3,
  };
  const tyre = (normalMap: THREE.Texture): Finish => ({ color: "#0d0d0e", roughness: 0.78, metalness: 0, normalMap, specularIntensity: 0.3 });

  const finishes: Record<string, Finish> = {
    // A mirror coating so dark it reads as black glass until a street light crosses it: dark enough
    // that it's never the near-white of real chrome, and a touch rough, so a lamp can't burn it out.
    Chrome: { ...metal(new THREE.Color(0.24, 0.245, 0.26), 0.22), vertexColors: true },
    // The flanks are nearly flat, so a whole panel catches a lamp at once: they stay a satin, not a
    // metal. The fade from silver down to black is in each panel's vertex colours.
    Silver: { color: new THREE.Color(0.3, 0.303, 0.318), metalness: 0.35, roughness: 0.55, vertexColors: true },
    Black: { color: new THREE.Color(0.012, 0.012, 0.014), roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.35 },
    FrameGreen: { color: new THREE.Color(0.2, 0.53, 0.012), metalness: 0.25, roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.22 },
    Impeller: { color: new THREE.Color(0.55, 0.012, 0.016), metalness: 0.6, roughness: 0.36, clearcoat: 0.4, clearcoatRoughness: 0.25 },
    Pinstripe: { color: new THREE.Color(0.18, 0.55, 0.02), roughness: 0.4 },
    // The lettering: a satin white that stays readable on the dark chrome and never reaches the bloom.
    Mark: { color: new THREE.Color(0.62, 0.62, 0.6), roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 },
    Carbon: lacquer,
    Rim: { color: new THREE.Color(0.012, 0.012, 0.014), roughness: 0.36, metalness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.25 },
    TyreFront: tyre(maps.tyreFront),
    TyreRear: tyre(maps.tyreRear),
    Disc: metal(new THREE.Color(0.42, 0.42, 0.43), 0.32),
    Carrier: metal(new THREE.Color(0.05, 0.05, 0.055), 0.32),
    Gold: metal(new THREE.Color(0.72, 0.56, 0.3), 0.26),
    Anodised: metal(new THREE.Color(0.02, 0.02, 0.023), 0.28),
    Alloy: metal(new THREE.Color(0.5, 0.5, 0.51), 0.3),
    Stainless: metal(new THREE.Color(0.62, 0.62, 0.63), 0.3),
    Cast: metal(new THREE.Color(0.3, 0.3, 0.31), 0.44),
    Magnesium: metal(new THREE.Color(0.06, 0.06, 0.066), 0.44),
    Arm: metal(new THREE.Color(0.03, 0.03, 0.034), 0.5),
    Caliper: metal(new THREE.Color(0.05, 0.05, 0.055), 0.4),
    Grille: metal(new THREE.Color(0.1, 0.1, 0.105), 0.4),
    Steel: metal(new THREE.Color(0.6, 0.6, 0.61), 0.26),
    Bolt: metal(new THREE.Color(0.5, 0.5, 0.52), 0.3),
    Spring: { color: new THREE.Color(0.5, 0.02, 0.03), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1 },
    Rubber: { color: new THREE.Color(0.012, 0.012, 0.012), roughness: 0.7 },
    Plastic: { color: new THREE.Color(0.014, 0.014, 0.016), roughness: 0.56 },
    Chain: metal(new THREE.Color(0.3, 0.3, 0.31), 0.36),
    Radiator: { color: new THREE.Color(0.03, 0.03, 0.032), metalness: 0.9, roughness: 0.5 },
    Seat: { color: new THREE.Color(0.006, 0.006, 0.0065), roughness: 0.72 },
    Titanium: { map: heatRamp(), metalness: 1, roughness: 0.24 },
    // Black race leather: a low sheen off a fine grain, never the wet look of plastic.
    Suit: { map: maps.suitAlbedo, normalMap: maps.suitNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: maps.suitRough, roughness: 1, metalness: 0, sheen: 0.7, sheenRoughness: 0.55, sheenColor: new THREE.Color(0.34, 0.33, 0.33), specularIntensity: 0.6 },
    Leather: { color: "#ffffff", vertexColors: true, roughness: 0.52, specularIntensity: 0.55 },
    // A matt black shell, with satin trim and a dark smoked visor.
    HelmetPaint: { color: new THREE.Color(0.011, 0.011, 0.012), roughness: 0.52, metalness: 0, specularIntensity: 0.7 },
    HelmetBlack: { color: new THREE.Color(0.006, 0.006, 0.007), roughness: 0.34, metalness: 0, specularIntensity: 0.6 },
    HelmetWhite: { color: new THREE.Color(0.026, 0.026, 0.028), roughness: 0.42, metalness: 0.1 },
    HelmetVent: { color: new THREE.Color(0.003, 0.003, 0.004), roughness: 0.6 },
    Visor: { color: new THREE.Color(0.004, 0.004, 0.005), metalness: 0.2, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 },
    Screen: { color: new THREE.Color(0.05, 0.05, 0.055), roughness: 0.1, metalness: 0, transparent: true, opacity: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.08 },
    Lens: { color: new THREE.Color(0.9, 0.9, 0.92), roughness: 0.02, transparent: true, opacity: 0.3 },
  };

  const made = new Map<string, THREE.Material>();
  // The bike has open sheets as well as closed solids, so both faces of every piece are drawn.
  const worn = /^(Suit|Leather|Helmet|Visor)/;
  for (const [name, finish] of Object.entries(finishes)) {
    made.set(name, new THREE.MeshPhysicalMaterial({ side: worn.test(name) ? THREE.FrontSide : THREE.DoubleSide, ...finish }));
  }
  // Things that give off their own light.
  made.set("Lamp", new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.84, 2.6) }));
  made.set("TailLamp", new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.15, 0.1) }));
  made.set("Dash", new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.14, 0.14) }));
  return made;
}

/** Swaps the placeholders in a model for the real finishes, by name. */
export function dress(model: THREE.Object3D, finishes: Map<string, THREE.Material>) {
  const missing = new Set<string>();
  model.traverse((item) => {
    if (!(item instanceof THREE.Mesh)) return;
    const name = (item.material as THREE.Material).name.replace(/\.\d+$/, "");
    const finish = finishes.get(name);
    if (finish) item.material = finish;
    else missing.add(name);
  });
  return missing;
}
