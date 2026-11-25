import { InputGroup, InputGroupAddon, InputGroupInput } from "@foundry/ui/input-group";
import { Kbd } from "@foundry/ui/kbd";
import { SearchIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { isTypingTarget } from "./keys";

export function Toolbar({ search, filters, children }: { search?: ReactNode; filters?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      {search ? <div className="min-w-48 max-w-md flex-1">{search}</div> : null}
      {filters}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement as HTMLElement | null)) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <InputGroup>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit?.();
        }}
      />
      <InputGroupAddon align="inline-end">
        <Kbd>/</Kbd>
      </InputGroupAddon>
    </InputGroup>
  );
}
