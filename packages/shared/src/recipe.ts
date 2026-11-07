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
  /** With `all`: drop duplicate values (carousels often clone slides). */
  unique: z.boolean().optional(),
  /** Regex applied to the raw value; first capture group (or whole match) wins. */
  regex: z.string().optional(),
  /** Split into array by this separator, trimming each part. */
  split: z.string().optional(),
  trim: z.boolean().default(true),
  /** With `all`: join the values into one string (paragraphs of a text block). */
  join: z.string().optional(),
  default: z.unknown().optional(),
});
export type FieldRule = z.infer<typeof fieldRule>;

const step = z.discriminatedUnion("op", [
  z.object({ op: z.literal("navigate"), url: z.string() }),
  z.object({ op: z.literal("waitFor"), selector: z.string(), timeoutMs: z.number().int().positive().optional(), optional: z.boolean().optional() }),
  z.object({ op: z.literal("click"), selector: z.string(), optional: z.boolean().optional() }),
  z.object({ op: z.literal("scroll"), to: z.enum(["bottom", "top"]).default("bottom"), times: z.number().int().positive().default(1), delayMs: z.number().int().nonnegative().default(500) }),
  z.object({ op: z.literal("sleep"), ms: z.number().int().nonnegative() }),
  z.object({ op: z.literal("assertNotMatch"), urlPattern: z.string(), reason: z.string().default("auth_required") }),
  z.object({ op: z.literal("extract"), fields: z.record(z.string(), fieldRule) }),
  /**
   * GET a JSON endpoint from the page (same cookies as the page) and store the value at `pick` (dot path, e.g.
   * "data.0.signedUrl") into `data[into]`. `url` is a template and may be relative to the current page.
   */
  z.object({ op: z.literal("fetchJson"), url: z.string(), pick: z.string().optional(), into: z.string(), optional: z.boolean().optional() }),
  /**
   * GET another page from the current one (same cookies) without leaving it, and run `fields` against the returned
   * document (relative links resolve against that document). With `consent`: when the response contains `when`, its
   * form is submitted (hidden inputs, the checkbox, the submit button) and the result is used instead, but only if
   * `accepted` is true; otherwise the step fails. A non-HTML response (image / PDF) stores its URL at `binaryInto`.
   */
  z.object({
    op: z.literal("fetchDocument"),
    url: z.string(),
    consent: z.object({ when: z.string(), accepted: z.boolean(), text: z.string().optional() }).optional(),
    fields: z.record(z.string(), fieldRule).default({}),
    binaryInto: z.string().optional(),
    /**
     * Also keep the fetched page itself (after the consent form, scripts and frames removed) as an HTML document
     * under this media field, for server-side parsers. The page cannot be re-fetched later without the consent POST.
     */
    snapshot: z.string().optional(),
    /** Store a generic JSON outline of the fetched page (see `pageToJson`) at `data[pageJson]`. */
    pageJson: z.string().optional(),
    optional: z.boolean().optional(),
  }),
  /** `drop`: remove `data[from]` after queuing the download (e.g. short-lived signed URLs that should not be stored). */
  z.object({ op: z.literal("downloadMedia"), from: z.string(), as: z.string().default("photo"), drop: z.boolean().optional() }),
  /**
   * Listing pages: run `fields` (use `all`) on the current page, click `next`, wait until the `changed` element's text
   * differs (AJAX pagers), repeat. Values of every page are concatenated and de-duplicated into `data[key]`.
   * Stops when `next` is missing or matches `disabled`, after `maxPages`, or when the page does not change in time.
   */
  z.object({
    op: z.literal("paginate"),
    fields: z.record(z.string(), fieldRule),
    next: z.string(),
    /** Optional "previous page" link: clicked first until disabled, so collection starts at page 1. */
    prev: z.string().optional(),
    disabled: z.string().optional(),
    changed: z.string().optional(),
    maxPages: z.number().int().positive().default(200),
    timeoutMs: z.number().int().positive().default(15000),
    delayMs: z.number().int().nonnegative().default(800),
  }),
  /**
   * Hand the values of `data[from]` back to the server as new jobs on the same platform and dataset. `url` is a
   * template where `{{item}}` is one value; the value itself becomes the job's externalId.
   */
  z.object({ op: z.literal("enqueue"), from: z.string(), url: z.string().default("{{item}}") }),
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
  /**
   * Optional listing mode: a job whose URL matches `listing.match` (e.g. a search results page) runs these steps
   * instead, normally `paginate` + `enqueue`, and produces new jobs rather than a record.
   */
  listing: z
    .object({
      match: z.string(),
      /**
       * Per page-segment timeout; paging through a long result list takes far longer than one profile. Keep it under
       * the server's 10-minute job lease, or the result arrives after the lease expired and is rejected.
       */
      timeoutMs: z.number().int().positive().max(540000).default(480000),
      steps: z.array(step).min(1),
    })
    .optional(),
});
export type Recipe = z.infer<typeof recipeSchema>;
