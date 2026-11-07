import { describe, expect, it } from "vitest";
import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { gtsFieldsFromPdf } from "./apply";
import { findGeneAwarePanel, parseGeneAware, type PdfTextItem } from "./geneaware";

/** Rows of [x, text] at a given y — mirrors the item positions pdf.js reports for the Baylor report. */
type Spec = [y: number, ...cells: [x: number, text: string][]];
const page = (...lines: Spec[]): PdfTextItem[] => lines.flatMap(([y, ...cells]) => cells.map(([x, str]) => ({ str, x, y })));

const HEADER: Spec[] = [
  [737, [28, "Patient Information"], [407, "Provider"]],
  [723, [28, "Name:"], [137, "Donor 19161"]],
  [618, [28, "Indication:"], [137, "Egg/Sperm Donor"]],
];
const FOOTER: Spec[] = [
  [59, [159, "Sample Type: Date Collected: Date Received: 07/10/2023"]],
  [50, [543, "Page 1/14"]],
  [41, [24, "This test was developed and its performance characteristics determined by Baylor Genetics."]],
];

// Donor 19161 (real layout, page 1): three carriers, then Comments.
const report19161 = [
  page(
    ...HEADER,
    [595, [33, "GeneAware Expanded Plus Panel (445 genes)"], [457, "CARRIER"]],
    [566, [29, "Results Summary"]],
    [541, [36, "Disease / Gene / Risk Details"], [432, "Donor 19161"]],
    [527, [36, "Nonsyndromic hearing loss, GJB2-related"], [432, "CARRIER"]],
    [515, [36, "GJB2"], [56, "- Reproductive Risk: 1 in 170"], [432, "c.109G>A (p.V37I)"]],
    [503, [36, "Inheritance Pattern: Autosomal recessive"], [432, "Heterozygous"]],
    [485, [53, "This individual is a heterozygous carrier for the c.109G>A (p.V37I) variant in GJB2."]],
    [458, [53, "recommended. Genetic counseling is recommended."]],
    [438, [36, "Ethylmalonic encephalopathy"], [432, "CARRIER"]],
    [426, [36, "ETHE1"], [61, "- Reproductive Risk: 1 in 2000"], [432, "c.554T>G (p.L185R)"]],
    [415, [36, "Inheritance Pattern: Autosomal recessive"], [432, "Heterozygous"]],
    [397, [53, "This individual is a heterozygous carrier for the pathogenic c.554T>G (p.L185R) variant."]],
    [358, [36, "Glycine encephalopathy, GLDC-related"], [432, "CARRIER"]],
    [347, [36, "GLDC"], [57, "- Reproductive Risk: 1 in 540"], [432, "c.1194C>G (p.Y398*)"]],
    [335, [36, "Inheritance Pattern: Autosomal recessive"], [432, "Heterozygous"]],
    [317, [53, "This individual is a heterozygous carrier for the likely pathogenic variant."]],
    [266, [29, "Comments"]],
    [250, [31, "No likely pathogenic or pathogenic variants were detected in the remaining genes."]],
    [196, [29, "Additional Results Summary"]],
    ...FOOTER,
  ),
  // The "Additional Results Summary" continues here: NORMAL rows that must not be picked up.
  page(
    [768, [100, "Donor 19161"], [275, "DOB:"]],
    [743, [207, "GeneAware Expanded Plus Panel"]],
    [700, [36, "Disease / Gene / Risk Details"], [432, "Donor 19161"]],
    [686, [36, "FRAGILE XE SYNDROME"], [432, "NORMAL"]],
    [674, [36, "AFF2"], [56, "- Reproductive Risk: NOT at an increased risk for expansion"], [432, "21 CCG"]],
  ),
  // Gene detail pages repeat "CARRIER" — also not part of the summary.
  page(
    [743, [207, "GeneAware Expanded Plus Panel"]],
    [700, [36, "Disease / Gene / Risk Details"], [432, "Donor 19161"]],
    [686, [36, "ETHE1"], [61, "- Ethylmalonic encephalopathy"], [432, "CARRIER"]],
  ),
];

