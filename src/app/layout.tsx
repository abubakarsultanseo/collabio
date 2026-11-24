import type { Metadata } from "next";
import { type ReactNode } from "react";
import { ToastProvider } from "@/components/app/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collabio",
  description: "Partner outreach workspace",
};

const themeBootstrap = `
  (function () {
    var preference;
    try { preference = localStorage.getItem("collabio-theme"); } catch {}
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme =
      preference === "light" || preference === "dark" ? preference : systemDark ? "dark" : "light";
  })();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
