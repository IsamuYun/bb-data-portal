/**
 * Generic outline of a document page as a JSON array, for pages whose layout is not modelled yet (e.g. the Fairfax
 * Medical Profile). Blocks come in page order and carry the nearest heading as `section`, so a parser written later
 * can pick what it needs from the raw capture without the page being fetched again.
 */
export type PageBlock =
  | { kind: "heading"; level: number; text: string; section: string }
  | { kind: "table"; section: string; caption?: string; headers: string[]; rows: string[][] }
  | { kind: "fields"; section: string; items: { label: string; value: string }[] }
  | { kind: "text"; section: string; text: string };

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const SKIP = "script, style, noscript, template, iframe, nav, header, footer, form select, button, [hidden], [aria-hidden=true]";
const BLOCKS = "h1, h2, h3, h4, h5, h6, table, dl, p, li, blockquote, pre";
/** Plain `<div>`s count as blocks only when they hold no other block (ASP.NET pages put text in bare divs). */
const ALL = `${BLOCKS}, div`;

/** Text of an element, with `<br>` and block children kept apart by a space. */
function textOf(el: Element): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) parts.push(n.textContent ?? "");
    else if (n.nodeType === 1) {
      const e = n as Element;
      if (e.matches(SKIP)) return;
      if (e.tagName === "BR") parts.push(" ");
      e.childNodes.forEach(walk);
      if (/^(P|DIV|LI|TR|TD|TH|DT|DD)$/.test(e.tagName)) parts.push(" ");
    }
  };
  walk(el);
  return norm(parts.join(""));
}

/** A row of a table: `th`/`td` cells of that table only (nested tables are their own blocks). */
const cellsOf = (tr: Element) => Array.from(tr.children).filter((c) => c.tagName === "TD" || c.tagName === "TH");

/**
 * CSS "div tables" (`<div class="dtable"><div class="tr thead"><div class="td">…`, or ARIA rows/cells): kept as tables,
 * empty cells included, so columns stay aligned (Fairfax's Disease / Age Diagnosed / Treatment grid).
 */
const isDivRow = (e: Element) => e.classList.contains("tr") || e.getAttribute("role") === "row";
const isDivCell = (e: Element) => e.classList.contains("td") || e.classList.contains("th") || /^(cell|gridcell|columnheader)$/.test(e.getAttribute("role") ?? "");
const isDivTable = (e: Element) => e.tagName === "DIV" && Array.from(e.children).some((c) => isDivRow(c) && Array.from(c.children).some(isDivCell));
const isDivHead = (row: Element) => row.classList.contains("thead") || row.classList.contains("th") || Array.from(row.children).every((c) => c.getAttribute("role") === "columnheader");

export function pageToJson(root: Document | Element): PageBlock[] {
  const scope = "body" in root && root.body ? root.body : (root as Element);
  const out: PageBlock[] = [];
  let section = "";
  const taken = new Set<Element>();
  for (const el of Array.from(scope.querySelectorAll(ALL))) {
    if (el.closest(SKIP)) continue;
    if (isDivTable(el)) {
      taken.add(el);
      const trs = Array.from(el.children).filter(isDivRow);
      const head = trs.length && isDivHead(trs[0]) ? Array.from(trs[0].children).filter(isDivCell).map(textOf) : [];
      const rows = trs
        .slice(head.length ? 1 : 0)
        .map((tr) => Array.from(tr.children).filter(isDivCell).map(textOf))
        .filter((r) => r.some(Boolean));
      if (rows.length || head.length) out.push({ kind: "table", section, headers: head, rows });
      continue;
    }
    if (el.tagName === "DIV" && el.querySelector(ALL)) continue;
    // Inside a block already emitted (a list item in a table cell, a paragraph in a dl…).
    let p = el.parentElement;
    let inside = false;
    while (p && p !== scope) {
      if (taken.has(p)) { inside = true; break; }
      p = p.parentElement;
    }
    if (inside) continue;
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const text = textOf(el);
      if (!text) continue;
      section = text;
      out.push({ kind: "heading", level: Number(tag[1]), text, section });
    } else if (tag === "TABLE") {
      // Layout tables wrap the content tables: only the innermost ones are data.
      if (el.querySelector("table")) continue;
      taken.add(el);
      const trs = Array.from(el.querySelectorAll("tr")).filter((tr) => tr.closest("table") === el);
      const rows = trs.map((tr) => cellsOf(tr).map(textOf)).filter((r) => r.some(Boolean));
      if (!rows.length) continue;
      const first = trs[0] ? cellsOf(trs[0]) : [];
      const headed = first.length > 0 && first.every((c) => c.tagName === "TH");
      const caption = norm(el.querySelector("caption")?.textContent);
      out.push({ kind: "table", section, ...(caption ? { caption } : {}), headers: headed ? rows[0] : [], rows: headed ? rows.slice(1) : rows });
    } else if (tag === "DL") {
      taken.add(el);
      const items: { label: string; value: string }[] = [];
      for (const c of Array.from(el.children)) {
        if (c.tagName === "DT") items.push({ label: textOf(c), value: "" });
        else if (c.tagName === "DD" && items.length) items[items.length - 1].value = norm(`${items[items.length - 1].value} ${textOf(c)}`);
      }
      if (items.length) out.push({ kind: "fields", section, items });
    } else {
      taken.add(el);
      const text = textOf(el);
      if (!text) continue;
      // "Label: value" lines become fields, merged with the previous fields block of the same section.
      const m = text.match(/^([^:：]{1,80})[:：]\s*(.+)$/);
      const last = out[out.length - 1];
      if (m) {
        const item = { label: norm(m[1]), value: norm(m[2]) };
        if (last?.kind === "fields" && last.section === section) last.items.push(item);
        else out.push({ kind: "fields", section, items: [item] });
      } else out.push({ kind: "text", section, text });
    }
  }
  return out;
}
