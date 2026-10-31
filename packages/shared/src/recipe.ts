import { z } from "zod";

/**
 * Recipe DSL: a JSON program the Chrome extension interprets inside the target page.
 * Adding a platform = adding a Recipe row; the extension itself never changes.
 */
const fieldRule = z.object({
  /** CSS selector; `:contains('text')` is supported by the interpreter. */
  selector: z.string().optional(),
  /** Find the value next to a label (dt/dd, th/td, "Label: value" rows). */
  label: z.string().optional(),
  /** Attribute to read; defaults to textContent. `innerText`, `innerHTML`, `src`, `href`... */
  attr: z.string().optional(),
  /** Collect every match into an array instead of the first match. */
  all: z.boolean().optional(),
  /** Regex applied to the raw value; first capture group (or whole match) wins. */
  regex: z.string().optional(),
  /** Split into array by this separator, trimming each part. */
  split: z.string().optional(),
  trim: z.boolean().default(true),
  default: z.unknown().optional(),
});
export type FieldRule = z.infer<typeof fieldRule>;

const step = z.discriminatedUnion("op", [
  z.object({ op: z.literal("navigate"), url: z.string() }),
  z.object({ op: z.literal("waitFor"), selector: z.string(), timeoutMs: z.number().int().positive().optional() }),
  z.object({ op: z.literal("click"), selector: z.string(), optional: z.boolean().optional() }),
  z.object({ op: z.literal("scroll"), to: z.enum(["bottom", "top"]).default("bottom"), times: z.number().int().positive().default(1), delayMs: z.number().int().nonnegative().default(500) }),
  z.object({ op: z.literal("sleep"), ms: z.number().int().nonnegative() }),
  z.object({ op: z.literal("assertNotMatch"), urlPattern: z.string(), reason: z.string().default("auth_required") }),
  z.object({ op: z.literal("extract"), fields: z.record(z.string(), fieldRule) }),
  z.object({ op: z.literal("downloadMedia"), from: z.string(), as: z.string().default("photo") }),
  z.object({ op: z.literal("emit") }),
]);
export type RecipeStep = z.infer<typeof step>;

export const recipeSchema = z.object({
  platform: z.string().min(1),
  version: z.number().int().positive(),
  /** Regex; the extension refuses to run a recipe on a URL that does not match. */
  match: z.string(),
  settings: z
    .object({
      delayMs: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).default([3000, 8000]),
      timeoutMs: z.number().int().positive().default(30000),
      maxRetries: z.number().int().nonnegative().default(2),
    })
    .default({ delayMs: [3000, 8000], timeoutMs: 30000, maxRetries: 2 }),
  steps: z.array(step).min(1),
});
export type Recipe = z.infer<typeof recipeSchema>;
