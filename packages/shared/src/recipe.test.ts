import { describe, expect, it } from "vitest";
import { recipeSchema } from "./recipe";

describe("recipeSchema", () => {
  it("accepts a minimal cryobank-style recipe and fills defaults", () => {
    const r = recipeSchema.parse({
      platform: "cryobank",
      version: 1,
      match: "^https://www\\.cryobank\\.com/donor/(\\d+)",
      steps: [
        { op: "navigate", url: "{{job.url}}" },
        { op: "waitFor", selector: "h1" },
        { op: "extract", fields: { title: { selector: "h1" }, height: { label: "Height" } } },
        { op: "emit" },
      ],
    });
    expect(r.settings.delayMs).toEqual([3000, 8000]);
    expect(r.steps).toHaveLength(4);
  });

  it("rejects unknown ops", () => {
    expect(() =>
      recipeSchema.parse({ platform: "x", version: 1, match: ".*", steps: [{ op: "explode" }] }),
    ).toThrow();
  });
});
