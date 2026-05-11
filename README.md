# Settyflow

Unified Instagram DM inbox for appointment setters managing multiple coach accounts. Built on Next.js + Prisma + Unipile, with Capacitor for iOS.

## Stack

- Next.js 16 (App Router) + React 19, Tailwind 4
- Prisma + SQLite locally, Postgres on Vercel
- Unipile for IG account connection, webhooks, and send-message
- Capacitor 7 for iOS native shell with push notifications
- TestFlight for distribution

## Setup

```bash
cd /Users/cenk/Settyflow
npm install
cp .env.example .env.local   # then edit values
npx prisma db push           # creates SQLite db at prisma/settyflow.db
npm run dev                  # http://localhost:3000
```

Sign in with the `OWNER_EMAIL` / `OWNER_PASSWORD` you set in `.env.local`.

### Filling in Unipile credentials

Grab from `app.unipile.com` → Settings → Access Tokens:

- `UNIPILE_DSN` — looks like `api41.unipile.com:17121`
- `UNIPILE_API_KEY` — the access token

Or copy them from your ClientFlow `.env.local` since you're on the same Unipile account.

## Connecting an Instagram account

1. Visit `/accounts` → **+ Connect Instagram**
2. You'll be redirected to Unipile's hosted auth flow
3. Log in to the coach's IG account
4. Unipile redirects you back to `/api/unipile/callback` which stores the account
5. Click **Sync now** on the new account to backfill recent threads + messages
6. New DMs flow in via webhook from then on

Repeat per coach account. They appear in the unified inbox with color-coded badges.

## Webhook setup in Unipile

In the Unipile dashboard → Webhooks → **Create a webhook**:

- Event: `On new message`
- All accounts
- URL: `https://<your-domain>/api/unipile/webhook`

(For local dev, expose your laptop with `ngrok http 3000` and use the ngrok URL.)

## Deploying to Vercel

1. Push to GitHub, import in Vercel
2. Add a Neon/Vercel Postgres database; copy the connection strings
3. In `prisma/schema.prisma`, change the `datasource db` block:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("POSTGRES_PRISMA_URL")
     directUrl = env("POSTGRES_URL_NON_POOLING")
   }
   ```
4. Set all `.env.example` variables in Vercel project settings
5. Set `NEXT_PUBLIC_APP_URL` to your deployed URL
6. Update the Unipile webhook URL to point at the deployed domain

## iOS app via Capacitor + TestFlight

```bash
npm run cap:add:ios          # one-time
CAP_SERVER_URL=https://your-deploy.vercel.app npm run cap:sync
npm run cap:open:ios         # opens Xcode
```

In Xcode:

1. Set bundle identifier + team (use your Apple Developer account)
2. Enable **Push Notifications** capability
3. Enable **Background Modes → Remote notifications**
4. Archive → Distribute → App Store Connect → upload
5. In App Store Connect → TestFlight → invite testers (yourself + setters)

Server-side push (sending notifications to devices) needs an APNs key and a device-token registry — that's wired up in `lib/push.ts` (client side) and a `/api/devices` route is the next step (not built yet).

## Project layout

```
app/
  layout.tsx, page.tsx, globals.css
  login/
  inbox/              # unified inbox + thread detail
  accounts/           # manage connected IG accounts
  api/
    auth/             # login, logout, me
    accounts/         # GET list, DELETE
    threads/          # GET list, GET [id], PATCH [id]
    send/             # POST send a message
    unipile/
      auth-link/      # POST → hosted auth URL
      callback/       # GET ← Unipile redirect after auth
      webhook/        # POST ← Unipile pushes message events
      sync/           # POST backfill chats + messages
lib/
  prisma.ts, session.ts, unipile.ts, push.ts, types.ts
components/
  AccountBadge.tsx
prisma/
  schema.prisma
```

## Roadmap

- [x] v0 scaffold — auth, account connect, unified inbox, reply
- [ ] Server-side push: APNs key + `/api/devices` token registry + send-on-webhook
- [ ] Saved replies / templates per coach account
- [ ] Tags + notes per thread (model exists, UI pending)
- [ ] Lead pipeline kanban (`status` field already wired)
- [ ] Multi-setter support (assignments, presence)
- [ ] Realtime via SSE or Pusher (currently polls every 5–15s)

## Notes / gotchas

- The webhook handler always returns 200 so Unipile won't retry-storm on bugs.
- The Unipile webhook payload shape varies — `app/api/unipile/webhook/route.ts` tries multiple field names. Watch the dev console when testing and adjust if needed.
- Messages sent via `/api/send` are stored locally *and* echoed via webhook later — dedup is by `unipileMsgId`.
- Status `unreadCount` increments on inbound message via webhook and clears when a thread is opened.
