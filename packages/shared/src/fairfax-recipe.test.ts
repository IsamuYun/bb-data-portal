// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://fairfaxcryobank.com/search/donorprofile.aspx?number=4920"}
import { describe, expect, it } from "vitest";
import { fairfaxRecipeV1, hasFairfaxV2, withFairfaxV2 } from "../../db/src/seed-data/fairfax";
import { consentFormBody, runSegment, splitOnNavigate, type ExecEnv, type FetchedDocument } from "./interpreter";
import { recipeSchema, type Recipe, type RecipeStep } from "./recipe";

/** Profile page in the structure the babiology exporter parses (content.js `parseProfile`). */
const profile = `
<div class="wrap">
  <div class="title">Donor Number 4920</div>
  <div class="title-sub">
    <div class="row"><span class="ts-01">Donor Brand:</span><span class="ts-02">Fairfax</span></div>
    <div class="row"><span class="ts-01">Donor Category:</span><span class="ts-02">Non-ID</span></div>
    <div class="row"><span class="ts-01">Availability:</span><span class="ts-02">Active</span></div>
  </div>
  <div class="profile-sp">Expanded Genetic Testing</div>
  <div class="main">
    <table class="height"><tr>
      <td><span class="title-block">Height:</span><span class="info">5' 11"</span></td>
      <td><span class="title-block">Weight:</span><span class="info">170 lbs</span></td>
      <td><span class="title-block">Eye Color:</span><span class="info">Hazel</span></td>
      <td><span class="title-block">Hair:</span><span class="info">Black/ Straight</span></td>
      <td><span class="title-block">Blood Type:</span><span class="info">O+</span></td>
    </tr></table>
    <ul class="list-info">
      <li><span class="width">Ancestry:</span><span class="text">German, Irish</span></li>
      <li><span class="width">Ethnic Background:</span><span class="text">Caucasian</span></li>
      <li><span class="width">Degree:</span><span class="text">BS</span></li>
      <li><span class="width">Astrological Sign:</span><span class="text">Leo</span></li>
      <li><span class="width">Interests:</span><span class="text">Hiking, Chess</span></li>
      <li><span class="width">Personal Goals:</span><span class="text">Career, Travel the World</span></li>
      <li><span class="width">Favorite Subject:</span><span class="text">-</span></li>
      <li><span class="width">Favorite Pet:</span><span class="text">-</span></li>
    </ul>
    <div class="foto"><img src="/search/ChildhoodPhoto.ashx?n=4920"><div class="text"><h3>GET TO KNOW THE DONOR</h3><p>Loves the outdoors.</p><p>Plays viola.</p></div></div>
  </div>
</div>
<ul class="sidebar_01">
  <li><span class="span-02">Summary Profile</span><a class="span-04" href="download.aspx?f=summary">View</a></li>
  <li><span class="span-02">Adult Child Photo Set</span><a class="span-04" href="download.aspx?f=photoset&amp;n=4920">View</a></li>
  <li><span class="span-02">Medical Profile</span><a class="span-04" href="download.aspx?f=medical&amp;n=4920">View</a></li>
  <li><span class="span-02">Genetic Testing</span><a class="span-04" href="handler/donorfile.ashx?pid=9&amp;did=1">View</a></li>
</ul>`;

const consentPage = `<form method="post" action="download.aspx?f=photoset&amp;n=4920">
  <input type="hidden" name="__VIEWSTATE" value="vs1">
  <input type="checkbox" name="ctl00$consent">
  <input type="submit" name="ctl00$btnAgree" value="Continue">
</form>`;
const medicalPage = `<script>track()</script><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-X"></iframe></noscript>
  <h2>Medical Profile</h2><table class="mh"><tr><td>Asthma</td><td>Mother · 早发</td></tr></table><div class="dl"><a href="handler/medical.ashx?id=7">Download</a></div>`;
const photoSetPage = `<img src="https://www.facebook.com/tr?id=1"><img src="/images-new/logo.png"><img src="donorfile.ashx?id=1"><a href="donorfile.ashx?id=2">2</a>`;

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

