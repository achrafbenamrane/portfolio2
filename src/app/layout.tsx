import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import SiteFooter from "@/components/site-footer";
import SiteNav from "@/components/site-nav";
import { site } from "@/content/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The wordmark's face, and nothing else's. One italic serif against a page
 * of Geist and mono labels is a masthead; a second one anywhere would make
 * it a theme. Italic only — the upright is never set.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
});

const DESCRIPTION =
  "AXIOM is a full-stack development, computer vision and brand identity studio. We build web and mobile apps end to end, software that can see, and brands people recognise.";
const TITLE = `${site.brand} — Full-stack development, computer vision & brand identity`;

export const metadata: Metadata = {
  // Without metadataBase the OG image resolves to a relative URL, which every
  // social scraper rejects — the card renders blank.
  metadataBase: new URL(site.url),
  title: {
    default: TITLE,
    template: `%s — ${site.brand}`,
  },
  description: DESCRIPTION,
  applicationName: site.brand,
  authors: [{ name: site.brand, url: site.url }],
  creator: site.brand,
  keywords: [
    "AXIOM",
    "Full-stack development",
    "Web apps",
    "Mobile apps",
    "Websites",
    "Computer vision",
    "Hand tracking",
    "Brand identity",
    "Logo design",
    "Packaging design",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.brand,
    title: TITLE,
    description: DESCRIPTION,
    url: site.url,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="grain flex min-h-full flex-col">
        <SiteNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
