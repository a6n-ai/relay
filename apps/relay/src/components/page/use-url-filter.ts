import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { withParam } from "./search-param";
import { untyped } from "../lib/route-search";

// The URL is the source of truth: follow it (sidebar, Back), push typed text to it `delay` ms after typing stops.
export function useUrlFilter(key: string, { resetCursor = false, delay = 300 } = {}): [string, (value: string) => void] {
  const navigate = useNavigate();
  const raw = (useSearch({ strict: false }) as Record<string, unknown>)[key];
  const current = typeof raw === "string" ? raw : "";
  const [value, setValue] = useState(current);
  const pushed = useRef(current);

  useEffect(() => {
    if (current === pushed.current) return;
    pushed.current = current;
    setValue(current);
  }, [current]);

  useEffect(() => {
    const next = value.trim();
    if (next === pushed.current) return;
    const t = setTimeout(() => {
      pushed.current = next;
      void navigate({ to: ".", search: untyped((prev: Record<string, unknown>) => withParam(prev, key, next, resetCursor)), replace: true });
    }, delay);
    return () => clearTimeout(t);
  }, [value, key, resetCursor, delay, navigate]);

  return [value, setValue];
}
