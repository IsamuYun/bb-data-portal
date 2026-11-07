import type { ProfileModel } from "./model";

/** Image bytes (JPEG) by media id; missing ids render as empty frames. */
export type ProfileImages = Map<string, Buffer | null>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const img = (images: ProfileImages, id: string, cls: string) => {
  const b = images.get(id);
  return b ? `<img class="${cls}" src="data:image/jpeg;base64,${b.toString("base64")}" alt="">` : `<div class="${cls} ph"></div>`;
};

const CSS = `
:root{--ink:#16352d;--muted:#5f7f74;--line:#d6e0dc;--panel:#f1f5f3;--panel-line:#d3ddd8;--warm:#f4f0e7;--warm-line:#e2dccd;--bar:#123d33;--zebra:#eaf1ee}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#e9ecea;color:var(--ink);font-family:"Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:8.5in;min-height:11in;margin:24px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.12);display:flex;flex-direction:column;position:relative;padding:0 .55in .35in;border-top:10px solid var(--bar)}
.top{display:flex;justify-content:space-between;align-items:baseline;margin-top:.28in}
.brand{font-size:21px;letter-spacing:.2px}
.tag{font-size:10.5px;color:var(--muted);letter-spacing:.4px;margin-right:1.2in}
h1{font-size:28px;font-weight:400;margin:6px 0 12px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}
.photos .p{width:100%;aspect-ratio:290/300;object-fit:cover;display:block}
.few1,.few2{justify-content:center;grid-template-columns:repeat(var(--n),calc((100% - 12px) / 3))}.few1{--n:1}.few2{--n:2}
.kids .row.few1,.kids .row.few2{grid-template-columns:repeat(var(--n),calc((100% - 8px) / 3))}
.ph{background:#eef1ef}
.cap{font-size:9px;color:var(--muted);margin:6px 0 14px}
.mid{display:grid;grid-template-columns:1.55fr 2fr;gap:18px;align-items:start}
.kids{background:var(--panel);border:1px solid var(--panel-line);border-radius:8px;padding:30px 8px 10px;text-align:center}
.kids .row{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.kids .k{width:100%;aspect-ratio:1;object-fit:cover;display:block}
.kids .cap{margin:22px 0 2px;font-size:10px}
.basics{display:grid;grid-template-columns:1fr 1fr;column-gap:24px;row-gap:5px;padding-top:2px}
.basics dt{font-size:9.5px;color:var(--muted)}
.basics dd{font-size:11.5px;margin-bottom:2px}
.sec{display:flex;align-items:baseline;gap:0;margin-top:14px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.sec h2{font-size:18px;font-weight:400;width:2.8in}
.sec small{font-size:9.5px;color:var(--muted);letter-spacing:.3px}
.card{background:var(--panel);border:1px solid var(--panel-line);border-radius:8px;padding:12px 20px;margin-top:12px}
.kv{display:grid;grid-template-columns:1.5in 1fr;row-gap:9px;font-size:12px}
.kv dt{color:var(--muted);font-size:11px}
.para{font-size:12px;line-height:1.85;margin-top:12px;text-align:justify}
.foot{margin-top:auto;padding-top:18px;display:flex;justify-content:space-between;font-size:9.5px;color:var(--muted)}
.carrier{background:var(--warm);border:1px solid var(--warm-line);border-radius:8px;padding:14px 22px 12px;margin-top:12px}
.carrier h3{font-size:18px;font-weight:400;margin-bottom:10px}
.carrier table{width:100%;border-collapse:collapse;font-size:12.5px}
.carrier td{padding:7px 0;vertical-align:top}
.carrier td.g{width:2.1in;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12px}
.carrier .en{color:var(--muted);font-size:10.5px}
.carrier .note{font-size:9.5px;color:var(--ink);margin-top:10px}
.health{display:grid;grid-template-columns:1.4in 1fr;row-gap:10px;font-size:12px;margin-top:12px;padding:0 10px}
.health dt{font-size:12px}
.fam{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}
.fam td{padding:9px 10px;vertical-align:top;line-height:1.6}
.fam td.r{width:1.8in;white-space:nowrap}
.fam tr:nth-child(odd){background:var(--zebra)}
.risk{font-size:11px;line-height:1.7;margin-top:14px}
.src{font-size:9.5px;color:var(--muted);line-height:1.6;margin-top:16px}
.empty{color:var(--muted);font-size:11px;margin-top:12px}
@page{size:letter;margin:0}
.dense .photos .p{height:auto;aspect-ratio:290/250}
.dense .para{font-size:11.2px;line-height:1.6;margin-top:8px}
.dense .card{padding-top:8px;padding-bottom:8px}
.dense .kv{row-gap:5px}
.dense .health{row-gap:6px;margin-top:8px}
.dense .fam{margin-top:8px;font-size:10.5px}
.dense .fam td{padding:5px 10px;line-height:1.45}
.dense .risk{font-size:10.5px;line-height:1.5;margin-top:10px}
.dense .src{margin-top:10px}
.tight .sec{margin-top:10px}
.tight .carrier{padding-top:10px;padding-bottom:10px;margin-top:8px}
.tight .carrier td{padding-top:3px;padding-bottom:3px}
.tight .fam{font-size:10px}
.tight .fam td{padding:3px 10px;line-height:1.35}
@media print{body{background:#fff}.page{margin:0;box-shadow:none;break-after:page;min-height:11in}}
`;

