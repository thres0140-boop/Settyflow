export const STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  new: { label: "New", color: "#6366f1" },         // indigo
  qualified: { label: "Link Sent", color: "#f59e0b" }, // amber (key kept as "qualified" for DB compatibility)
  call_booked: { label: "Call Booked", color: "#10b981" }, // green
  follow_up: { label: "Follow Up", color: "#8b5cf6" }, // violet
  closed: { label: "Closed", color: "#ef4444" },   // red
};

export const STATUS_ORDER: Array<keyof typeof STATUS_META> = [
  "new",
  "qualified",
  "call_booked",
  "follow_up",
  "closed",
];

export function statusColor(status: string): string {
  return STATUS_META[status]?.color ?? STATUS_META.new.color;
}

export function statusLabel(status: string): string {
  return STATUS_META[status]?.label ?? status;
}