describe("parseGeneAware", () => {
  it("extracts only the CARRIER rows of the Results Summary", () => {
    const r = parseGeneAware(report19161);
    expect(r?.panel).toBe("GeneAware Expanded Plus Panel (445 genes)");
    expect(r?.overall).toBe("CARRIER");
    expect(r?.carriers).toEqual([
      { gene: "GJB2", disease: "Nonsyndromic hearing loss, GJB2-related", result: "CARRIER", variant: "c.109G>A (p.V37I)", zygosity: "Heterozygous", inheritance: "Autosomal recessive", reproductiveRisk: "1 in 170" },
      { gene: "ETHE1", disease: "Ethylmalonic encephalopathy", result: "CARRIER", variant: "c.554T>G (p.L185R)", zygosity: "Heterozygous", inheritance: "Autosomal recessive", reproductiveRisk: "1 in 2000" },
      { gene: "GLDC", disease: "Glycine encephalopathy, GLDC-related", result: "CARRIER", variant: "c.1194C>G (p.Y398*)", zygosity: "Heterozygous", inheritance: "Autosomal recessive", reproductiveRisk: "1 in 540" },
    ]);
  });

  it("keeps SILENT CARRIER, skips POSITIVE rows, joins wrapped variants and follows the table onto the next page", () => {
    const pages = [
      page([500, [23, "RESULTS:"]], [432, [31, "46,XY"]]), // karyotype report first (donor 19414 layout)
      page(
        [595, [33, "GeneAware Expanded Plus Panel (445 genes)"], [457, "CARRIER"]],
        [566, [29, "Results Summary"]],
        [541, [36, "Disease / Gene / Risk Details"], [432, "Donor 19685"]],
        [527, [36, "Alpha-thalassemia"], [432, "SILENT CARRIER"]],
        [515, [36, "HBA1/HBA2"], [62, "- Reproductive Risk: 1 in 100"], [432, "-a/aa"]],
        [503, [36, "Inheritance Pattern: Autosomal recessive"], [432, "Heterozygous"]],
        [460, [36, "Phenylalanine hydroxylase deficiency"], [432, "POSITIVE - SEE INTERPRETATION"]],
        [448, [432, "c.165T>G (p.F55L), c.1139C>T"]],
        [444, [36, "PAH"], [52, "- Reproductive Risk: see interpretation"]],
        [439, [432, "(p.T380M)"]],
        [427, [36, "Inheritance Pattern: Autosomal recessive"], [432, "Heterozygous"]],
        [380, [36, "Pseudocholinesterase deficiency"], [432, "CARRIER"]],
        [368, [36, "BCHE"], [56, "- Reproductive Risk: 1 in 210"], [432, "c.293A>G (p.D98G)"]],
        [359, [432, "(Legacy name; D70G, A variant)"]],
        [347, [36, "Inheritance Pattern: Autosomal recessive"], [432, "Heterozygous"]],
        ...FOOTER,
      ),
      page(
        [768, [100, "Donor 19685"], [275, "DOB:"]],
        [743, [207, "GeneAware Expanded Plus Panel"]],
        [700, [36, "Disease / Gene / Risk Details"], [432, "Donor 19685"]],
        [686, [36, "Biotinidase deficiency"], [432, "CARRIER"]],
        [674, [36, "BTD"], [56, "- Reproductive Risk: 1 in 480"], [432, "c.1330G>C (p.D444H)"]],
        [662, [36, "Inheritance Pattern: Autosomal recessive"], [432, "Heterozygous"]],
        [600, [29, "Comments"]],
      ),
    ];
    const r = parseGeneAware(pages);
    expect(r?.carriers.map((c) => [c.gene, c.result, c.variant])).toEqual([
      ["HBA1/HBA2", "SILENT CARRIER", "-a/aa"],
      ["BCHE", "CARRIER", "c.293A>G (p.D98G); (Legacy name; D70G, A variant)"],
      ["BTD", "CARRIER", "c.1330G>C (p.D444H)"],
    ]);
  });

  it("returns an empty list for a NEGATIVE panel and null for other reports", () => {
    const negative = [
      page(
        [595, [33, "GeneAware Expanded Plus Panel (445 genes)"], [457, "NEGATIVE"]],
        [566, [29, "Results Summary"]],
        [541, [36, "Disease / Gene / Risk Details"], [432, "Donor 21912"]],
        [266, [29, "Comments"]],
      ),
    ];
    expect(parseGeneAware(negative)).toEqual({ panel: "GeneAware Expanded Plus Panel (445 genes)", overall: "NEGATIVE", carriers: [] });

    const comprehensive = [page([743, [207, "GeneAware Comprehensive+ (611)"]], [700, [36, "Disease / Gene / Risk Details"], [432, "Donor 21952"]])];
    expect(parseGeneAware(comprehensive)).toBeNull();
    expect(findGeneAwarePanel(comprehensive)).toBe("GeneAware Comprehensive+ (611)");
  });
});

describe("gtsFieldsFromPdf", () => {
  it("reads a real PDF file end to end", async () => {
    // A4 is 842pt tall; react-pdf positions from the top, pdf.js reports y from the bottom.
    const at = (top: number, left: number, text: string) =>
      React.createElement(Text, { key: `${top}-${left}`, style: { position: "absolute", top, left, fontSize: 8 } }, text);
    const doc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: "A4" },
        at(240, 33, "GeneAware Expanded Plus Panel (445 genes)"),
        at(240, 457, "CARRIER"),
        at(270, 29, "Results Summary"),
        at(295, 36, "Disease / Gene / Risk Details"),
        at(295, 432, "Donor 19348"),
        at(310, 36, "Glutaric acidemia, type I"),
        at(310, 432, "CARRIER"),
        at(322, 36, "GCDH"),
        at(322, 58, "- Reproductive Risk: 1 in 450"),
        at(322, 432, "c.680G>C (p.R227P)"),
        at(334, 36, "Inheritance Pattern: Autosomal recessive"),
        at(334, 432, "Heterozygous"),
        at(352, 53, "This individual is a heterozygous carrier."),
        at(400, 29, "Comments"),
      ),
    );
    const pdf = await renderToBuffer(doc);
    const fields = await gtsFieldsFromPdf(new Uint8Array(pdf));
    expect(fields).toEqual({
      gtsPanel: "GeneAware Expanded Plus Panel (445 genes)",
      gtsCarriers: [{ gene: "GCDH", disease: "Glutaric acidemia, type I", result: "CARRIER", variant: "c.680G>C (p.R227P)", zygosity: "Heterozygous", inheritance: "Autosomal recessive", reproductiveRisk: "1 in 450" }],
      gtsCarrierDiseases: ["Glutaric acidemia, type I"],
    });
  });
});
