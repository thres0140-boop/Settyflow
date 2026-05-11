# Settyflow — context for Claude

## What this is
Unified Instagram DM inbox for an appointment setter (Cenk) managing 6+ coach accounts. Stack: Next.js 16 App Router, Prisma + SQLite (dev) / Postgres (prod via Vercel + Neon), Unipile for IG, Capacitor 7 + TestFlight for iOS.

## Domain model
- `Account` = one connected IG coach account (1 row per coach)
- `Thread` = one DM conversation (account × chatId is unique)
- `Message` = individual DM, direction "in"|"out"

## Key flows
1. **Connect IG account**: `/accounts` → POST `/api/unipile/auth-link` → user visits Unipile hosted page → Unipile redirects to `/api/unipile/callback` with `account_id` → upserted into `Account`.
2. **Inbound DMs**: Unipile POSTs to `/api/unipile/webhook` → ingest into Thread/Message tables → polled by clients.
3. **Send DM**: client POSTs `/api/send` `{threadId, text}` → looks up thread's account → calls Unipile `sendChatMessage` → stores local Message + updates Thread preview.
4. **Backfill**: `/api/unipile/sync` POST `{accountId}` calls Unipile `listChats` + `getChatMessages` per chat.

## Conventions
- Always return 200 from `/api/unipile/webhook` even on error — Unipile retries aggressively otherwise.
- Unipile payloads vary across event types; webhook handler tries multiple field aliases.
- Server components for auth-protected pages; client components for interactivity.
- Owner auth is single-user env-based (`OWNER_EMAIL` + `OWNER_PASSWORD`). Multi-setter is post-v1.

## Don't
- Don't store Unipile API keys in source control or share with the user inline.
- Don't switch DB providers in schema.prisma without also updating env vars and re-running migrations.
- Don't break the webhook contract — it must accept all `message.*` event variants.
