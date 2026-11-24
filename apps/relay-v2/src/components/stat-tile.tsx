import { Card, CardContent } from "@foundry/ui/card";

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="grid gap-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-medium tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
