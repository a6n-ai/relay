"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { saveSmtpSettingsAction } from "./actions";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";

const schema = z.object({
  host: z.string().trim().min(1, "SMTP host is required"),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().optional(),
  password: z.string().optional(),
  spfInclude: z.string().optional(),
});

export function SmtpSettingsForm(props: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  spfInclude: string;
  hasPassword: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      host: props.host,
      port: props.port,
      secure: props.secure,
      username: props.username,
      password: "",
      spfInclude: props.spfInclude,
    },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("host", values.host);
    fd.set("port", String(values.port));
    if (values.secure) fd.set("secure", "true");
    fd.set("username", values.username ?? "");
    fd.set("password", values.password ?? "");
    fd.set("spfInclude", values.spfInclude ?? "");
    const result = await saveSmtpSettingsAction(fd);
    if (result.error) setError(result.error);
    else setSaved(true);
  }

  return (
    <Form {...form}>
      <form className="flex max-w-xl flex-col gap-3" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField control={form.control} name="host" render={({ field }) => (
          <FormItem>
            <FormLabel>Host</FormLabel>
            <FormControl><Input placeholder="smtp.example.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="port" render={({ field }) => (
          <FormItem>
            <FormLabel>Port</FormLabel>
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
        <FormField control={form.control} name="secure" render={({ field }) => (
          <FormItem>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
              />
              Implicit TLS (port 465)
            </label>
          </FormItem>
        )} />
        <FormField control={form.control} name="username" render={({ field }) => (
          <FormItem>
            <FormLabel>Username</FormLabel>
            <FormControl><Input placeholder="SMTP username" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="password" render={({ field }) => (
          <FormItem>
            <FormLabel>Password</FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder={props.hasPassword ? "Unchanged if left blank" : "SMTP password"}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="spfInclude" render={({ field }) => (
          <FormItem>
            <FormLabel>SPF include</FormLabel>
            <FormControl><Input placeholder="amazonses.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={form.formState.isSubmitting}>Save SMTP</Button>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {saved ? <p className="text-sm">Saved. New sends on this process use these settings.</p> : null}
      </form>
    </Form>
  );
}
