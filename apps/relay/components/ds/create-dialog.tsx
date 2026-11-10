"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRightIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@foundry/ui/dialog";
import { createSuccessToast, type CreatedItem } from "./create-success";
import { activeNavItem } from "./nav";

type CreateContextValue = { created: (item: CreatedItem) => void; inDialog: boolean };

const CreateContext = createContext<CreateContextValue | null>(null);

/** The toast after a save: the new item's name, a View link when it has a page, a secret kept until dismissed. */
function useCreatedNotice() {
  const router = useRouter();
  return useCallback(
    (item: CreatedItem) => {
      const plan = createSuccessToast(item);
      const href = plan.viewHref;
      const secret = plan.secret;
      toast.success(plan.title, {
        description: (
          <span className="flex flex-col gap-1">
            <span>{plan.description}</span>
            {secret ? (
              <>
                <code className="break-all text-xs select-all">{secret}</code>
                <button
                  type="button"
                  className="w-fit text-xs underline underline-offset-2"
                  onClick={() => void navigator.clipboard?.writeText(secret)}
                >
                  Copy
                </button>
              </>
            ) : null}
          </span>
        ),
        duration: plan.persistent ? Infinity : 6000,
        closeButton: plan.persistent,
        action: href ? { label: "View", onClick: () => router.push(href) } : undefined,
      });
      router.refresh();
    },
    [router],
  );
}

/**
 * Forms inside a CreateDialog call `created(...)` after a successful save: the dialog closes and the
 * toast shows. Outside a dialog the toast alone shows, so the same form works on a detail page.
 */
export function useCreateDialog(): CreateContextValue {
  const ctx = useContext(CreateContext);
  const notify = useCreatedNotice();
  return useMemo(() => ctx ?? { created: notify, inDialog: false }, [ctx, notify]);
}

/** Linear create: the "New …" button opens a top-anchored dialog over the list; a save closes it and toasts. */
export function CreateDialog({
  label,
  description,
  pill = false,
  children,
}: {
  label: string;
  description?: string;
  /** The rounded lavender button used as an empty state's call to action. */
  pill?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const notify = useCreatedNotice();
  const section = activeNavItem(usePathname())?.label;
  const value = useMemo<CreateContextValue>(
    () => ({
      inDialog: true,
      created: (item) => {
        setOpen(false);
        notify(item);
      },
    }),
    [notify],
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={pill ? "default" : "sm"}>
          <PlusIcon data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] max-h-[calc(100svh-12vh-1.5rem)] translate-y-0 gap-3 overflow-y-auto sm:max-w-[640px]"
      >
        <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-center justify-between bg-popover px-5 pt-4 pb-1">
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
            {section ? (
              <>
                {section}
                <ChevronRightIcon aria-hidden className="size-3" />
              </>
            ) : null}
            <span className="text-foreground">{label}</span>
          </span>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <XIcon />
            </Button>
          </DialogClose>
        </div>
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className={description ? "text-sm" : "sr-only"}>{description ?? label}</DialogDescription>
        <CreateContext.Provider value={value}>{children}</CreateContext.Provider>
      </DialogContent>
    </Dialog>
  );
}

/** Footer of a create form: the primary action sits bottom right, pinned while the form scrolls. */
export function CreateFooter({ children }: { children: ReactNode }) {
  const { inDialog } = useCreateDialog();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2",
        inDialog && "sticky -bottom-5 z-10 -mx-5 -mb-5 border-t border-border bg-popover px-5 py-3",
      )}
    >
      {children}
    </div>
  );
}

/** Borderless 18px title input for the form's name field, like Linear's issue title. */
export function CreateTitleField({ label, className, ...props }: { label: string } & Omit<ComponentProps<"input">, "aria-label">) {
  return (
    <input
      aria-label={label}
      autoComplete="off"
      className={cn(
        "w-full bg-transparent py-1 text-lg font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60",
        className,
      )}
      {...props}
    />
  );
}
