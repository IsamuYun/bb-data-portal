import { describe, expect, it } from "vitest";
import { detailUrlFor, parseIdInput } from "./by-id";

describe("parseIdInput", () => {
  it("splits, de-duplicates and reads IDs out of URLs", () => {
    expect(parseIdInput("14520, 16495\n#17531；14520  https://fairfaxcryobank.com/search/donorprofile.aspx?number=7536")).toEqual([
      { externalId: "14520" },
      { externalId: "16495" },
      { externalId: "17531" },
      { externalId: "7536", url: "https://fairfaxcryobank.com/search/donorprofile.aspx?number=7536" },
    ]);
    expect(parseIdInput("  ")).toEqual([]);
  });
});

describe("detailUrlFor", () => {
  it("swaps the ID in a sample URL", () => {
    expect(detailUrlFor("99991", { url: "https://www.cryobank.com/donor/14520", externalId: "14520" })).toBe("https://www.cryobank.com/donor/99991");
    expect(detailUrlFor("12", { url: "https://fairfaxcryobank.com/search/donorprofile.aspx?number=7536", externalId: "7536" })).toBe(
      "https://fairfaxcryobank.com/search/donorprofile.aspx?number=12",
    );
  });
  it("refuses an ambiguous sample", () => {
    expect(detailUrlFor("1", { url: "https://x.test/7/a/7", externalId: "7" })).toBeNull();
    expect(detailUrlFor("1", { url: "https://x.test/a", externalId: "7" })).toBeNull();
  });
});
