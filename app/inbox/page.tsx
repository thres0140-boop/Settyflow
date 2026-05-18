// Force dynamic rendering — the inbox layout uses useSearchParams() (via
// AccountSidebar + ThreadList) which Next.js can't statically prerender
// without an explicit <Suspense> boundary. This route is user-specific
// anyway so there's nothing useful to prerender.
export const dynamic = "force-dynamic";

export default function InboxIndex() {
  // Empty-state lives inside its own black floating panel so the grey
  // frame around it stays visible — keeps the same architecture as when
  // a chat IS selected.
  return (
    <div className="hidden md:flex flex-1 bg-[var(--background)] rounded-lg items-center justify-center text-[var(--muted)] text-sm">
      Select a conversation to open it
    </div>
  );
}
