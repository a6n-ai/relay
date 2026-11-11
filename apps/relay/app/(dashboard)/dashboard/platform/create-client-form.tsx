"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@foundry/ui/form";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { CreateFooter, CreateTitleField, useCreateDialog } from "@/components/ds/create-dialog";
import { isCreateSuccess } from "@/components/ds/create-success";
import { createClientAction } from "./actions";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().min(1, "Short name is required"),
  monthlyMessageQuota: z.number().int().min(0),
  maxApps: z.number().int().min(0),
});

export function CreateClientForm() {
  const { created } = useCreateDialog();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    // TODO(you): pick starter defaults — 0 = unlimited; set e.g. 50_000 / 5 for a capped plan.
    defaultValues: { name: "", slug: "", monthlyMessageQuota: 0, maxApps: 0 },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setError(null);
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("slug", values.slug);
    fd.set("monthlyMessageQuota", String(values.monthlyMessageQuota));
    fd.set("maxApps", String(values.maxApps));
    const result = await createClientAction(fd);
    if (!isCreateSuccess(result) || !result.id) {
      setError(result.error ?? "Could not add the client");
      return;
    }
    created({
      noun: "Client",
      name: values.name,
      href: `/dashboard/platform/${result.id}`,
    });
  }

  return (
    <Form {...form}>
      <form className="flex flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <CreateTitleField label="Name" placeholder="Acme" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Short name</FormLabel>
              <FormControl>
                <Input placeholder="acme" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="monthlyMessageQuota"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Monthly sends (0 = unlimited)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxApps"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Max apps (0 = unlimited)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <CreateFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating…" : "Create client"}
          </Button>
        </CreateFooter>
      </form>
    </Form>
  );
}
