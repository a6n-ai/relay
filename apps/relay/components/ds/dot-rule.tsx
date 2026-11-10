/** Space between dashboard rows (was a dotted band in the Lyra style). */
export function DotRule({ height = "h-4" }: { height?: string }) {
  return <div aria-hidden className={height} />;
}
