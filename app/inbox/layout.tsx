"use client";

import { usePathname } from "next/navigation";
import ThreadList from "@/components/ThreadList";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const onThreadPage = /\/inbox\/\d+/.test(pathname);

  return (
    <div className="h-screen flex">
      <aside
        className={`${
          onThreadPage ? "hidden md:flex" : "flex"
        } md:w-96 w-full flex-col border-r border-[var(--border)] overflow-hidden`}
      >
        <ThreadList />
      </aside>
      <main
        className={`${
          onThreadPage ? "flex" : "hidden md:flex"
        } flex-1 flex-col min-w-0`}
      >
        {children}
      </main>
    </div>
  );
}
