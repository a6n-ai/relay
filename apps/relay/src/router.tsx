import { createRouter } from "@tanstack/react-router";
import { AppError } from "./components/page/denied-state";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultErrorComponent: AppError,
    defaultPendingMs: 300,
    defaultPendingMinMs: 400,
  });
}
