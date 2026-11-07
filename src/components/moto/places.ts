/*
 * The famous places of Algiers, where they really are, for the map to point at. Positions are in
 * game axes: x east, z south. A place counts as reached from anywhere inside its radius.
 */

export type Landmark = { name: string; arabic: string; x: number; z: number; radius: number };

export const LANDMARKS: readonly Landmark[] = [
  { name: "Maqam Echahid", arabic: "مقام الشهيد", x: -1808, z: 2147, radius: 230 },
  { name: "The Great Mosque", arabic: "المسجد الأعظم", x: 4276, z: 3252, radius: 300 },
  { name: "La Grande Poste", arabic: "البريد المركزي", x: -2809, z: -835, radius: 150 },
  { name: "Place des Martyrs", arabic: "ساحة الشهداء", x: -2438, z: -2234, radius: 130 },
  { name: "La Casbah", arabic: "القصبة", x: -2867, z: -2167, radius: 170 },
  { name: "Notre-Dame d'Afrique", arabic: "السيدة الإفريقية", x: -4200, z: -4019, radius: 170 },
  { name: "Jardin d'Essai", arabic: "حديقة التجارب", x: -1205, z: 1874, radius: 220 },
  { name: "Bab El Oued", arabic: "باب الوادي", x: -3292, z: -2868, radius: 180 },
  { name: "Belcourt", arabic: "بلكور", x: -2684, z: 1328, radius: 180 },
  { name: "Les Sablettes", arabic: "الصابلات", x: 2650, z: 2445, radius: 220 },
];
