import { Toaster } from "@foundry/ui/toast";
import { Outlet } from "@tanstack/react-router";
import { AppShell } from "./app-shell";
import { FindPalette } from "./find-palette";
import { type Shell } from "../../shared/views";

export default function ConsoleLayout({ shell }: { shell: Shell }) {
  return (
    <>
      <AppShell shell={shell} find={<FindPalette shell={shell} />}>
        <Outlet />
      </AppShell>
      <Toaster />
    </>
  );
}
