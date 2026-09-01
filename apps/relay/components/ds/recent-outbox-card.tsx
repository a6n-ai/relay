import { InboxIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foundry/ui/table";
import { OutboxStatusBadge } from "@/components/outbox-status-badge";

type Row = {
  publicId: string;
  status: "pending" | "processing" | "sent" | "failed";
  channel: string;
  kind: string;
  event: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientExternalId: string | null;
};

export function RecentOutboxCard({ rows }: { rows: Row[] }) {
  return (
    <Card className="flex h-full flex-col gap-0">
      <CardHeader className="flex flex-row items-center border-b border-border">
        <div className="flex items-center gap-2">
          <InboxIcon />
          <CardTitle className="text-sm font-medium">Recent outbox</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">No messages in the outbox yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-auto px-4 py-3 text-sm font-normal">Status</TableHead>
                <TableHead className="h-auto px-4 py-3 text-sm font-normal">Channel</TableHead>
                <TableHead className="h-auto px-4 py-3 text-sm font-normal">Kind</TableHead>
                <TableHead className="h-auto px-4 py-3 text-sm font-normal">Event</TableHead>
                <TableHead className="h-auto px-4 py-3 text-sm font-normal">To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.publicId}>
                  <TableCell className="px-4 py-3">
                    <OutboxStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="px-4 py-3 font-mono text-xs">{r.channel}</TableCell>
                  <TableCell className="px-4 py-3">{r.kind}</TableCell>
                  <TableCell className="px-4 py-3">{r.event ?? "—"}</TableCell>
                  <TableCell className="px-4 py-3 font-mono text-xs">
                    {r.recipientEmail ?? r.recipientPhone ?? r.recipientExternalId ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
