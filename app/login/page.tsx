import { Suspense } from "react";
import LoginClient from "./LoginClient";

// Suspense wrapper is required for useSearchParams() at build time.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
