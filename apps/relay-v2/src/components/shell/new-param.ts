import { useNavigate, useSearch } from "@tanstack/react-router";

export function useNewParam(): [open: boolean, setOpen: (v: boolean) => void] {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { new?: unknown };
  const open = search.new !== undefined && search.new !== false && search.new !== 0 && search.new !== "0";
  const setOpen = (v: boolean) => {
    void navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => {
        const { new: _n, ...rest } = prev;
        return v ? { ...rest, new: 1 } : rest;
      }) as never,
      replace: true,
    });
  };
  return [open, setOpen];
}
