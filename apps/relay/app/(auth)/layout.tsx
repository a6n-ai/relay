import { AuthNav } from "./auth-nav";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-20 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <main id="content" tabIndex={-1} className="bg-muted relative flex min-h-svh flex-col items-center justify-center p-6 outline-none md:p-10">
        <AuthNav />
        <div className="w-full max-w-sm md:max-w-3xl">{children}</div>
      </main>
    </>
  );
}
