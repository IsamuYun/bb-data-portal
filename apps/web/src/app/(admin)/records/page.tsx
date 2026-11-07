import Link from "next/link";
import { and, count, db, desc, eq, ilike, media, or, platforms, records, sql, type SQL } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { NativeSelect } from "@/components/common/native-select";
import { Pagination, parsePage } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cellText, first, fmtDate } from "@/lib/format";
import { RecordsTable } from "./records-table";

export const dynamic = "force-dynamic";
const MAX_COLS = 6;
const PAGE_SIZE = 20;

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const d = db();
  const ps = await d.select({ id: platforms.id, name: platforms.name, fieldSchema: platforms.fieldSchema }).from(platforms).orderBy(platforms.name);
  const platformId = first(sp.platformId) || ps[0]?.id || "";
  const q = first(sp.q).trim();
  const review = first(sp.review) === "carriers" ? "carriers" : "";
  const page = parsePage(sp.page);
  const platform = ps.find((p) => p.id === platformId);
  const columns = (platform?.fieldSchema ?? []).filter((f) => f.type !== "url" && f.type !== "text" && f.type !== "json").slice(0, MAX_COLS);

  const where: SQL[] = [];
  if (platformId) where.push(eq(records.platformId, platformId));
  if (q) {
    const bySeq = /^#?\d+$/.test(q) ? [eq(records.seq, Number(q.replace("#", "")))] : [];
    where.push(or(...bySeq, ilike(records.externalId, `%${q}%`), sql`${records.data}::text ilike ${"%" + q + "%"}`)!);
  }
  // Same rule as needsManualCarriers (lib/profile/model.ts): a report whose result was not extracted, not yet curated.
  if (review)
    where.push(
      sql`coalesce(jsonb_typeof(${records.data}->'gtsCarriers'), 'null') <> 'array' and ${records.manual}->'carriers' is null and (coalesce(${records.data}->>'gtsPanel', '') <> '' or (case when jsonb_typeof(${records.data}->'geneticTests') = 'array' then jsonb_array_length(${records.data}->'geneticTests') > 0 else false end))`,
    );
  const cond = where.length ? and(...where) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    d
      .select({
        id: records.id,
        seq: records.seq,
        externalId: records.externalId,
        version: records.version,
        data: records.data,
        capturedAt: records.capturedAt,
        // Drizzle drops table qualifiers inside sql`` for single-table selects, so qualify by hand.
        mediaCount: sql<number>`(select count(*) from ${media} where ${media}.record_id = ${records}.id)`,
        thumbId: sql<string | null>`(select ${media}.id from ${media} where ${media}.record_id = ${records}.id and ${media}.kind in ('photo', 'screenshot') order by ${media}.position, ${media}.created_at limit 1)`,
      })
      .from(records)
      .where(cond)
      .orderBy(desc(records.capturedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    d.select({ total: count() }).from(records).where(cond),
  ]);

  const tableRows = rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    externalId: r.externalId,
    version: r.version,
    thumbId: r.thumbId,
    cells: columns.map((c) => cellText(r.data[c.key])),
    mediaCount: Number(r.mediaCount),
    capturedAt: fmtDate(r.capturedAt),
  }));

  return (
    <PageShell title="记录" description="插件采集入库的结果；列来自平台的字段模板">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <NativeSelect name="platformId" defaultValue={platformId} aria-label="数据来源">
          {ps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="review" defaultValue={review} aria-label="整理状态">
          <option value="">全部记录</option>
          <option value="carriers">基因筛查待人工整理</option>
        </NativeSelect>
        <Input name="q" defaultValue={q} placeholder="搜索编号、来源 ID 或任意字段" className="w-64" />
        <Button type="submit" variant="secondary">
          筛选
        </Button>
        {q || review ? (
          <Button variant="ghost" render={<Link href={`/records?platformId=${platformId}`} />}>
            清除
          </Button>
        ) : null}
      </form>
      <RecordsTable rows={tableRows} columns={columns.map((c) => c.label)} />
      <Pagination page={page} total={total} params={{ platformId, q, review }} pageSize={PAGE_SIZE} />
    </PageShell>
  );
}
