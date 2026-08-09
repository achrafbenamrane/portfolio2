import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

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

const DESCRIPTION =
  "Full-Stack Developer, UI/UX Designer and Network & Information Security Engineer based in Annaba, Algeria.";

export const metadata: Metadata = {
  // Without metadataBase the OG image resolves to a relative URL, which every
  // social scraper rejects — the card renders blank.
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — Developer, Designer, Security Engineer`,
    template: `%s — ${site.shortName}`,
  },
  description: DESCRIPTION,
  applicationName: site.shortName,
  authors: [{ name: site.name, url: site.url }],
  creator: site.name,
  keywords: [
    ...site.roles,
    "Portfolio",
    "Annaba",
    "Algeria",
    "Next.js",
    "React",
    "Cybersecurity",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.shortName,
    title: `${site.name} — Developer, Designer, Security Engineer`,
    description: DESCRIPTION,
    url: site.url,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — Developer, Designer, Security Engineer`,
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="grain flex min-h-full flex-col">
        <SiteNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
