/** Space between dashboard rows (flat Linear canvas, no pattern). */
export function DotRule({ height = "h-4" }: { height?: string }) {
  return <div aria-hidden className={height} />;
}
