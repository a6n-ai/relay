// Pure: no Node or Workers imports, so the vitest workers pool can load it.
export interface D1Binding {
  binding: string;
  name: string;
  id: string;
}

export interface WranglerResources {
  d1: D1Binding[];
  r2: string[];
  queues: string[];
}

interface RawConfig {
  d1_databases?: { binding: string; database_name: string; database_id: string }[];
  r2_buckets?: { bucket_name: string }[];
  queues?: {
    producers?: { queue: string }[];
    consumers?: { queue: string; dead_letter_queue?: string }[];
  };
}

// shortcut: trailing-comma regex can touch a string value containing ",}" or ",]"; fine for this file, use jsonc-parser if that ever happens.
export function stripJsonc(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new Error("unterminated block comment in wrangler config");
      i = end + 1;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseWranglerJsonc(text: string): WranglerResources {
  const raw = JSON.parse(stripJsonc(text)) as RawConfig;
  const queues = new Set<string>();
  for (const p of raw.queues?.producers ?? []) queues.add(p.queue);
  for (const c of raw.queues?.consumers ?? []) {
    queues.add(c.queue);
    if (c.dead_letter_queue) queues.add(c.dead_letter_queue);
  }
  return {
    d1: (raw.d1_databases ?? []).map((d) => ({ binding: d.binding, name: d.database_name, id: d.database_id })),
    r2: (raw.r2_buckets ?? []).map((b) => b.bucket_name),
    queues: [...queues],
  };
}

export function missing(desired: string[], existing: string[]): string[] {
  return desired.filter((name) => !existing.includes(name));
}
