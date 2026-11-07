import type { PageBlock } from "@bb/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, db, eq, media, platforms, records } from "@bb/db";
import { loadTranslations } from "@/lib/translate/records";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/format";
import { cellText } from "../cell";
import { DOC_FIELDS } from "@/lib/media/store";
import { MediaManager, type MediaField, type MediaGroup } from "./media-manager";
import { ReparseMedicalButton } from "./reparse-button";
import { needsManualCarriers } from "@/lib/profile/model";

/** Display names for report fields of other platforms (not upload targets): Fairfax Genetic Testing. */
const EXTRA_DOC_LABELS: Record<string, string> = { geneticReport: "基因检测报告", medicalPage: "病史档案网页", photoSetPdf: "照片集 PDF" };

export const dynamic = "force-dynamic";

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const [r] = await d
    .select({ record: records, platform: platforms })
    .from(records)
    .innerJoin(platforms, eq(platforms.id, records.platformId))
    .where(eq(records.id, id))
    .limit(1);
  if (!r) notFound();
  const [ms, tr] = await Promise.all([d.select().from(media).where(eq(media.recordId, id)).orderBy(asc(media.position)), loadTranslations([id])]);
  const zh = tr.get(id);
  const schema = r.platform.fieldSchema;
  const known = new Set(schema.map((f) => f.key));
  const extra = Object.keys(r.record.data).filter((k) => !known.has(k));
  // One section per photo field (童年照片 / 成年照片 ...) or report, each laid out as a 3-column grid.
  const labelOf = (key: string) => schema.find((f) => f.key === key)?.label ?? DOC_FIELDS[key] ?? EXTRA_DOC_LABELS[key] ?? key;
  const groups: MediaGroup[] = [];
  for (const m of ms) {
    const key = m.fieldKey ?? m.kind;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label: labelOf(key), doc: key in DOC_FIELDS || m.kind === "doc", items: [] }));
    g.items.push({ id: m.id, kind: m.kind, mime: m.mime, v: m.sha256.slice(0, 12) });
  }
  // Fields a file can be uploaded to: the schema's photo fields, plus the report PDFs for cryobank.
  const uploadFields: MediaField[] = [
    ...schema.filter((f) => f.type === "url").map((f) => ({ key: f.key, label: f.label, doc: false })),
    ...(r.platform.slug === "cryobank" ? Object.entries(DOC_FIELDS).map(([key, label]) => ({ key, label, doc: true })) : []),
  ];

  return (
    <PageShell
      title={`#${r.record.seq} · ${r.platform.name} ${r.record.externalId}`}
      description={`来源：${r.platform.name}（来源 ID ${r.record.externalId}）· v${r.record.version} · 采集于 ${fmtDate(r.record.capturedAt)}`}
      actions={
        <>
          <Button variant={needsManualCarriers(r.record.data, r.record.manual) ? "destructive" : "outline"} render={<Link href={`/records/${r.record.id}/edit`} />}>
            {needsManualCarriers(r.record.data, r.record.manual) ? "编辑（基因筛查待人工整理）" : r.record.manual.carriers ? "编辑（已人工整理）" : "编辑"}
          </Button>
          <Button render={<a href={`/api/records/${r.record.id}/profile?format=pdf`} />}>导出资料 PDF</Button>
          <Button variant="outline" render={<a href={`/api/records/${r.record.id}/profile?format=html`} />}>
            导出资料 HTML
          </Button>
          {ms.some((m) => (r.platform.slug === "cryobank" ? ["medicalReport", "profileReport"] : r.platform.slug === "fairfax" ? ["geneticReport", "photoSetPdf"] : []).includes(m.fieldKey ?? "") ||
            (r.platform.slug === "fairfax" && m.fieldKey === "adulthoodPhotos" && m.mime === "application/pdf")) ? <ReparseMedicalButton id={r.record.id} /> : null}
          <Button variant="outline" render={<a href={r.record.sourceUrl} target="_blank" rel="noreferrer" />}>
            打开来源页
          </Button>
          <Button variant="outline" render={<Link href={`/records?platformId=${r.platform.id}`} />}>
            返回列表
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>字段</CardTitle>
            <CardDescription>按字段模板顺序（照片字段见右侧），显示中文译文{zh?.pending ? "（部分字段待翻译，暂显示原文）" : zh ? "" : "（尚未翻译，显示原文）"}；原文见下方“原始 JSON”</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              {schema.filter((f) => f.type !== "url").map((f) => (
                f.type === "json" ? (
                  <JsonRow key={f.key} label={f.label} value={r.record.data[f.key]} />
                ) : (
                  <FieldRow key={f.key} label={f.label} value={zh?.data[f.key] ?? r.record.data[f.key]} long={f.type === "text"} />
                )
              ))}
              {extra.map((k) => (
                <FieldRow key={k} label={k} value={r.record.data[k]} />
              ))}
            </dl>
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>媒体（{ms.length}）</CardTitle>
              <CardDescription>可手动添加、替换或删除照片和 PDF 报告；替换报告后会自动重新解析</CardDescription>
            </CardHeader>
            <CardContent>
              <MediaManager recordId={r.record.id} groups={groups} fields={uploadFields} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>原始 JSON</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(r.record.data, null, 2)}</pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function FieldRow({ label, value, long }: { label: string; value: unknown; long?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={long ? "whitespace-pre-wrap" : "break-words"}>{cellText(value)}</dd>
    </>
  );
}

/** Labels for keys of structured values (GTS carrier rows); unknown keys show as-is. */
const JSON_KEY_LABELS: Record<string, string> = {
  gene: "基因",
  disease: "疾病",
  result: "结果",
  variant: "变异",
  zygosity: "合子型",
  inheritance: "遗传方式",
  reproductiveRisk: "生育风险",
  label: "项目",
  relation: "亲属",
  text: "说明",
  diagnosis: "诊断",
  details: "详情",
  surgery: "手术",
  procedures: "手术详情",
  anesthesia: "全身麻醉",
  anesthesiaComplications: "麻醉并发症",
  allergies: "过敏",
  allergyDetails: "过敏详情",
  foodIntolerance: "食物不耐受",
  foodDetails: "不耐受详情",
};

/** A `json` field: an array of objects becomes a table spanning both columns; anything else falls back to text. */
const BLOCK_KINDS = new Set(["heading", "table", "fields", "text"]);
const isOutline = (v: unknown): v is PageBlock[] =>
  Array.isArray(v) && v.length > 0 && v.every((b) => b && typeof b === "object" && BLOCK_KINDS.has((b as { kind?: string }).kind ?? ""));

/** Raw page capture (`pageToJson`): rendered like the page, heading by heading. */
function OutlineRow({ label, blocks }: { label: string; blocks: PageBlock[] }) {
  return (
    <>
      <dt className="text-muted-foreground sm:col-span-2">
        {label}（{blocks.length} 块）
      </dt>
      <dd className="grid gap-2 text-xs sm:col-span-2">
        {blocks.map((b, i) =>
          b.kind === "heading" ? (
            <p key={i} className="pt-1 text-sm font-medium">{b.text}</p>
          ) : b.kind === "text" ? (
            <p key={i} className="whitespace-pre-wrap">{b.text}</p>
          ) : b.kind === "fields" ? (
            <table key={i} className="w-full">
              <tbody>
                {b.items.map((it, j) => (
                  <tr key={j} className="border-b last:border-0 align-top">
                    <th className="w-40 px-2 py-1 text-left font-medium text-muted-foreground">{it.label}</th>
                    <td className="px-2 py-1">{it.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div key={i} className="overflow-x-auto">
              {b.caption ? <p className="text-muted-foreground">{b.caption}</p> : null}
              <table className="w-full">
                {b.headers.length ? (
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      {b.headers.map((h, j) => <th key={j} className="px-2 py-1 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {b.rows.map((row, j) => (
                    <tr key={j} className="border-b last:border-0 align-top">
                      {row.map((c, k) => <td key={k} className="px-2 py-1">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        )}
      </dd>
    </>
  );
}

function JsonRow({ label, value }: { label: string; value: unknown }) {
  if (isOutline(value)) return <OutlineRow label={label} blocks={value} />;
  // A single object (e.g. healthRecord): one row per key.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null && v !== "");
    return (
      <>
        <dt className="text-muted-foreground sm:col-span-2">{label}</dt>
        <dd className="sm:col-span-2">
          <table className="w-full text-xs">
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k} className="border-b last:border-0 align-top">
                  <th className="w-32 px-2 py-1 text-left font-medium text-muted-foreground">{JSON_KEY_LABELS[k] ?? k}</th>
                  <td className="px-2 py-1">{cellText(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </dd>
      </>
    );
  }
  const rows = Array.isArray(value) && value.every((x) => x && typeof x === "object" && !Array.isArray(x)) ? (value as Record<string, unknown>[]) : null;
  if (!rows) return <FieldRow label={label} value={Array.isArray(value) && value.length === 0 ? "无" : value} />;
  if (rows.length === 0) return <FieldRow label={label} value="无" />;
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return (
    <>
      <dt className="text-muted-foreground sm:col-span-2">
        {label}（{rows.length}）
      </dt>
      <dd className="overflow-x-auto sm:col-span-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {keys.map((k) => (
                <th key={k} className="px-2 py-1 font-medium">
                  {JSON_KEY_LABELS[k] ?? k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0 align-top">
                {keys.map((k) => (
                  <td key={k} className={k === "gene" ? "px-2 py-1 font-mono font-medium" : "px-2 py-1"}>
                    {cellText(r[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </dd>
    </>
  );
}
