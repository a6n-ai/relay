import { Button } from "@foundry/ui/button";
import { letterSrcDoc } from "./letter-frame";

// No allow-scripts and no allow-same-origin: the letter gets an opaque origin and runs nothing.
export function LetterView({
  htmlSafe,
  text,
  blockedRemote,
  images,
  onShowImages,
}: {
  htmlSafe: string | null;
  text: string | null;
  blockedRemote: number;
  images: boolean;
  onShowImages: () => void;
}) {
  return (
    <div className="grid gap-2">
      {htmlSafe === null ? (
        <pre className="rounded-lg border border-border p-4 text-sm break-words whitespace-pre-wrap">{text ?? "Content no longer available"}</pre>
      ) : (
        <div className="h-[32rem] resize-y overflow-hidden rounded-lg border border-border">
          <iframe
            title="Message content"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            srcDoc={letterSrcDoc(htmlSafe, !images)}
            className="block size-full border-0"
          />
        </div>
      )}
      {blockedRemote > 0 ? (
        <Button variant="outline" size="sm" className="w-fit" onClick={onShowImages}>
          Show images ({blockedRemote} blocked)
        </Button>
      ) : null}
    </div>
  );
}
