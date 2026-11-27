import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { cn } from "@foundry/ui/cn";
import type { ComponentProps, ReactNode } from "react";
import { SiteHeader } from "./site-header";

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

export function AuthInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn(authControl, "px-3", className)} {...props} />;
}

export function AuthCard({ title, children, footer }: { title?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
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
