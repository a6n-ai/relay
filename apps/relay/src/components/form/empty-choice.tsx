import { Link, type RegisteredRouter, type ValidateLinkOptions } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Field, fieldDescribedBy } from "./field";

// An empty pick says so and links to where one is made: "No lists yet. Create a list".
// onNavigate is for the dialog that holds the pick, so it closes when the link is followed.
type Props = {
  id: string;
  label: string;
  message: string;
  linkLabel: string;
  onNavigate?: () => void;
  error?: string | null;
};

// The overload checks `link` against the route it points at, so search and params follow from `to`.
export function EmptyChoice<TOptions>(props: Props & { link: ValidateLinkOptions<RegisteredRouter, TOptions> }): ReactNode;
export function EmptyChoice({ id, label, message, link, linkLabel, onNavigate, error }: Props & { link: ValidateLinkOptions }) {
  return (
    <Field id={id} label={label} htmlFor={null} error={error}>
      <p role="group" aria-labelledby={`${id}-label`} aria-describedby={fieldDescribedBy(id, undefined, error)} className="text-sm text-muted-foreground">
        {message}{" "}
        <Link {...link} id={`${id}-link`} onClick={onNavigate} className="text-info underline underline-offset-4">
          {linkLabel}
        </Link>
      </p>
    </Field>
  );
}
