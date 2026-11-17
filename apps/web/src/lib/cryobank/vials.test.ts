import { describe, expect, it } from "vitest";
import { parseVial, vialStock, withCryobankVials } from "./vials";

// Texts as captured from www.cryobank.com on 2026-11-17 (innerText, whitespace collapsed).
const IUI_5 = "IUI Price $897 per vial Available 5 Quantity Add to cart";
const ICI_LT5 = "ICI Price $1,897 per vial Available <5 Call to purchase 888-498-7132";
const IUI_25 = "IUI Price $1,897 per vial Available 25+ Quantity Add to cart";

describe("parseVial", () => {
  it("reads type, price and available", () => {
    expect(parseVial(IUI_5)).toEqual({ type: "IUI", price: "$897 per vial", available: "5" });
    expect(parseVial(ICI_LT5)).toEqual({ type: "ICI", price: "$1,897 per vial", available: "<5" });
    expect(parseVial(IUI_25)).toEqual({ type: "IUI", price: "$1,897 per vial", available: "25+" });
    expect(parseVial("ICSI\nPrice\n$2,397 per vial\nAvailable\n0")).toEqual({ type: "ICSI", price: "$2,397 per vial", available: "0" });
    expect(parseVial("ICI Price $897 per vial Available Sold out")?.available).toBe("Sold out");
    expect(parseVial("")).toBeNull();
  });
});

describe("vialStock", () => {
  it("in stock when any type has vials", () => {
    expect(vialStock([parseVial("ICI Price $1 Available 0")!, parseVial(IUI_25)!], false)).toBe("in_stock");
  });
  it("sold out when every type is 0, or the panel is missing", () => {
    expect(vialStock([parseVial("ICI Price $1 Available 0")!], false)).toBe("sold_out");
    expect(vialStock([parseVial("ICI Price $1 Available Sold out")!], false)).toBe("sold_out");
    expect(vialStock([], false)).toBe("sold_out");
  });
  it("unknown when a required form hides the panel", () => {
    expect(vialStock([], true)).toBe("unknown");
  });
});

describe("withCryobankVials", () => {
  it("replaces the raw fields", () => {
    const out = withCryobankVials({ donorNumber: "16495", purchaseVialsRaw: [ICI_LT5, IUI_25], purchaseFormRequired: null });
    expect(out).toEqual({
      donorNumber: "16495",
      purchaseVials: [
        { type: "ICI", price: "$1,897 per vial", available: "<5" },
        { type: "IUI", price: "$1,897 per vial", available: "25+" },
      ],
      vialStock: "in_stock",
    });
    expect(withCryobankVials({ purchaseVialsRaw: [], purchaseFormRequired: "Required forms" }).vialStock).toBe("unknown");
  });
  it("leaves other captures alone", () => {
    const d = { donorNumber: "1" };
    expect(withCryobankVials(d)).toBe(d);
  });
});
