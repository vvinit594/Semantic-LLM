import type { Metadata } from "next";
import Script from "next/script";
import { publicApiUrl } from "@/api-url";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "SemanticCache",
  description: "Semantic LLM Caching Infrastructure",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Script id="semanticcache-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("semanticcache-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.dataset.theme="dark";}}catch(e){}`}
        </Script>
        <AppShell apiUrl={publicApiUrl()}>{children}</AppShell>
      </body>
    </html>
  );
}