/** Fake site: the photo set answers with the consent form until it is POSTed. */
function site() {
  const calls: { url: string; body?: string }[] = [];
  let agreed = false;
  const fetchDocument = async (url: string, init?: { method: "POST"; body: string }): Promise<FetchedDocument> => {
    calls.push({ url, body: init?.body });
    if (init?.method === "POST") agreed = true;
    if (url.includes("donorfile.ashx")) return { url, contentType: "application/pdf" };
    const html = url.includes("photoset") ? (agreed ? photoSetPage : consentPage) : url.includes("medical") ? (agreed ? medicalPage : consentPage.replace("photoset", "medical")) : "<p>other</p>";
    return { url, contentType: "text/html", doc: parse(html) };
  };
  return { calls, fetchDocument };
}

function env(fetchDocument?: ExecEnv["fetchDocument"]): ExecEnv {
  let t = 0;
  return {
    document,
    location: { href: "https://fairfaxcryobank.com/search/donorprofile.aspx?number=4920" },
    scrollTo: () => {},
    scrollHeight: () => 1000,
    sleep: async (ms) => { t += ms; },
    now: () => t,
    fetchDocument,
  };
}

const ctx = { job: { url: "https://fairfaxcryobank.com/search/donorprofile.aspx?number=4920", externalId: "4920", seed: null }, data: {} };

function withConsent(r: Recipe, accepted: boolean): RecipeStep[] {
  return splitOnNavigate(r.steps)[0].steps.map((s) => (s.op === "fetchDocument" && s.consent ? { ...s, consent: { ...s.consent, accepted } } : s));
}

describe("fairfax recipe v1", () => {
  it("is a valid recipe that matches profile URLs", () => {
    expect(() => recipeSchema.parse(fairfaxRecipeV1)).not.toThrow();
    expect(new RegExp(fairfaxRecipeV1.match).test(ctx.job.url)).toBe(true);
  });

  it("maps the profile onto the shared keys and never captures the brand", async () => {
    document.body.innerHTML = profile;
    const r = await runSegment(withConsent(fairfaxRecipeV1, false), ctx, env(site().fetchDocument));
    expect(r.status).toBe("ok");
    expect(r.data).toMatchObject({
      donorNumber: "4920",
      badges: ["Non-ID"],
      availability: "Active",
      height: `5' 11"`,
      eyeColor: "Hazel",
      hairColor: "Black",
      hairTexture: "Straight",
      about: "Loves the outdoors.\n\nPlays viola.",
      favoriteSubject: null,
      bloodType: "O+",
      ancestry: ["German", "Irish"],
      ethnicOrigin: "Caucasian",
      educationLevel: "BS",
      astrologicalSign: "Leo",
      interests: ["Hiking", "Chess"],
      personalGoals: ["Career", "Travel the World"],
      geneticTestType: "Expanded Genetic Testing",
    });
    expect(JSON.stringify(r.data)).not.toMatch(/Fairfax/);
    expect(r.data.favoritePet).toBeNull();
    expect(r.media.filter((m) => m.field === "childhoodPhotos")).toHaveLength(1);
  });

  it("skips the photo set while Photo Consent is not accepted", async () => {
    document.body.innerHTML = profile;
    const s = site();
    const r = await runSegment(withConsent(fairfaxRecipeV1, false), ctx, env(s.fetchDocument));
    expect(r.status).toBe("ok");
    expect(s.calls.some((c) => c.body)).toBe(false);
    expect(r.media.filter((m) => m.field === "adulthoodPhotos")).toHaveLength(0);
    expect(r.logs.some((l) => l.level === "warn" && /consent/.test(l.msg))).toBe(true);
  });

  it("submits the consent form once accepted and collects the photo set", async () => {
    document.body.innerHTML = profile;
    const s = site();
    const r = await runSegment(withConsent(fairfaxRecipeV1, true), ctx, env(s.fetchDocument));
    expect(r.status).toBe("ok");
    const post = s.calls.find((c) => c.body);
    expect(post?.url).toBe("https://fairfaxcryobank.com/search/download.aspx?f=photoset&n=4920");
    expect(new URLSearchParams(post!.body)).toEqual(new URLSearchParams("__VIEWSTATE=vs1&ctl00%24consent=on&ctl00%24btnAgree=Continue"));
    expect(r.data.attachmentNames).toEqual(["Summary Profile", "Adult Child Photo Set", "Medical Profile", "Genetic Testing"]);
    const snap = r.media.find((m) => m.field === "medicalPage");
    expect(snap?.mime).toBe("text/html");
    const html = new TextDecoder().decode(Uint8Array.from(atob(snap!.base64!), (c) => c.charCodeAt(0)));
    expect(html).toContain("<td>Mother · 早发</td>");
    expect(html).not.toMatch(/<script|<iframe|googletagmanager/);
    expect(r.data.medicalProfile).toEqual([
      { kind: "heading", level: 2, text: "Medical Profile", section: "Medical Profile" },
      { kind: "table", section: "Medical Profile", headers: [], rows: [["Asthma", "Mother · 早发"]] },
      { kind: "text", section: "Medical Profile", text: "Download" },
    ]);
    expect(html).toContain('<base href="https://fairfaxcryobank.com/search/download.aspx?f=medical&amp;n=4920">');
    expect(r.media.filter((m) => m.kind === "doc" && m.field !== "medicalPage").map((m) => [m.field, m.url])).toEqual([
      ["medicalReport", "https://fairfaxcryobank.com/search/handler/medical.ashx?id=7"],
      ["geneticReport", "https://fairfaxcryobank.com/search/handler/donorfile.ashx?pid=9&did=1"],
    ]);
    expect(r.media.filter((m) => m.field === "adulthoodPhotos").map((m) => m.url)).toEqual([
      "https://fairfaxcryobank.com/search/donorfile.ashx?id=1",
      "https://fairfaxcryobank.com/search/donorfile.ashx?id=2",
    ]);
  });
});

