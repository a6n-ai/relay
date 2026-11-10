import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider, makeThemeInitScript } from "@foundry/themes";

// Dark is Relay's default look (Linear); people can switch to light.
const themeInitScript = makeThemeInitScript("dark");
import { Toaster } from "@foundry/ui/sonner";
import "./globals.css";

const description = "Send email, texts, WhatsApp, and in-app messages from one place, and watch every delivery.";

export const metadata: Metadata = {
  metadataBase: new URL("https://relay.a6n.ai"),
  title: { default: "Relay", template: "%s · Relay" },
  description,
  openGraph: { type: "website", siteName: "Relay", title: "Relay", description },
  twitter: { card: "summary", title: "Relay", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider defaultTheme="dark">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
