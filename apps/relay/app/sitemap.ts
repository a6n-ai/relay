import type { MetadataRoute } from "next";

const BASE = "https://relay.a6n.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/docs", "/docs/api", "/login"].map((path) => ({ url: `${BASE}${path}` }));
}
