import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { Field } from "./field";

// An empty pick says so and links to where one is made: "No lists yet. Create a list".
// onNavigate is for the dialog that holds the pick, so it closes when the link is followed.
export function EmptyChoice({
  id,
  label,
  message,
  to,
  search,
  linkLabel,
  onNavigate,
}: {
  id: string;
  label: string;
  message: string;
  to: ComponentProps<typeof Link>["to"];
  search?: Record<string, string | number | boolean>;
  linkLabel: string;
  onNavigate?: () => void;
}) {
  return (
    <Field id={id} label={label} htmlFor={`${id}-link`}>
      <p className="text-sm text-muted-foreground">
        {message}{" "}
        <Link id={`${id}-link`} to={to} search={search as never} onClick={onNavigate} className="text-info underline underline-offset-4">
          {linkLabel}
        </Link>
      </p>
    </Field>
  );
}
