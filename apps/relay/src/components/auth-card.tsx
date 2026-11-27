import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { DOCS_BASE } from "../shared/site";
import { RelayMark } from "./relay-mark";

const authControl = "h-11 w-full text-base";

export function AuthTitle({ className, ...props }: ComponentProps<"h1">) {
  return <h1 className={cn("text-balance text-center text-title-1 font-semibold tracking-tight", className)} {...props} />;
}

export function AuthText({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-center text-base text-muted-foreground", className)} {...props} />;
}

export function AuthButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button size="lg" className={cn(authControl, className)} {...props} />;
}

function AuthInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn(authControl, "px-3", className)} {...props} />;
}

export function AuthForm({ className, ...props }: ComponentProps<"form">) {
  return <form className={cn("flex flex-col gap-3", className)} {...props} />;
}

// The label is for screen readers; the placeholder is the visible hint.
export function AuthField({ label, id, ...props }: ComponentProps<typeof Input> & { label: string; id: string }) {
  return (
    <>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <AuthInput id={id} {...props} />
    </>
  );
}

export const authLink = "text-center text-sm text-muted-foreground hover:text-foreground";

export function AuthLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cn(authLink, className)} {...props} />;
}

function AuthHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-8">
        <RelayMark />
        <nav aria-label="Primary">
          <Button variant="outline" render={<a href={`${DOCS_BASE}/`} />}>
            Docs
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function AuthCard({ title, children, footer }: { title?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AuthHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
        <div className="flex w-full max-w-[360px] flex-col gap-6 text-foreground">
          {title ? <AuthTitle>{title}</AuthTitle> : null}
          {children}
        </div>
        {footer ? <p className="text-center text-sm text-muted-foreground">{footer}</p> : null}
      </main>
    </div>
  );
}
