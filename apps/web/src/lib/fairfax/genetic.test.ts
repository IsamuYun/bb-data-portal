import { describe, expect, it } from "vitest";
import type { Box, FormPage, TextItem } from "@/lib/donor-profile/form";
import { fairfaxGeneticFromPages, findingsOf, panelName, summaryRows } from "./genetic";

const t = (y: number, x: number, str: string): TextItem => ({ str, x, y, w: 0, h: 10 });
/** First-column cell rectangle (x 72.5–227.5) spanning y0..y1, as Fairfax's summary page draws it. */
const cell = (y0: number, y1: number): Box => ({ x0: 72.5, y0, x1: 227.5, y1 });

// Newer layout (donor 6537): rows are 11pt apart like the lines inside a cell, so only the cells separate them.
const page: FormPage = {
  items: [
    t(534.5, 72, "Last Updated: 05/07/2025"),
    t(510.5, 387.3, "Jewish Ancestry: No"),
    t(485.9, 77.6, "Genetic Test*"),
    t(485.9, 232.9, "Result"),
    t(485.9, 388, "Comments/"),
    t(473.6, 388, "Donor’s Residual Risk**"),
    t(461.9, 77.6, "Chromosome analysis (karyotype)"),
    t(461.9, 233.2, "Normal male karyotype"),
    t(461.9, 388.6, "No evidence of clinically significant"),
    t(451.0, 388.6, "chromosome abnormalities"),
    t(439.4, 77.6, "Hemoglobin evaluation"),
    t(439.4, 233.2, "Normal hemoglobin fractionation and"),
    t(428.4, 233.2, "MCV/MCH results"),
    t(395.0, 77.6, "Expanded Genetic Disease Carrier"),
    t(384.0, 77.6, "Screening Panel attached- 502 diseases"),
    t(373.1, 77.6, "by gene sequencing."),
    t(351.0, 77.6, "Personalized residual risk by gene is in"),
    t(340.1, 77.6, "the attached report."),
    t(395.0, 233.2, "Negative for genes sequenced."),
    t(318.0, 77.6, "Special Testing"),
    t(305.0, 77.6, "Gene: TYR"),
    t(305.0, 233.2, "Negative by gene sequencing"),
    t(269.5, 72, "*No single test can screen for all genetic disorders."),
    t(49.4, 72, "3015 Williams Drive #110, Fairfax, VA 22031"),
  ],
  paths: [cell(471, 495.4), cell(448.6, 470.5), cell(404, 448.1), cell(335, 403.5), cell(313, 334.5), cell(300, 312.5), cell(448.6, 470.5)],
};

describe("fairfax genetic summary", () => {
  it("splits rows by the drawn cells and moves the residual-risk note to the comments", () => {
    expect(summaryRows(page)).toEqual([
      { section: "", test: "Chromosome analysis (karyotype)", result: "Normal male karyotype", comments: "No evidence of clinically significant chromosome abnormalities" },
      { section: "", test: "Hemoglobin evaluation", result: "Normal hemoglobin fractionation and MCV/MCH results", comments: "" },
      {
        section: "",
        test: "Expanded Genetic Disease Carrier Screening Panel attached- 502 diseases by gene sequencing.",
        result: "Negative for genes sequenced.",
        comments: "Personalized residual risk by gene is in the attached report.",
      },
      { section: "Special Testing", test: "Gene: TYR", result: "Negative by gene sequencing", comments: "" },
    ]);
  });

  it("maps a negative panel to no carriers, and anything else to not extracted", () => {
    const g = fairfaxGeneticFromPages([page]);
    expect(g).toMatchObject({ geneticUpdated: "05/07/2025", jewishAncestry: "No", gtsPanel: "Expanded Genetic Disease Carrier Screening Panel (502 diseases)", gtsCarriers: [], gtsCarrierDiseases: [] });
    const positive = { ...page, items: page.items.map((i) => (i.str === "Negative for genes sequenced." ? { ...i, str: "Positive for one gene." } : i)) };
    expect(fairfaxGeneticFromPages([positive])).toMatchObject({ gtsCarriers: null, gtsCarrierDiseases: null });
    expect(fairfaxGeneticFromPages([{ items: [], paths: [] }])).toMatchObject({ geneticTests: [], gtsPanel: null, gtsCarriers: null });
  });

  it("falls back to vertical gaps when the page draws no cells (older layout)", () => {
    const old: FormPage = {
      paths: [],
      items: [
        t(485.9, 77.6, "Genetic Test*"),
        t(485.9, 232.9, "Result"),
        t(485.9, 388, "Comments/"),
        t(460, 77.6, "Cystic Fibrosis (CF) carrier"),
        t(449, 77.6, "screening"),
        t(460, 233.2, "Negative by gene sequencing in the CFTR gene"),
        t(460, 388.6, "<1/272"),
        t(425, 77.6, "Special Testing"),
        t(400, 77.6, "Gene: TYR"),
        t(400, 233.2, "Negative by gene sequencing"),
      ],
    };
    expect(summaryRows(old)).toEqual([
      { section: "", test: "Cystic Fibrosis (CF) carrier screening", result: "Negative by gene sequencing in the CFTR gene", comments: "<1/272" },
      { section: "Special Testing", test: "Gene: TYR", result: "Negative by gene sequencing", comments: "" },
    ]);
  });

  it("names the panel", () => {
    expect(panelName("Expanded Genetic Carrier Screening: 549 diseases by gene sequencing and del/dup analysis.")).toBe("Expanded Genetic Carrier Screening (549 diseases)");
    expect(panelName("Additional standard testing attached- 22 diseases by gene sequencing")).toBe("Additional standard testing (22 diseases)");
  });
});

