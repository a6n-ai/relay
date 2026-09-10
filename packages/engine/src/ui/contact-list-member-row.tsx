"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import type { ContactListMemberRow as Member } from "../contact-list-routes";

export interface ConvertResult {
  alreadyExisted: boolean;
}

/**
 * One contact row, optionally with a "convert to customer" action. Whether
 * conversion exists at all is app-specific (only tiffin-grab provisions
 * customer accounts from contact-list rows today), so it's an injected
 * callback rather than something this package does itself.
 */
export function ContactListMemberRow({
  listPublicId,
  member,
  onConvert,
}: {
  listPublicId: string;
  member: Member;
  onConvert?: (input: {
    listPublicId: string;
    memberPublicId: string;
    email?: string;
    phone?: string;
  }) => Promise<ConvertResult>;
}) {
  const missing = !member.email ? "email" : !member.phone ? "phone" : null;
  const [value, setValue] = useState("");
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState(false);

  async function convert() {
    if (!onConvert) return;
    if (missing && !value.trim()) return toast.error(`Enter a ${missing} to create an account`);
    setConverting(true);
    try {
      const res = await onConvert({
        listPublicId,
        memberPublicId: member.publicId,
        email: missing === "email" ? value : undefined,
        phone: missing === "phone" ? value : undefined,
      });
      toast.success(res.alreadyExisted ? "Already a customer" : "Customer account created");
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the account");
    } finally {
      setConverting(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{member.name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{member.email ?? member.phone ?? "no contact info"}</p>
      </div>
      {onConvert && (
        <div className="flex items-center gap-2">
          {missing && !done && (
            <Input
              placeholder={missing === "email" ? "Email" : "Phone"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-8 w-40"
            />
          )}
          <Button size="sm" variant="outline" disabled={converting || done} onClick={convert}>
            {done ? "Converted" : converting ? "Converting…" : "Convert to customer"}
          </Button>
        </div>
      )}
    </li>
  );
}
