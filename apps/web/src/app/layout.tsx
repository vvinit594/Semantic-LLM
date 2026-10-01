import type { Metadata } from "next";
import { PROJECT_NAME } from "@semantic-llm/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: "Semantic caching middleware for LLM applications.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
