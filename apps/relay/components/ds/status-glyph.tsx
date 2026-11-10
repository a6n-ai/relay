import { cn } from "@foundry/ui/cn";

/** The shapes of Linear's status rings, one per stage of a thing's life. */
export type GlyphKind = "todo" | "scheduled" | "active" | "done" | "paused" | "stopped" | "failed";

export function campaignGlyph(status: string): GlyphKind {
  switch (status) {
    case "scheduled":
      return "scheduled";
    case "sending":
      return "active";
    case "sent":
    case "completed":
      return "done";
    case "paused":
      return "paused";
    case "cancelled":
      return "stopped";
    default:
      return "todo";
  }
}

export function outboxGlyph(status: string): GlyphKind {
  switch (status) {
    case "processing":
      return "active";
    case "sent":
      return "done";
    case "failed":
      return "failed";
    default:
      return "todo";
  }
}

function glyphTone(kind: GlyphKind): string {
  switch (kind) {
    case "active":
    case "done":
    case "scheduled":
      return "text-primary";
    case "failed":
      return "text-destructive";
    case "todo":
    case "paused":
    case "stopped":
      return "text-muted-foreground";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function Inner({ kind }: { kind: GlyphKind }) {
  switch (kind) {
    case "todo":
      return <circle cx="8" cy="8" r="6" strokeDasharray="2.4 2.4" />;
    case "scheduled":
      return (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3l2 1.2" />
        </>
      );
    case "active":
      return (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" stroke="none" />
        </>
      );
    case "done":
      return (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none" />
          <path d="m5.3 8.2 1.8 1.8 3.6-3.8" stroke="var(--background)" />
        </>
      );
    case "paused":
      return (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M6.6 5.8v4.4M9.4 5.8v4.4" />
        </>
      );
    case "stopped":
      return (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="m6 6 4 4M10 6l-4 4" />
        </>
      );
    case "failed":
      return (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none" />
          <path d="m5.9 5.9 4.2 4.2M10.1 5.9l-4.2 4.2" stroke="var(--background)" />
        </>
      );
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** A 16px status ring; `label` is what a screen reader hears. */
export function StatusGlyph({ kind, label, className }: { kind: GlyphKind; label?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("size-4 shrink-0 fill-none stroke-current", glyphTone(kind), className)}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Inner kind={kind} />
    </svg>
  );
}
