import { getDocumentProxy } from "unpdf";
import type { PdfTextItem } from "./geneaware";

/** Positioned text items per page (PDF user space: x from the left, y from the bottom). */
export async function pdfTextItems(bytes: Uint8Array): Promise<PdfTextItem[][]> {
  // pdf.js takes ownership of (detaches) the buffer it is given; hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const pages: PdfTextItem[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const tc = await page.getTextContent();
      pages.push(
        tc.items.flatMap((it) => ("str" in it ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number }] : [])),
      );
    }
    return pages;
  } finally {
    // Free pdf.js resources; method availability differs between pdf.js builds.
    await (pdf as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> }).destroy?.().catch(() => {});
  }
}
