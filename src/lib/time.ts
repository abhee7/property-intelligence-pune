// src/lib/time.ts

/** "5 min ago", "3 h ago", "2 d ago", then a plain date. */
export function timeAgo(iso: string | Date): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  if (mins < 60 * 24 * 30) return `${Math.round(mins / (60 * 24))} d ago`;
  return new Date(then).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
