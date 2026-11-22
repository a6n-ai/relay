"use client";

import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { VOLUMES } from "@/lib/contact/contact";
import { TURNSTILE_SITE_KEY } from "@/lib/contact/site-key";

declare global {
  interface Window {
    turnstile?: { reset(): void };
  }
}

const FALLBACK_ERROR = "Something went wrong. Try again.";

export function ContactSection() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [volume, setVolume] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState("");
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "sent") successRef.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!volume) {
      setError("Choose a monthly volume.");
      return;
    }
    const form = new FormData(e.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "");
    const email = field("email");
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: field("name"),
          email,
          company: field("company"),
          volume,
          message: field("message"),
          website: field("website"),
          token: field("cf-turnstile-response"),
        }),
      });
      if (res.ok) {
        setSentTo(email);
        setStatus("sent");
        return;
      }
      const body = await res.json().catch((): { title?: string } => ({}));
      setError(res.status === 429 ? "Too many tries. Wait a minute and send again." : (body.title ?? FALLBACK_ERROR));
    } catch {
      setError(FALLBACK_ERROR);
    }
    setStatus("idle");
    window.turnstile?.reset();
  }

  return (
    <section id="contact" data-reveal className="scroll-mt-20 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-5 py-24 md:px-8 md:py-32">
        <h2 className="text-center text-4xl font-semibold tracking-[-0.022em] text-balance md:text-5xl">
          Tell us what you send.
        </h2>
        {status === "sent" ? (
          <div ref={successRef} tabIndex={-1} role="status" className="w-full max-w-xl text-center text-lg outline-none">
            Thanks — we&apos;ll reply to {sentTo} within a business day.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex w-full max-w-xl flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-name">Name</Label>
                <Input id="contact-name" name="name" autoComplete="name" required maxLength={100} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-email">Work email</Label>
                <Input id="contact-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-company">Company</Label>
                <Input id="contact-company" name="company" autoComplete="organization" required maxLength={120} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-volume">Monthly volume</Label>
                <Select value={volume} onValueChange={setVolume}>
                  <SelectTrigger id="contact-volume" className="w-full">
                    <SelectValue placeholder="Choose a range" />
                  </SelectTrigger>
                  <SelectContent>
                    {VOLUMES.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-message">Message</Label>
              <Textarea id="contact-message" name="message" required minLength={10} maxLength={4000} rows={5} />
            </div>
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="sr-only"
            />
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-center">
              <Button type="submit" size="lg" className="marketing-cta-solid" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send message"}
              </Button>
            </div>
          </form>
        )}
        <noscript>
          <p className="text-center text-muted-foreground">Email us at hi@a6n.ai</p>
        </noscript>
      </div>
    </section>
  );
}