describe("fetchDocument", () => {
  const step = (extra: Partial<Extract<RecipeStep, { op: "fetchDocument" }>> = {}): RecipeStep => ({
    op: "fetchDocument",
    url: "{{data.u}}",
    fields: { imgs: { selector: "img", attr: "src", all: true, trim: true } },
    ...extra,
  });

  it("fails a required step when consent is needed but not accepted", async () => {
    const s = site();
    const r = await runSegment([step({ consent: { when: "input[name$='consent']", accepted: false } })], { ...ctx, data: { u: "download.aspx?f=photoset" } }, env(s.fetchDocument));
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/consent\.accepted/);
  });

  it("stores the URL of a non-HTML response at binaryInto", async () => {
    const fetchDocument = async (url: string): Promise<FetchedDocument> => ({ url, contentType: "application/pdf" });
    const r = await runSegment([step({ binaryInto: "files" })], { ...ctx, data: { u: "https://x.test/a.pdf" } }, env(fetchDocument));
    expect(r.status).toBe("ok");
    expect(r.data.files).toEqual(["https://x.test/a.pdf"]);
  });

  it("skips an optional step whose URL renders empty instead of refetching the page", async () => {
    const s = site();
    const r = await runSegment([step({ optional: true })], ctx, env(s.fetchDocument));
    expect(r.status).toBe("ok");
    expect(s.calls).toHaveLength(0);
  });

  it("builds the form body a browser would send", () => {
    const form = parse(consentPage).querySelector("form")!;
    expect(consentFormBody(form)).toBe("__VIEWSTATE=vs1&ctl00%24consent=on&ctl00%24btnAgree=Continue");
  });
});

/** Search results with the site's AJAX pager: clicking prev/next re-renders the list and the page marker in place. */
function resultsPage(pages: string[][], startAt: number) {
  let cur = startAt;
  const render = () => {
    const donors = pages[cur - 1].map((n) => `<div class="rf01-col"><a href="donorprofile.aspx?number=${n}&amp;src=sr">${n}</a></div>`).join("");
    document.body.innerHTML = `<div id="list">${donors}</div>
      <div class="col-03">
        <a class="link prev${cur === 1 ? " inactive" : ""}" href="#">‹</a><span class="link here">${cur}</span>
        <a class="link next${cur === pages.length ? " inactive" : ""}" href="#">›</a><span class="total">of ${pages.length}</span>
      </div>`;
    document.querySelector(".link.prev")!.addEventListener("click", () => { if (cur > 1) { cur--; render(); } });
    document.querySelector(".link.next")!.addEventListener("click", () => { if (cur < pages.length) { cur++; render(); } });
  };
  render();
}

