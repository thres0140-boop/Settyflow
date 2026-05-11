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
    // h-dvh = dynamic viewport height. On iOS, when the keyboard opens,
    // dvh shrinks to the visible area — so the chat layout (header + messages
    // + input) compresses with it instead of being shoved off-screen.
    <div className="h-dvh flex">
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
