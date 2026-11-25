import type { ComponentProps } from "react";
import { cn } from "@foundry/ui/cn";

export function FormBody({ as: Tag = "form", className, ...props }: ComponentProps<"form"> & { as?: "form" | "div" }) {
  const T = Tag as "form";
  return <T className={cn("grid gap-3", className)} {...props} />;
}

export function FormActions({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex justify-end gap-2", className)} {...props} />;
}

export function FormPanel({ as: Tag = "div", className, ...props }: ComponentProps<"div"> & { as?: "form" | "div" }) {
  const T = Tag as "div";
  return <T className={cn("grid max-w-2xl gap-4 px-4 pb-4", className)} {...props} />;
}
