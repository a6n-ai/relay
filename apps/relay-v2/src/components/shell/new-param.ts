import { useNavigate, useSearch } from "@tanstack/react-router";

export function useNewParam(kind: 1 = 1): [open: boolean, setOpen: (v: boolean) => void] {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { new?: unknown };
  const open = String(search.new) === String(kind);
  const setOpen = (v: boolean) => {
    void navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => {
        const { new: _n, ...rest } = prev;
        return v ? { ...rest, new: kind } : rest;
      }) as never,
      replace: true,
    });
  };
  return [open, setOpen];
}
