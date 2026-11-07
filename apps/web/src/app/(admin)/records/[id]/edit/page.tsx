import Link from "next/link";
import { notFound } from "next/navigation";
import { and, db, desc, eq, inArray, media, platforms, records } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { carrierStatus, needsManualCarriers } from "@/lib/profile/model";
import { loadTranslations } from "@/lib/translate/records";
import { CarrierEditor, type CarrierEditorValue } from "./carrier-editor";

export const dynamic = "force-dynamic";

/** Report PDFs worth opening while curating: cryobank's GTS report, Fairfax's Genetic Testing (sometimes filed as a medical PDF). */
const REPORT_FIELDS = ["gtsReport", "geneticReport", "medicalReport"];
const REPORT_LABELS: Record<string, string> = { gtsReport: "GTS 报告", geneticReport: "基因检测报告", medicalReport: "病史 / 附件 PDF" };

type GeneticTest = { section?: string; test?: string; result?: string; comments?: string };
const s = (v: unknown) => (typeof v === "string" ? v : "");

export default async function RecordEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const [r] = await d
    .select({ record: records, platform: platforms })
    .from(records)
    .innerJoin(platforms, eq(platforms.id, records.platformId))
    .where(eq(records.id, id))
    .limit(1);
  if (!r) notFound();
  const [docs, tr] = await Promise.all([
    d
      .select({ id: media.id, fieldKey: media.fieldKey, sha: media.sha256 })
      .from(media)
      .where(and(eq(media.recordId, id), eq(media.mime, "application/pdf"), inArray(media.fieldKey, REPORT_FIELDS)))
      .orderBy(desc(media.createdAt)),
    loadTranslations([id]),
  ]);
  const data = r.record.data;
  const manual = r.record.manual;
  const zh = tr.get(id)?.data;

  // What the parser found, in the editor's shape: the starting point for corrections.
  const parsed = Array.isArray(data.gtsCarriers) ? (data.gtsCarriers as Record<string, unknown>[]) : null;
  const en = Array.isArray(data.gtsCarrierDiseases) ? (data.gtsCarrierDiseases as unknown[]).map(s) : [];
  const cn = Array.isArray(zh?.gtsCarrierDiseases) && (zh.gtsCarrierDiseases as unknown[]).length === en.length ? (zh.gtsCarrierDiseases as unknown[]).map(s) : [];
  const parsedItems = (parsed ?? []).map((c, i) => {
    const diseaseEn = s(c?.disease) || en[i] || "";
    return { gene: s(c?.gene), disease: cn[i] || diseaseEn, diseaseEn: cn[i] ? diseaseEn : "", status: carrierStatus(`${s(c?.result)} ${s(c?.variant)}`) };
  });
  const autoSummary = parsed ? (parsed.length ? `携带者阳性 ${parsed.length} 项` : "未检出携带者") : (s(data.gtsPanel) || Array.isArray(data.geneticTests)) ? "未能自动提取" : "无报告";
  const initial: CarrierEditorValue = manual.carriers
    ? {
        mode: manual.carriers.kind,
        panel: manual.carriers.panel,
        items: manual.carriers.items.map((it) => ({ gene: it.gene, disease: it.disease, diseaseEn: it.diseaseEn ?? "", status: it.status ?? "" })),
      }
    : { mode: "auto", panel: s(data.gtsPanel), items: parsedItems };
  const needs = needsManualCarriers(data, manual);
  const tests = Array.isArray(data.geneticTests) ? (data.geneticTests as GeneticTest[]) : [];
  const seen = new Set<string>();
  const reportLinks = docs.filter((m) => !seen.has(m.sha) && (seen.add(m.sha), true));

  return (
    <PageShell
      title={`编辑 · ${r.platform.name} ${r.record.externalId}`}
      description="人工整理的内容单独保存，重新采集或重新解析报告都不会覆盖；导出资料 PDF / HTML 时优先使用"
      actions={
        <Button variant="outline" render={<Link href={`/records/${id}`} />}>
          返回记录
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              遗传携带筛查
              {needs ? <Badge variant="destructive">待人工整理</Badge> : manual.carriers ? <Badge variant="secondary">已人工整理</Badge> : <Badge variant="outline">自动解析</Badge>}
            </CardTitle>
            <CardDescription>
              {needs
                ? "报告的结果没能自动提取：请对照右侧原报告填写，保存后导出即为整理后的内容。"
                : "可以修正自动解析的结果（如疾病中文名、携带类型）；选“使用自动解析结果”并保存即撤销人工内容。"}
              {manual.carriers ? ` 上次保存：${new Date(manual.carriers.updatedAt).toLocaleString("zh-CN")}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CarrierEditor recordId={id} initial={initial} autoSummary={autoSummary} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>原报告</CardTitle>
            <CardDescription>{s(data.gtsPanel) || "未识别检测项目"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {reportLinks.length ? (
              <div className="flex flex-wrap gap-2">
                {reportLinks.map((m) => (
                  <Button key={m.id} variant="outline" size="sm" render={<a href={`/api/media/${m.id}?v=${m.sha.slice(0, 12)}`} target="_blank" rel="noreferrer" />}>
                    打开{REPORT_LABELS[m.fieldKey ?? ""] ?? "PDF"}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">没有保存的报告 PDF。</p>
            )}
            {tests.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>检测</TableHead>
                    <TableHead>结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tests.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="align-top text-xs whitespace-normal">
                        {t.section ? <span className="text-muted-foreground">{t.section} · </span> : null}
                        {t.test}
                      </TableCell>
                      <TableCell className="align-top text-xs whitespace-normal">
                        {t.result}
                        {t.comments ? <div className="mt-1 text-muted-foreground">{t.comments}</div> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
