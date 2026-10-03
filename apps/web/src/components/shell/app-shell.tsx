"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChatSessionProvider } from "@/components/chat/chat-session";
import { Navbar } from "./navbar";

export function AppShell({ apiUrl, children }: { apiUrl: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ChatSessionProvider apiUrl={apiUrl}>
      <div className="flex min-h-screen flex-col bg-canvas text-ink">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-40 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-card"
        >
          Skip to content
        </a>
        <Navbar apiUrl={apiUrl} />
        <div key={pathname} id="content" className="page-enter flex flex-1 flex-col">
          {children}
        </div>
      </div>
    </ChatSessionProvider>
  );
}
