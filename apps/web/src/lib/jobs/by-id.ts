import { externalIdFromUrl } from "../import/parse";

/** One entry of the "按 ID 采集" box: a donor ID, or a pasted profile URL (its ID taken from the URL). */
export type IdEntry = { externalId: string; url?: string };

export const MAX_IDS = 200;

/** Split on whitespace / commas / semicolons (half or full width); de-duplicated by ID, order kept. */
export function parseIdInput(text: string): IdEntry[] {
  const out = new Map<string, IdEntry>();
  for (const tok of text.split(/[\s,，;；、]+/).map((t) => t.trim()).filter(Boolean)) {
    if (/^https?:\/\//i.test(tok)) {
      const id = externalIdFromUrl(tok);
      if (id && !out.has(id)) out.set(id, { externalId: id, url: tok });
    } else {
      const id = tok.replace(/^#/, "");
      if (!out.has(id)) out.set(id, { externalId: id });
    }
  }
  return [...out.values()];
}

/**
 * The profile URL of `id`, by swapping the ID inside a known URL of the same platform
 * (`https://www.cryobank.com/donor/14520` + 14520 → `…/donor/<id>`). The sample's ID must appear in it exactly once
 * as a whole number/token, otherwise null.
 */
export function detailUrlFor(id: string, sample: { url: string; externalId: string }): string | null {
  const re = new RegExp(`(?<![\\w])${sample.externalId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`, "g");
  const hits = sample.url.match(re);
  if (!hits || hits.length !== 1) return null;
  return sample.url.replace(re, encodeURIComponent(id));
}
