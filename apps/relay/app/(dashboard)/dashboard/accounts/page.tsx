import { desc } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foundry/ui/table";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function statusBadge(status: (typeof users.$inferSelect)["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="secondary">Active</Badge>;
    case "inactive":
      return <Badge variant="outline">Inactive</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    case "deleted":
      return <Badge variant="destructive">Deleted</Badge>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export default async function AccountsPage() {
  const session = await getSession();
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={UsersIcon}
        title="Operators"
        subtitle="Relay accounts that can sign in to this console. Sign-up is closed; this list is the operator roster."
      />
      <Card className="gap-0">
        <CardHeader className="border-b border-border">
          <div className="flex items-center gap-2">
            <UsersIcon />
            <CardTitle className="text-sm font-medium">Accounts</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <EmptyState icon={UsersIcon} message="No operators yet." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto px-4 py-3 text-sm font-normal">Email</TableHead>
                  <TableHead className="h-auto px-4 py-3 text-sm font-normal">Name</TableHead>
                  <TableHead className="h-auto px-4 py-3 text-sm font-normal">Role</TableHead>
                  <TableHead className="h-auto px-4 py-3 text-sm font-normal">Status</TableHead>
                  <TableHead className="h-auto px-4 py-3 text-sm font-normal">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.publicId}>
                    <TableCell className="px-4 py-3 font-mono text-xs">
                      {r.email}
                      {r.email === session?.user.email ? (
                        <Badge className="ms-2" variant="outline">
                          You
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-3">{r.name ?? "—"}</TableCell>
                    <TableCell className="px-4 py-3">{r.role}</TableCell>
                    <TableCell className="px-4 py-3">{statusBadge(r.status)}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
