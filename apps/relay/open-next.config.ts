import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental/tag cache: every page is dynamic (no ISR, unstable_cache or "use cache").
export default defineCloudflareConfig();
