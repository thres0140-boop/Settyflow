// Resolves the app's public base URL across dev, preview, and prod.
// Priority:
//   1. NEXT_PUBLIC_APP_URL (manual override — useful for custom domains)
//   2. VERCEL_PROJECT_PRODUCTION_URL (auto-injected by Vercel for the prod deploy)
//   3. VERCEL_URL (auto-injected for any deployment, including previews)
//   4. http://localhost:3000 (local dev)
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
