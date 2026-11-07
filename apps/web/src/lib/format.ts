const fmt = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", hour12: false });
export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return fmt.format(typeof d === "string" ? new Date(d) : d);
}
export function first(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Human-readable cell text for a record value (arrays joined, objects as their non-empty values joined by " · ", empty as a dash). */
export function cellText(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.map(cellText).join("、");
  if (typeof v === "object") {
    const parts = Object.values(v as Record<string, unknown>).filter((x) => x != null && x !== "");
    return parts.length ? parts.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" · ") : "—";
  }
  return String(v);
}
