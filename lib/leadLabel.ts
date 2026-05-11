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

// Coach IG profiles frequently set their display name to "Real Name | Tagline"
// (e.g. "Rowan van den Hurk | Online Transformatie Coach"). When we have to
// fall back to the display name, trim everything after the first separator
// so labels stay readable in chips, headers, and notifications.
export function shortName(s: string): string {
  return s.split(/[|·•—–-]/)[0]?.trim() || s;
}

// Primary identifier for a coach account. Prefer the @handle; otherwise
// use the trimmed displayName; otherwise the literal "account".
export function accountLabel(a: {
  handle: string | null;
  displayName: string | null;
}): string {
  if (a.handle) return `@${a.handle}`;
  if (a.displayName) return shortName(a.displayName);
  return "account";
}
