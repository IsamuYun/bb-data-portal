import { extractText, getDocumentProxy } from "unpdf";

/**
 * cryobank "Medical Profile" (CCB-FORM-0543, served as `<6-digit donor no>MH.pdf`): consultation date, year of birth,
 * self-reported ancestry, surgeries, allergies, food intolerances, a three-generation family history table and the
 * genetic specialist's risk assessment. This module reads the header dates from the plain text;
 * parse.ts reads the answers and the family table, profile/zh.ts words them in Chinese.
 */

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).join("\n");
}

/** Consultation date (MM/DD/YYYY → YYYY-MM-DD) and the donor's year of birth from the header table. */
export function parseMedicalHeader(text: string): { birthYear: string | null; medicalConsultDate: string | null } {
  const m = text.match(/CONSULTATION DATE[\s\S]{0,80}?YEAR OF BIRTH\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{4})/i);
  if (!m) {
    const y = text.match(/YEAR OF BIRTH\s+(?:\S+\s+)?((?:19|20)\d{2})\b/i);
    return { birthYear: y?.[1] ?? null, medicalConsultDate: null };
  }
  const [, mm, dd, yyyy, yob] = m;
  return { birthYear: yob, medicalConsultDate: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` };
}
