// Force dynamic rendering — the inbox layout uses useSearchParams() (via
// AccountSidebar + ThreadList) which Next.js can't statically prerender
// without an explicit <Suspense> boundary. This route is user-specific
// anyway so there's nothing useful to prerender.
export const dynamic = "force-dynamic";

export default function InboxIndex() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center text-[var(--muted)] text-sm">
      Select a conversation to open it
    </div>
  );
}
