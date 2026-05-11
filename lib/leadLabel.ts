// Primary identifier we display for a lead. We prefer the @handle because
// Instagram display names are unreliable — leads sometimes set their display
// name to a tagline, the name of another coach, or random emoji, which
// confuses the inbox UI. The @handle is unique and stable.
export function leadLabel(t: { leadName: string; leadHandle: string | null }) {
  return t.leadHandle ? `@${t.leadHandle}` : t.leadName;
}

// First letter shown in the round avatar fallback when there's no profile pic.
export function leadInitial(t: { leadName: string; leadHandle: string | null }) {
  return (t.leadHandle ?? t.leadName ?? "?").charAt(0).toUpperCase();
}
