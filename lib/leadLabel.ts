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

// Real Instagram handles are 1-30 chars of alphanumeric / underscore / period.
// We use this to detect when the `handle` column has been polluted with what
// is actually a display name (happens when the import route picks up a.name
// as a fallback).
function looksLikeHandle(s: string): boolean {
  return /^[A-Za-z0-9._]{1,30}$/.test(s);
}

// Primary identifier for a coach account. Prefer the @handle if it actually
// looks like an Instagram handle; otherwise trim the displayName; otherwise
// the literal "account". The looksLikeHandle check is what saves us when
// the DB has e.g. handle = "Rowan van den Hurk | Online Transformatie Coach".
export function accountLabel(a: {
  handle: string | null;
  displayName: string | null;
}): string {
  if (a.handle && looksLikeHandle(a.handle)) return `@${a.handle}`;
  // Either no handle, or "handle" is really a display name in disguise.
  const dn = a.displayName ?? a.handle;
  if (dn) return shortName(dn);
  return "account";
}
