import type { Metadata } from "next"; import "./globals.css";
export const metadata: Metadata = { title: "Collabio", description: "Shared SEO outreach partnerships, deals and link requests" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
