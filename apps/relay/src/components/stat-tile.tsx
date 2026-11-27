import { Card, CardContent } from "@foundry/ui/card";
import { Hint } from "./page/text";

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="grid gap-1">
        <Hint size="xs">{label}</Hint>
        <p className="text-2xl font-medium tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
