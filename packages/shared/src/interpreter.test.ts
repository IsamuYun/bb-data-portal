// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findByLabel, query, renderTemplate, runSegment, splitOnNavigate, type ExecEnv } from "./interpreter";
import type { RecipeStep } from "./recipe";

const html = `
<main>
  <h1>Donor 21383 · Creative Go-Getter</h1>
  <dl><dt>Height</dt><dd>6'1" (185cm)</dd><dt>Eye color</dt><dd> Brown </dd></dl>
  <table><tr><th>Blood type</th><td>O+</td></tr><tr><td>CMV</td><td>Negative</td></tr></table>
  <div class="row"><span class="k">Ancestry</span><span class="v">American Indian, Irish</span></div>
  <p class="line">Religion: Catholic</p>
  <div class="inline"><strong>Education level</strong> Bachelor's</div>
  <section id="about"><p>Line one.</p><p>Line two.</p></section>
  <img class="photo" src="https://cdn.example.com/p/1.jpg"><img class="photo" src="https://cdn.example.com/p/2.jpg">
  <a id="login" href="/login">Login</a>
  <button id="tab">Medical</button>
</main>`;

function env(doc = document): ExecEnv {
  let t = 0;
  return {
    document: doc,
    location: { href: "https://www.example.com/donor/21383" },
    scrollTo: () => {},
    scrollHeight: () => 1000,
    sleep: async (ms) => { t += ms; },
    now: () => t,
  };
}

describe("query", () => {
  it("supports :contains()", () => {
    document.body.innerHTML = html;
    expect(query(document, "h1:contains('go-getter')")).toHaveLength(1);
    expect(query(document, ".row:contains('Ancestry') .v")[0].textContent).toBe("American Indian, Irish");
    expect(query(document, "p:contains('nope')")).toHaveLength(0);
  });
});

describe("findByLabel", () => {
  it("handles dt/dd, th/td, td/td, span pairs, inline 'Label: value' and strong+text", () => {
    document.body.innerHTML = html;
    const txt = (v: Element | string | null) => (typeof v === "string" ? v : v?.textContent?.trim());
    expect(txt(findByLabel(document, "Height"))).toBe(`6'1" (185cm)`);
    expect(txt(findByLabel(document, "eye color"))).toBe("Brown");
    expect(txt(findByLabel(document, "Blood type"))).toBe("O+");
    expect(txt(findByLabel(document, "CMV"))).toBe("Negative");
    expect(txt(findByLabel(document, "Ancestry"))).toBe("American Indian, Irish");
    expect(txt(findByLabel(document, "Religion"))).toBe("Catholic");
    expect(txt(findByLabel(document, "Education level"))).toBe("Bachelor's");
    expect(findByLabel(document, "Shoe size")).toBeNull();
  });
});