describe("fairfax extract fixes", () => {
  it("upgrades a v1 recipe in place and keeps admin edits such as the consent switch", () => {
    const old = structuredClone(fairfaxRecipeV1);
    const ex = old.steps.find((s) => s.op === "extract")!;
    if (ex.op === "extract") {
      delete ex.fields.hairTexture;
      delete ex.fields.medicalProfileUrl;
      delete ex.fields.geneticTestingUrl;
      ex.fields.about = { selector: ".foto .text", attr: "innerText", trim: true };
    }
    old.steps = old.steps.filter((s) => !(s.op === "fetchDocument" && /medical|genetic/i.test(s.url)) && !(s.op === "downloadMedia" && s.as === "doc"));
    const fd = old.steps.find((s) => s.op === "fetchDocument");
    if (fd?.op === "fetchDocument" && fd.consent) fd.consent.accepted = true;
    expect(hasFairfaxV2(old)).toBe(false);
    const next = withFairfaxV2(old, 2);
    expect(next.version).toBe(2);
    expect(hasFairfaxV2(next)).toBe(true);
    const fields = next.steps.find((s) => s.op === "extract")!;
    expect(fields.op === "extract" && fields.fields.about).toMatchObject({ selector: ".foto .text p", join: "\n\n" });
    expect(fields.op === "extract" && Object.keys(fields.fields).indexOf("hairTexture") - Object.keys(fields.fields).indexOf("hairColor")).toBe(1);
    expect(next.steps.filter((s) => s.op === "downloadMedia" && s.as === "doc").map((s) => s.op === "downloadMedia" && s.from)).toEqual(["medicalReport", "geneticReport"]);
    expect(next.steps.at(-1)?.op).toBe("emit");
    expect(hasFairfaxV2(withFairfaxV2(next, 3))).toBe(true);
    const consent = next.steps.find((s) => s.op === "fetchDocument");
    expect(consent?.op === "fetchDocument" && consent.consent?.accepted).toBe(true);
    expect(() => recipeSchema.parse(next)).not.toThrow();
  });
});

describe("fairfax listing", () => {
  const listingCtx = { job: { url: "https://fairfaxcryobank.com/search/searchresults.aspx", externalId: null, seed: null }, data: {} };

  it("matches the results page and not profiles", () => {
    const m = new RegExp(fairfaxRecipeV1.listing!.match);
    expect(m.test(listingCtx.job.url)).toBe(true);
    expect(m.test(ctx.job.url)).toBe(false);
  });

  it("rewinds to page 1, pages through every result and enqueues each donor once", async () => {
    resultsPage([["101", "102"], ["103", "102"], ["104"]], 2);
    const steps = splitOnNavigate(fairfaxRecipeV1.listing!.steps)[0].steps;
    const r = await runSegment(steps, listingCtx, env());
    expect(r.status).toBe("ok");
    expect(r.emitted).toBe(true);
    expect(r.data.donorNumbers).toEqual(["101", "102", "103", "104"]);
    expect(r.enqueue).toEqual(["101", "102", "103", "104"].map((n) => ({ externalId: n, url: `https://fairfaxcryobank.com/search/donorprofile.aspx?number=${n}` })));
    // Every enqueued URL is runnable by the profile recipe.
    for (const e of r.enqueue!) expect(new RegExp(fairfaxRecipeV1.match).test(e.url)).toBe(true);
  });

  it("stops with a warning when the pager does not respond", async () => {
    resultsPage([["101"], ["102"]], 1);
    document.querySelector(".link.next")!.replaceWith(Object.assign(document.createElement("a"), { className: "link next" }));
    const steps = splitOnNavigate(fairfaxRecipeV1.listing!.steps)[0].steps;
    const r = await runSegment(steps, listingCtx, env());
    expect(r.status).toBe("ok");
    expect(r.enqueue?.map((e) => e.externalId)).toEqual(["101"]);
    expect(r.logs.some((l) => l.level === "warn" && /翻页无响应/.test(l.msg))).toBe(true);
  });
});
