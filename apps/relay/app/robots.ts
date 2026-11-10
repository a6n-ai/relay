import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/docs", "/login"], disallow: ["/dashboard", "/api"] },
    sitemap: "https://relay.a6n.ai/sitemap.xml",
  };
}
