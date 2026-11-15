/** Remote images load only for the one letter named in the ?images= query. */
export function remoteImagesMode(publicId: string, images: string | undefined): "allow" | "block" {
  return publicId === images ? "allow" : "block";
}

export function remoteBlockedFlag(mode: "allow" | "block", blockedRemote: number): boolean {
  return mode === "block" && blockedRemote > 0;
}

// Sent time shows only when it is more than a minute off the stored time, so ordinary letters show no extra line.
export function sentAtLabel(sentMs: number | null, createdAt: string | number | Date): string | null {
  return sentMs != null && Math.abs(sentMs - new Date(createdAt).getTime()) > 60_000
    ? new Date(sentMs).toLocaleString()
    : null;
}
