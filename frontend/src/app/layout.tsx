import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { ScreenBadge } from "@/components/ScreenBadge";
import { THEME_BOOT_SCRIPT, ThemeProvider } from "@/components/ThemeProvider";

// Manrope, served from our own build — no request leaves the school's network.
// The variable file carries 200–800, which is the whole range the UI uses.
const manrope = localFont({
  src: "./fonts/Manrope.ttf",
  weight: "200 800",
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "School Management System",
  description: "AI-powered school management — parent and teacher portals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <head>
        {/* Apply saved theme BEFORE first paint to avoid a flash of the wrong color */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-surface font-sans text-ink antialiased">
        <ThemeProvider>
          {children}
          {/* Every route has a mock number, including the login screens,
              so this sits above the whole app rather than inside the
              portal shell. */}
          <ScreenBadge />
        </ThemeProvider>
      </body>
    </html>
  );
}