function page1(m: ProfileModel, images: ProfileImages): string {
  // The photos there are, centred at the template's size; three empty frames when there are none.
  const frames = (list: ProfileModel["adultPhotos"], cls: string) =>
    Array.from({ length: list.length ? Math.min(list.length, 3) : 3 }, (_, i) => (list[i] ? img(images, list[i].id, cls) : `<div class="${cls} ph"></div>`)).join("");
  const few = (n: number) => (n > 0 && n < 3 ? ` few${n}` : "");
  const adults = frames(m.adultPhotos, "p");
  const kids = frames(m.childPhotos, "k");
  const basics = m.basics.map((b) => `<div><dt>${esc(b.label)}</dt><dd>${esc(b.value)}</dd></div>`).join("");
  const edu = m.education.length
    ? `<div class="card"><dl class="kv">${m.education.map((e) => `<dt>${esc(e.label)}</dt><dd>${esc(e.value)}</dd>`).join("")}</dl></div>`
    : `<p class="empty">暂无教育与职业信息。</p>`;
  const interests = m.interests.length ? m.interests.map((p) => `<p class="para">${esc(p)}</p>`).join("") : `<p class="empty">暂无。</p>`;
  return `<section class="page${m.dense.page1 ? " dense" : ""}">
  <div class="top"><div class="brand">Babiology Family</div><div class="tag">DONOR PROFILE / ${esc(m.donorNo)}</div></div>
  <h1>Donor ${esc(m.donorNo)}${m.title ? ` / ${esc(m.title)}` : ""}</h1>
  <div class="photos${few(m.adultPhotos.length)}">${adults}</div>
  <div class="cap">成年照片</div>
  <div class="mid">
    <div class="kids"><div class="row${few(m.childPhotos.length)}">${kids}</div><div class="cap">童年照片</div></div>
    <dl class="basics">${basics}</dl>
  </div>
  <div class="sec"><h2>教育与职业</h2><small>EDUCATION &amp; WORK</small></div>
  ${edu}
  <div class="sec"><h2>兴趣与个人亮点</h2><small>INTERESTS &amp; PERSONALITY</small></div>
  ${interests}
  <div class="foot"><span>Babiology Family</span><span>Donor ${esc(m.donorNo)} | 1 / 2</span></div>
</section>`;
}

function page2(m: ProfileModel): string {
  const c = m.carriers;
  const carrier =
    c.kind === "carrier"
      ? `<div class="carrier"><h3>${esc(c.heading)}</h3><table>${c.items
          .map((it) => `<tr><td class="g">${esc(it.gene)}</td><td>${esc(it.disease)}${it.diseaseEn ? ` <span class="en">（${esc(it.diseaseEn)}）</span>` : ""}${it.status ? ` <span class="en">· ${esc(it.status)}</span>` : ""}</td></tr>`)
          .join("")}</table><p class="note">${esc(c.note)}</p></div>`
      : `<div class="carrier"><h3>${esc(c.heading)}</h3><p class="note">${esc(c.note)}</p></div>`;
  const health = m.personalHealth.length
    ? `<dl class="health">${m.personalHealth.map((h) => `<dt>${esc(h.label)}</dt><dd>${esc(h.text)}</dd>`).join("")}</dl>`
    : `<p class="empty">暂无个人健康记录（病史报告尚未采集或解析）。</p>`;
  const family = m.familyHistory.length
    ? `<table class="fam">${m.familyHistory.map((f) => `<tr><td class="r">${esc(f.relation)}</td><td>${esc(f.text)}</td></tr>`).join("")}</table>`
    : `<p class="empty">暂无家族病史摘要。</p>`;
  const risk = m.riskAssessment.length ? `<div class="risk">${m.riskAssessment.map((r) => `<p>原报告评估：${esc(r)}</p>`).join("")}</div>` : "";
  return `<section class="page${m.dense.page2 ? " dense" : ""}${m.dense.page2 > 1 ? " tight" : ""}">
  <div class="top"><div class="brand">Babiology Family</div><div class="tag">DONOR PROFILE / ${esc(m.donorNo)}</div></div>
  <h1>健康与遗传资料</h1>
  <div class="sec" style="margin-top:0"><h2>遗传携带筛查</h2><small>GENETIC CARRIER SCREENING</small></div>
  ${carrier}
  <div class="sec"><h2>个人健康记录</h2><small>PERSONAL HEALTH</small></div>
  ${health}
  <div class="sec"><h2>家族病史摘要</h2><small>FAMILY HISTORY</small></div>
  ${family}
  ${risk}
  <p class="src">${esc(m.sources)}</p>
  <div class="foot"><span>Babiology Family</span><span>Donor ${esc(m.donorNo)} | 2 / 2</span></div>
</section>`;
}

/** Self-contained HTML (images inlined as data URIs, no external requests) that prints as two US-letter pages. */
export function renderProfileHtml(m: ProfileModel, images: ProfileImages): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Babiology Family | Donor ${esc(m.donorNo)}</title>
<style>${CSS}</style></head>
<body>
${page1(m, images)}
${page2(m)}
</body></html>`;
}
