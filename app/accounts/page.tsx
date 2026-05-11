import { Suspense } from "react";
import AccountsClient from "./AccountsClient";

// Wrapping the client component in <Suspense> is required because the inner
// component uses useSearchParams() — Next.js opts the page out of static
// prerendering only via this boundary.
export default function AccountsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-6 text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <AccountsClient />
    </Suspense>
  );
}
