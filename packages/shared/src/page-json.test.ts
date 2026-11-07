// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pageToJson } from "./page-json";

const page = `
<nav><a href="/">Home</a></nav>
<table class="layout"><tr><td>
  <h2>Personal Health</h2>
  <p>Allergies: Seasonal, treated with antihistamines</p>
  <p>Surgeries: None</p>
  <table><tr><th>Condition</th><th>Age</th><th>Treatment</th></tr>
    <tr><td>Asthma</td><td>12</td><td>Inhaler<br>(resolved)</td></tr>
    <tr><td></td><td></td><td></td></tr></table>
  <h2>Family History</h2>
  <table><tr><td>Mother</td><td>Hypertension, age 50</td></tr><tr><td>Father</td><td><ul><li>Diabetes</li></ul></td></tr></table>
  <dl><dt>Notes</dt><dd>Reviewed by staff</dd></dl>
  <p>The donor reports no other conditions.</p>
  <div class="row"><span class="k">Reviewed:</span> <span>2024-03-01</span></div>
  <div><div>Signed by donor</div></div>
  <div class="dtable"><div class="tr thead"><div class="td">Disease</div><div class="td">Age Diagnosed</div><div class="td">Treatment</div></div>
    <div class="tr tbody"><div class="td">Other</div><div class="td">&nbsp;</div><div class="td">Knee replacement</div></div>
    <div class="tr tbody"><div class="td">Asthma</div><div class="td">12</div><div class="td">Inhaler</div></div></div>
  <div class="dtable"><div class="tr tbody"><div class="td c-text">Healthy</div></div></div>
</td></tr></table>
<script>track()</script><form><select><option>x</option></select><button>Print</button></form>`;

describe("pageToJson", () => {
  it("outlines a page in order with sections, data tables, fields and text", () => {
    document.body.innerHTML = page;
    expect(pageToJson(document)).toEqual([
      { kind: "heading", level: 2, text: "Personal Health", section: "Personal Health" },
      { kind: "fields", section: "Personal Health", items: [{ label: "Allergies", value: "Seasonal, treated with antihistamines" }, { label: "Surgeries", value: "None" }] },
      { kind: "table", section: "Personal Health", headers: ["Condition", "Age", "Treatment"], rows: [["Asthma", "12", "Inhaler (resolved)"]] },
      { kind: "heading", level: 2, text: "Family History", section: "Family History" },
      { kind: "table", section: "Family History", headers: [], rows: [["Mother", "Hypertension, age 50"], ["Father", "Diabetes"]] },
      { kind: "fields", section: "Family History", items: [{ label: "Notes", value: "Reviewed by staff" }] },
      { kind: "text", section: "Family History", text: "The donor reports no other conditions." },
      { kind: "fields", section: "Family History", items: [{ label: "Reviewed", value: "2024-03-01" }] },
      { kind: "text", section: "Family History", text: "Signed by donor" },
      { kind: "table", section: "Family History", headers: ["Disease", "Age Diagnosed", "Treatment"], rows: [["Other", "", "Knee replacement"], ["Asthma", "12", "Inhaler"]] },
      { kind: "table", section: "Family History", headers: [], rows: [["Healthy"]] },
    ]);
  });

  it("returns an empty outline for an empty page", () => {
    document.body.innerHTML = "<script>x()</script>";
    expect(pageToJson(document)).toEqual([]);
  });
});
