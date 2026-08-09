import type { MetadataRoute } from "next";

import { site } from "@/content/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Dev-only diagnostics page; it 404s in production anyway.
      disallow: "/lab/",
    },
    sitemap: new URL("/sitemap.xml", site.url).toString(),
  };
}
