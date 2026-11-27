import { redirect } from "@tanstack/react-router";

export const signInRedirect = (location: { href: string }) => redirect({ to: "/sign-in", search: { redirect: location.href } });
