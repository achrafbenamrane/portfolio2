import type { MetadataRoute } from "next";

import { SECTIONS } from "@/content/nav";
import { site } from "@/content/site";

/**
 * Derived from the nav rather than a second hand-written list, so a route added
 * to the site cannot silently go missing here. Home is prepended because
 * SECTIONS is the *sections* of the site and does not include it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = ["/", ...SECTIONS.map((section) => section.href)];

  return routes.map((href) => ({
    url: new URL(href, site.url).toString(),
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: href === "/" ? 1 : 0.8,
  }));
}
