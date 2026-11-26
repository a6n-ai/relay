import { Link } from "@tanstack/react-router";

// The Relay mark, linked home. Signed out, "/" is the landing page; signed in, it is Overview.
export function RelayMark() {
  return (
    <Link
      to="/"
      aria-label="Relay home"
      className="flex items-center gap-2 rounded-(--ui-radius-control) text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span aria-hidden="true" className="size-4 rounded-full bg-foreground" />
      Relay
    </Link>
  );
}
