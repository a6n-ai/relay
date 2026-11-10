"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { saveSmtpSettingsAction } from "./actions";
import type { ControllerRenderProps } from "react-hook-form";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { SettingsFooter, SettingsRow } from "@/components/ds/settings";

const schema = z.object({
  host: z.string().trim().min(1, "Mail server is required"),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().optional(),
  password: z.string().optional(),
  spfInclude: z.string().optional(),
  fromEmail: z.string().optional(),
  fromName: z.string().optional(),
});

type Field = ControllerRenderProps<z.infer<typeof schema>, keyof z.infer<typeof schema>>;

export function SmtpSettingsForm(props: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  spfInclude: string;
  fromEmail: string;
  fromName: string;
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
      fromEmail: props.fromEmail,
      fromName: props.fromName,
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
    fd.set("fromEmail", values.fromEmail ?? "");
    fd.set("fromName", values.fromName ?? "");
    const result = await saveSmtpSettingsAction(fd);
    if (result.error) setError(result.error);
    else setSaved(true);
  }

  const row = (
    name: keyof z.infer<typeof schema>,
    label: string,
    description: string,
    control: (field: Field) => React.ReactElement,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="gap-0">
          <SettingsRow
            label={<FormLabel>{label}</FormLabel>}
            description={
              <>
                {description}
                <FormMessage />
              </>
            }
          >
            <FormControl>{control(field)}</FormControl>
          </SettingsRow>
        </FormItem>
      )}
    />
  );
  const text = (props: React.ComponentProps<typeof Input>) => (field: Field) => (
    <Input
      className="w-56"
      {...props}
      name={field.name}
      ref={field.ref}
      onBlur={field.onBlur}
      onChange={field.onChange}
      value={String(field.value ?? "")}
    />
  );

  return (
    <Form {...form}>
      <form className="divide-y divide-border" onSubmit={form.handleSubmit(onSubmit)}>
        {row("host", "Mail server", "The address of the server that delivers your mail.", text({ placeholder: "mail.yourapp.com" }))}
        {row("port", "Port", "Usually 587, or 465 for a secure connection.", (field) => (
          <Input
            className="w-28"
            type="number"
            value={field.value as number}
            onChange={(e) => field.onChange(e.target.valueAsNumber)}
          />
        ))}
        {row("secure", "Secure connection", "Turn on if your server uses port 465.", (field) => (
          <input
            type="checkbox"
            className="size-4"
            checked={Boolean(field.value)}
            onChange={(e) => field.onChange(e.target.checked)}
          />
        ))}
        {row("username", "Username", "The login name for the mail server.", text({ placeholder: "Login name" }))}
        {row("password", "Password", props.hasPassword ? "Leave blank to keep the current password." : "The password for the mail server.", text({
          type: "password",
          placeholder: props.hasPassword ? "Unchanged" : "Password",
        }))}
        {row("spfInclude", "Domain include", "From your email provider, so receivers trust your mail.", text({ placeholder: "amazonses.com" }))}
        {row("fromEmail", "Default From email", "Used when an app’s own From isn’t ready.", text({ type: "email", placeholder: "noreply@yourapp.com" }))}
        {row("fromName", "Default From name", "The name people see beside that address.", text({ placeholder: "Relay" }))}
        <SettingsFooter>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {saved ? <p className="text-sm text-muted-foreground">Saved. New messages use these settings.</p> : null}
          <Button type="submit" disabled={form.formState.isSubmitting}>Save sending settings</Button>
        </SettingsFooter>
      </form>
    </Form>
  );
}
