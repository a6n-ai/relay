import { sesEventSettings } from "@relay/email";
import { EmailEventsSettings, type StreamState } from "@relay/engine/ui/email-events-settings";
import { parseEmailStreams } from "@/lib/email/streams";
import { saveStreamRouting } from "./actions";

export async function EmailEventsSection() {
  const configured = parseEmailStreams();
  const streams: StreamState[] = await Promise.all(
    configured.map(async (stream) => {
      try {
        const ses = sesEventSettings();
        const [routing, volume] = await Promise.all([
          ses.getRouting(stream),
          ses.eventVolume(stream, 30).catch(() => ({})),
        ]);
        return { stream, routing, volume };
      } catch (e) {
        return {
          stream,
          routing: { webhook: [], counts: null },
          volume: {},
          error: e instanceof Error ? e.message : "Could not read this stream's event destinations",
        };
      }
    }),
  );
  return <EmailEventsSettings streams={streams} onSaveStream={saveStreamRouting} />;
}
