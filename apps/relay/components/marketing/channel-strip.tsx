import { Badge } from "./stageshow";
import { ChannelGlyph } from "./demo/console-parts";
import { RELAY_CHANNELS } from "@/components/ds/channels";

const LIVE = new Set(["email", "in_app"]);

export function ChannelStrip() {
  return (
    <section data-reveal className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <ul aria-label="Channels" className="flex flex-wrap items-center gap-x-10 gap-y-5 border-y border-border py-6">
        {RELAY_CHANNELS.map((c) => {
          const live = LIVE.has(c.key);
          return (
            <li key={c.key} className="flex items-center gap-3">
              <ChannelGlyph channel={c.key} size={24} />
              <span className="text-sm font-medium">{c.label}</span>
              <Badge tone={live ? "success" : "neutral"} dot>
                {live ? "Live" : "Coming soon"}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
