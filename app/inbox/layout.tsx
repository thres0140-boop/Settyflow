"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import ThreadList from "@/components/ThreadList";
import AccountSidebar from "@/components/AccountSidebar";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onThreadPage = /\/inbox\/\d+/.test(pathname);

  return (
    <div className="h-screen flex">
      {/* Beeper-style leftmost icon column. Desktop only — on mobile the
          space is too precious and the dropdown filter handles it.
          Wrapped in Suspense because it uses useSearchParams(), which
          requires a Suspense boundary for Next.js's static analysis. */}
      <Suspense fallback={<div className="hidden md:block" style={{ width: 64 }} />}>
        <AccountSidebar />
      </Suspense>
      <aside
        className={`${
          onThreadPage ? "hidden md:flex" : "flex"
        } md:w-96 w-full flex-col overflow-hidden bg-[var(--panel)]`}
      >
        <Suspense fallback={null}>
          <ThreadList />
        </Suspense>
      </aside>
      <main
        className={`${
          onThreadPage ? "flex" : "hidden md:flex"
        } flex-1 flex-col min-w-0 bg-[var(--background)]`}
      >
        {children}
      </main>
    </div>
  );
}
