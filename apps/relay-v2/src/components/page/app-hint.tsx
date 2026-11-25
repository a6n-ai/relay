import { Hint } from "./text";

export function AppHint({ show, name }: { show: boolean; name: string | undefined }) {
  if (!show || !name) return null;
  return <Hint>Showing {name}. Pick an app above to switch.</Hint>;
}