describe("fairfax carrier findings", () => {
  it("splits a panel result into findings with gene, kind and variant note", () => {
    expect(
      findingsOf(
        "Carrier: Alpha Thalassemia (HBA1/HBA2) Silent Carrier aa/-a Possible Carrier: Congenital Adrenal Hyperplasia, 21 - Hydroxylase Deficiency (CYP21A2) Carrier: Nonsyndromic Hearing Loss, OTOA - Related Negative for other genes sequenced.",
      ),
    ).toEqual([
      { gene: "HBA1/HBA2", disease: "Alpha Thalassemia", result: "Carrier", variant: "Silent Carrier aa/-a" },
      { gene: "CYP21A2", disease: "Congenital Adrenal Hyperplasia, 21-Hydroxylase Deficiency", result: "Possible Carrier", variant: "" },
      { gene: "OTOA", disease: "Nonsyndromic Hearing Loss, OTOA-Related", result: "Carrier", variant: "" },
    ]);
    expect(findingsOf("Carrier: Prolidase deficiency (PEPD) Increased Carrier Risk: Spinal muscular atrophy (SMN1) Carrier risk is 1/33 Negative for other genes sequenced.")).toEqual([
      { gene: "PEPD", disease: "Prolidase deficiency", result: "Carrier", variant: "" },
      { gene: "SMN1", disease: "Spinal muscular atrophy", result: "Increased Carrier Risk", variant: "Carrier risk is 1/33" },
    ]);
    expect(findingsOf("Negative for genes sequenced.")).toEqual([]);
  });

  it("keeps the panel's finding when the hemoglobin row names the same carrier status", () => {
    const rows = (hb: string, panel: string): FormPage => ({
      paths: [cell(448.6, 470.5), cell(404, 448.1)],
      items: [
        t(485.9, 77.6, "Genetic Test*"),
        t(485.9, 232.9, "Result"),
        t(485.9, 388, "Comments/"),
        t(461.9, 77.6, "Hemoglobin evaluation"),
        t(461.9, 233.2, hb),
        t(430, 77.6, "Expanded Genetic Disease Carrier Screening Panel attached- 514 diseases"),
        t(430, 233.2, panel),
      ],
    });
    const g = fairfaxGeneticFromPages([rows("Low MCH. Carrier: Alpha Thalassemia", "Carrier: Alpha Thalassemia (HBA1/HBA2) Negative for other genes sequenced.")]);
    expect(g.gtsCarriers).toEqual([{ gene: "HBA1/HBA2", disease: "Alpha Thalassemia", result: "Carrier", variant: "" }]);
    expect(g.gtsCarrierDiseases).toEqual(["Alpha Thalassemia"]);
    // An unknown wording is left for manual review.
    expect(fairfaxGeneticFromPages([rows("Normal", "Duplication detected: Alpha Thalassemia (HBA1/HBA2) aaa/aa")]).gtsCarriers).toBeNull();
  });
});
