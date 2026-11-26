import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@foundry/ui/card";
import { type FormEvent, type ReactNode, type RefObject, useId } from "react";
import { UnsavedGuard } from "../unsaved-guard";

// Vercel's card: title row with a hairline under it, the body, then a muted footer strip.
export function SettingsCard({
  title,
  description,
  footer,
  disabledReason,
  action,
  children,
}: {
  title: string;
  description?: string;
  footer?: ReactNode; // muted hint, left of the footer strip
  disabledReason?: string; // follows the hint while the action is disabled
  action?: ReactNode; // the footer button, right
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader divided={Boolean(children)}>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      {footer || disabledReason || action ? (
        <CardFooter className="flex-wrap justify-between gap-3">
          <div className="min-w-0 text-sm text-muted-foreground">{footer}{footer && disabledReason ? " " : null}{disabledReason}</div>
          {action ? <div className="ml-auto">{action}</div> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

// A settings card with its own Save: the form, the hint, the button label, the reason it is blocked and the unsaved prompt.
// `invalidReason` is why a changed form cannot be saved yet; `bypass` lets a deliberate navigation skip the prompt.
export function SettingsForm({
  title,
  description,
  hint,
  dirty,
  pending,
  saveLabel,
  canWrite = true,
  invalidReason,
  onSubmit,
  bypass,
  extraActions,
  children,
}: {
  title: string;
  description?: string;
  hint?: string;
  dirty: boolean;
  pending: boolean;
  saveLabel: string;
  canWrite?: boolean;
  invalidReason?: string;
  onSubmit: (event: FormEvent) => void;
  bypass?: RefObject<boolean>;
  extraActions?: ReactNode;
  children: ReactNode;
}) {
  const formId = useId();
  const blocked = Boolean(invalidReason) && !pending;
  return (
    <SettingsCard
      title={title}
      description={description}
      footer={dirty ? "Unsaved changes" : hint}
      disabledReason={canWrite && blocked ? invalidReason : undefined}
      action={
        canWrite || extraActions ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {extraActions}
            {canWrite ? (
              <Button type="submit" form={formId} variant="outline" disabled={pending || !dirty || Boolean(invalidReason)}>
                {pending ? "Saving…" : saveLabel}
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <form id={formId} onSubmit={onSubmit} className="grid gap-3">
        <UnsavedGuard when={dirty} bypass={bypass} />
        {children}
      </form>
    </SettingsCard>
  );
}
