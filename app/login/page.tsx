"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/inbox";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "login_failed");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 space-y-4"
      >
        <div>
          <h1 className="text-2xl font-semibold">Settyflow</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Unified Instagram DM inbox
          </p>
        </div>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 outline-none focus:border-[var(--accent)]"
          />
        </label>

        {error && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
            {error === "invalid_credentials"
              ? "Wrong email or password"
              : error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 rounded-lg py-2 font-medium"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