describe("runSegment", () => {
  it("extracts fields with selector/label/regex/split/all and collects media", async () => {
    document.body.innerHTML = html;
    const steps: RecipeStep[] = [
      { op: "waitFor", selector: "h1", timeoutMs: 1000 },
      { op: "click", selector: "#tab", optional: true },
      { op: "click", selector: "#missing", optional: true },
      { op: "scroll", to: "bottom", times: 2, delayMs: 10 },
      {
        op: "extract",
        fields: {
          donorNumber: { selector: "h1", regex: "(\\d{4,6})", trim: true },
          title: { selector: "h1", regex: "·\\s*(.+)$", trim: true },
          height: { label: "Height", trim: true },
          ancestry: { label: "Ancestry", split: ",", trim: true },
          about: { selector: "#about p", all: true, trim: true },
          photos: { selector: "img.photo", attr: "src", all: true, trim: true },
          photosDedup: { selector: "img.photo, img.photo", attr: "src", all: true, unique: true, trim: true },
          missing: { label: "Shoe size", default: "n/a", trim: true },
        },
      },
      { op: "downloadMedia", from: "photos", as: "photo" },
      { op: "emit" },
    ];
    const e = env();
    e.fetchMedia = async (url) => ({ base64: "AAAA", mime: url.endsWith("1.jpg") ? "image/jpeg" : "image/png" });
    const r = await runSegment(steps, { job: { url: "", externalId: null, seed: null }, data: {} }, e);
    expect(r.status).toBe("ok");
    expect(r.emitted).toBe(true);
    expect(r.data).toMatchObject({
      donorNumber: "21383",
      title: "Creative Go-Getter",
      height: `6'1" (185cm)`,
      ancestry: ["American Indian", "Irish"],
      about: ["Line one.", "Line two."],
      photos: ["https://cdn.example.com/p/1.jpg", "https://cdn.example.com/p/2.jpg"],
      photosDedup: ["https://cdn.example.com/p/1.jpg", "https://cdn.example.com/p/2.jpg"],
      missing: "n/a",
    });
    expect(r.media).toHaveLength(2);
    expect(r.media[0]).toMatchObject({ field: "photos", kind: "photo", position: 0, base64: "AAAA", mime: "image/jpeg" });
    expect(r.logs.some((l) => l.msg.includes("跳过"))).toBe(true);
  });

  it("fails on waitFor timeout and on required click", async () => {
    document.body.innerHTML = html;
    const r = await runSegment([{ op: "waitFor", selector: "#never", timeoutMs: 500 }], { job: { url: "", externalId: null, seed: null }, data: {} }, env());
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/waitFor/);
    const r2 = await runSegment([{ op: "click", selector: "#never" }], { job: { url: "", externalId: null, seed: null }, data: {} }, env());
    expect(r2.status).toBe("failed");
    const r3 = await runSegment([{ op: "waitFor", selector: "#never", timeoutMs: 500, optional: true }, { op: "emit" }], { job: { url: "", externalId: null, seed: null }, data: {} }, env());
    expect(r3.status).toBe("ok");
    expect(r3.logs[0].level).toBe("warn");
  });

  it("fetchJson picks a value from a page API, downloadMedia queues it and drops the short-lived URL", async () => {
    const asked: string[] = [];
    const e = env();
    e.fetchJson = async (url) => {
      asked.push(url);
      return { ok: true, data: { "0": { fileName: "019161GT.pdf", signedUrl: "https://cdn.example.com/019161GT.pdf?Signature=x" } } };
    };
    const steps: RecipeStep[] = [
      { op: "fetchJson", url: "/api/signedUrl?resourceNo={{data.donorNumber|pad:6}}-GT", pick: "data.0.signedUrl", into: "gtsReport" },
      { op: "downloadMedia", from: "gtsReport", as: "doc", drop: true },
    ];
    const r = await runSegment(steps, { job: { url: "", externalId: null, seed: null }, data: { donorNumber: "19161" } }, e);
    expect(r.status).toBe("ok");
    expect(asked).toEqual(["https://www.example.com/api/signedUrl?resourceNo=019161-GT"]);
    expect(r.media).toEqual([{ field: "gtsReport", kind: "doc", url: "https://cdn.example.com/019161GT.pdf?Signature=x", position: 0 }]);
    expect(r.data).not.toHaveProperty("gtsReport");
  });

  it("optional fetchJson only warns when the endpoint refuses", async () => {
    const e = env();
    e.fetchJson = async () => {
      throw new Error("HTTP 403");
    };
    const step: RecipeStep = { op: "fetchJson", url: "/api/x", pick: "data.0.signedUrl", into: "gtsReport", optional: true };
    const r = await runSegment([step], { job: { url: "", externalId: null, seed: null }, data: {} }, e);
    expect(r.status).toBe("ok");
    expect(r.logs[0]).toMatchObject({ level: "warn" });
    const r2 = await runSegment([{ ...step, optional: false }], { job: { url: "", externalId: null, seed: null }, data: {} }, e);
    expect(r2.status).toBe("failed");
  });

  it("returns auth_required when the URL matches assertNotMatch", async () => {
    const e = env();
    e.location.href = "https://www.example.com/login?next=/donor/1";
    const r = await runSegment([{ op: "assertNotMatch", urlPattern: "/login", reason: "auth_required" }], { job: { url: "", externalId: null, seed: null }, data: {} }, e);
    expect(r.status).toBe("auth_required");
  });
});

describe("helpers", () => {
  it("splitOnNavigate groups steps by page", () => {
    const segs = splitOnNavigate([
      { op: "navigate", url: "{{job.url}}" },
      { op: "waitFor", selector: "h1" },
      { op: "navigate", url: "{{job.url}}/photos" },
      { op: "extract", fields: {} },
      { op: "emit" },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0].url).toBe("{{job.url}}");
    expect(segs[0].steps).toHaveLength(1);
    expect(segs[1].steps).toHaveLength(2);
  });
  it("renderTemplate resolves job and seed paths", () => {
    const ctx = { job: { url: "https://x/1", externalId: "1", seed: { a: "b" } }, data: { t: "T" } };
    expect(renderTemplate("{{job.url}}/photos?id={{ job.externalId }}&a={{job.seed.a}}&t={{data.t}}&n={{nope}}", ctx)).toBe("https://x/1/photos?id=1&a=b&t=T&n=");
    expect(renderTemplate("{{job.externalId|pad:6}}-GT {{nope|pad:3}}", ctx)).toBe("000001-GT ");
  });
});
