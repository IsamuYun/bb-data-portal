/**
 * Cryobank "Purchase vials" panel → structured rows + overall stock. The recipe captures each `.vial-info` block as
 * text (`purchaseVialsRaw`) and whether a "Required forms" block replaces the panel (`purchaseFormRequired`); this
 * runs on the server when the result arrives. `vialStock` feeds the `records.availability` generated column.
 *
 *   in_stock  at least one vial type with a non-zero "Available" value ("25+", "<5", "5")
 *   sold_out  every listed type shows 0 / sold out, or the page has no panel and no form blocking it
 *   unknown   no panel because a form must be signed first: stock is not visible to this account
 */
export type PurchaseVial = { type: string; price: string | null; available: string | null };
export type VialStock = "in_stock" | "sold_out" | "unknown";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** "ICI Price $1,897 per vial Available <5 Call to purchase 888-…" → { type: "ICI", price: "$1,897 per vial", available: "<5" } */
export function parseVial(text: string): PurchaseVial | null {
  const t = norm(text);
  if (!t) return null;
  const type = norm(t.split(/\bPrice\b|\bAvailable\b/i)[0] ?? "");
  const price = t.match(/\bPrice\s+(.+?)(?=\s+Available\b|$)/i)?.[1] ?? null;
  const raw = t.match(/\bAvailable\s+(sold out|out of stock|[<>]?\s*\d+\+?)/i)?.[1] ?? null;
  const available = raw && /\d/.test(raw) ? raw.replace(/\s+/g, "") : raw;
  return { type: type || "?", price, available };
}

/** A vial count that means nothing can be bought ("0", "Sold out", missing). */
export function isZero(available: string | null): boolean {
  if (available == null) return true;
  const a = available.trim();
  return a === "" || /^0+$/.test(a) || /sold\s*out|out\s*of\s*stock/i.test(a);
}

export function vialStock(vials: PurchaseVial[], formRequired: boolean): VialStock {
  if (vials.some((v) => !isZero(v.available))) return "in_stock";
  if (vials.length > 0) return "sold_out";
  return formRequired ? "unknown" : "sold_out";
}

/** Replace the raw capture fields with `purchaseVials` + `vialStock`; data without them is returned unchanged. */
export function withCryobankVials(data: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(data.purchaseVialsRaw)) return data;
  const { purchaseVialsRaw, purchaseFormRequired, ...rest } = data;
  const vials = (purchaseVialsRaw as unknown[]).map((v) => parseVial(String(v ?? ""))).filter((v): v is PurchaseVial => v !== null);
  const formRequired = typeof purchaseFormRequired === "string" ? purchaseFormRequired.trim() !== "" : Boolean(purchaseFormRequired);
  return { ...rest, purchaseVials: vials, vialStock: vialStock(vials, formRequired) };
}
