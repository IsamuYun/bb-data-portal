import type { Recipe } from "@bb/shared";

const TOP = ["platform", "version", "match", "settings", "steps"];
const STEP = ["op", "url", "selector", "label", "urlPattern", "reason", "to", "times", "delayMs", "ms", "timeoutMs", "optional", "from", "as", "drop", "pick", "into", "fields"];
const RULE = ["selector", "label", "attr", "all", "regex", "split", "trim", "default"];

function ordered(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

/** jsonb drops key order; re-order for a readable editor default. */
export function recipeToPrettyJson(r: Recipe): string {
  const steps = r.steps.map((s) => {
    const o = ordered(s as Record<string, unknown>, STEP);
    if (s.op === "extract") {
      o.fields = Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, ordered(v as Record<string, unknown>, RULE)]));
    }
    return o;
  });
  return JSON.stringify(ordered({ ...r, steps }, TOP), null, 2);
}
