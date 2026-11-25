export function AppHint({ show, name }: { show: boolean; name: string | undefined }) {
  if (!show || !name) return null;
  return <p className="text-sm text-muted-foreground">Showing {name}. Pick an app above to switch.</p>;
}
