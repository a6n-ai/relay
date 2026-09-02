"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createTenantAction, provisionRealmTenantsAction } from "./actions";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().min(1, "Short name is required"),
  mailingCountry: z.string().trim().min(2).max(8),
  physicalAddress: z.string().optional(),
  monthlyMessageQuota: z.number().int().min(0),
});

export function CreateTenantForm() {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realmKeys, setRealmKeys] = useState<{ slug: string; secret: string }[] | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", slug: "", mailingCountry: "CA", physicalAddress: "", monthlyMessageQuota: 10000 },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setError(null);
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("slug", values.slug);
    fd.set("mailingCountry", values.mailingCountry);
    fd.set("physicalAddress", values.physicalAddress ?? "");
    fd.set("monthlyMessageQuota", String(values.monthlyMessageQuota));
    const result = await createTenantAction(fd);
    if (result.error) setError(result.error);
    setSecret(result.secret ?? null);
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Form {...form}>
        <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl><Input placeholder="Tiffin Grab" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="slug" render={({ field }) => (
            <FormItem>
              <FormLabel>Short name</FormLabel>
              <FormControl><Input placeholder="tiffin-grab" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="mailingCountry" render={({ field }) => (
            <FormItem>
              <FormLabel>Mailing country</FormLabel>
              <FormControl><Input placeholder="CA" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="physicalAddress" render={({ field }) => (
            <FormItem>
              <FormLabel>Physical address</FormLabel>
              <FormControl><Input placeholder="Shown in the footer of marketing email" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="monthlyMessageQuota" render={({ field }) => (
            <FormItem>
              <FormLabel>Messages per month</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <Button type="submit" disabled={form.formState.isSubmitting}>Add app</Button>
        </form>
      </Form>
      <form
        action={async () => {
          setError(null);
          const result = await provisionRealmTenantsAction();
          if (result.error) setError(result.error);
          setRealmKeys(result.created);
        }}
      >
        <Button type="submit" variant="outline">
          Create Tiffin Grab + Puchkaman
        </Button>
        <p className="text-muted-foreground mt-2 text-xs">
          Skips apps that already exist. Copy each key now. We don’t store the full secret.
        </p>
      </form>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {secret ? (
        <p className="text-sm">
          Copy this key now; it is not shown again: <code className="break-all">{secret}</code>
        </p>
      ) : null}
      {realmKeys && realmKeys.length === 0 ? (
        <p className="text-muted-foreground text-sm">Those apps already exist.</p>
      ) : null}
      {realmKeys?.map((k) => (
        <p key={k.slug} className="text-sm">
          {k.slug}: <code className="break-all">{k.secret}</code>
        </p>
      ))}
    </div>
  );
}
