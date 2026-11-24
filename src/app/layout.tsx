import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import NavigationProgress from "@/components/app/navigation-progress";
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
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
