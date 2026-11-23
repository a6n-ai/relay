import { sesEventSettings } from "@relay/email";
import { TrackingDomainSettings, type TrackingStreamState } from "@relay/engine/ui/tracking-domain-settings";
import { parseEmailStreams } from "@/lib/email/streams";
import { saveTrackingDomain } from "./actions";

export async function TrackingDomainSection() {
  const streams: TrackingStreamState[] = await Promise.all(
    parseEmailStreams()
      .filter((stream) => stream.kind !== "untracked")
      .map(async (stream) => {
        try {
          const { domain } = await sesEventSettings().getTracking(stream);
          return { stream, domain };
        } catch (e) {
          return {
            stream,
            domain: null,
            error: e instanceof Error ? e.message : "Could not read this stream's tracking domain",
          };
        }
      }),
  );
  return <TrackingDomainSettings streams={streams} region={process.env.AWS_REGION ?? ""} onSave={saveTrackingDomain} />;
}
