/**
 * Quran audio for the desktop's music app.
 *
 * All URLs come from mp3quran.net, deliberately to the exclusion of the other
 * verified CDN: QuranicAudio's surah numbers are UNPADDED for most reciters but
 * PADDED for others, so a single URL builder silently 404s on a subset.
 * mp3quran.net is uniformly zero-padded to three digits, which means one
 * builder that cannot be wrong.
 *
 * Every host below sends `Access-Control-Allow-Origin: *` and supports HTTP
 * range requests, so seeking works in a plain <audio> element.
 *
 * These files stream from someone else's bandwidth. That is normal for a
 * low-traffic personal site and the sources are free to listen to, but do not
 * put this behind anything commercial without checking each reciter's terms.
 */

export interface Reciter {
  id: string;
  name: string;
  arabicName: string;
  /** Must end in a slash. Surah number is appended zero-padded to 3 digits. */
  base: string;
}

export const reciters: readonly Reciter[] = [
  {
    id: "alafasy",
    name: "Mishary Rashid Alafasy",
    arabicName: "مشاري بن راشد العفاسي",
    base: "https://server8.mp3quran.net/afs/",
  },
  {
    id: "sudais",
    name: "Abdur-Rahman As-Sudais",
    arabicName: "عبد الرحمن السديس",
    base: "https://server11.mp3quran.net/sds/",
  },
  {
    id: "husary",
    name: "Mahmoud Khalil Al-Husary",
    arabicName: "محمود خليل الحصري",
    base: "https://server13.mp3quran.net/husr/",
  },
  {
    id: "minshawi",
    name: "Mohamed Siddiq Al-Minshawi",
    arabicName: "محمد صديق المنشاوي",
    base: "https://server10.mp3quran.net/minsh/",
  },
  {
    id: "shatri",
    name: "Abu Bakr Ash-Shatri",
    arabicName: "أبو بكر الشاطري",
    base: "https://server11.mp3quran.net/shatri/",
  },
  {
    id: "dosari",
    name: "Yasser Al-Dosari",
    arabicName: "ياسر الدوسري",
    base: "https://server11.mp3quran.net/yasser/",
  },
];

export interface Surah {
  number: number;
  name: string;
  arabicName: string;
  meaning: string;
  ayat: number;
}

export const surahs: readonly Surah[] = [
  { number: 1, name: "Al-Fatihah", arabicName: "الفاتحة", meaning: "The Opening", ayat: 7 },
  { number: 18, name: "Al-Kahf", arabicName: "الكهف", meaning: "The Cave", ayat: 110 },
  { number: 36, name: "Ya-Sin", arabicName: "يس", meaning: "Ya-Sin", ayat: 83 },
  { number: 55, name: "Ar-Rahman", arabicName: "الرحمن", meaning: "The Most Merciful", ayat: 78 },
  { number: 56, name: "Al-Waqi'ah", arabicName: "الواقعة", meaning: "The Inevitable", ayat: 96 },
  { number: 67, name: "Al-Mulk", arabicName: "الملك", meaning: "The Sovereignty", ayat: 30 },
  { number: 2, name: "Al-Baqarah", arabicName: "البقرة", meaning: "The Cow", ayat: 286 },
  { number: 114, name: "An-Nas", arabicName: "الناس", meaning: "Mankind", ayat: 6 },
];

export function audioUrl(reciter: Reciter, surah: Surah): string {
  return `${reciter.base}${String(surah.number).padStart(3, "0")}.mp3`;
}
