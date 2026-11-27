import { localStore } from "@foundry/ui/safe-storage";

export type View = "list" | "grid";
const key = (route: string) => `relay-view:${route}`;

export const viewPref = {
  read(route: string): View {
    return localStore.get(key(route)) === "grid" ? "grid" : "list";
  },
  write(route: string, v: View) {
    localStore.set(key(route), v);
  },
};
