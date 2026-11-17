import Link from "next/link";
import { and, count, db, desc, eq, ilike, media, or, platforms, records, sql, type SQL } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { NativeSelect } from "@/components/common/native-select";
import { Pagination, parsePage } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cellText, first, fmtDate } from "@/lib/format";
import { AVAIL, AVAIL_LABEL, CARRIER, CARRIER_LABEL, COMPLEXION, EDUCATION, EYE, LOOKS, RACE, facetParams, facetWhere, hasFacets, parseFacets, raceText } from "@/lib/records/facets";
import { RecordsTable } from "./records-table";

export const dynamic = "force-dynamic";
const MAX_COLS = 6;
const PAGE_SIZE = 20;
const ALL = "all";
/** Columns shown when listing every source at once: the shared facet fields (race read per source). */
const ALL_COLUMNS = [
  { key: "height", label: "身高" },
  { key: "educationLevel", label: "学历" },
  { key: "complexion", label: "肤色" },
  { key: "race", label: "人种" },
  { key: "eyeColor", label: "眼睛颜色" },
];

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const d = db();
  const ps = await d.select({ id: platforms.id, slug: platforms.slug, name: platforms.name, fieldSchema: platforms.fieldSchema }).from(platforms).orderBy(platforms.name);
  const platformId = ps.some((p) => p.id === first(sp.platformId)) ? first(sp.platformId) : ALL;
  const all = platformId === ALL;
  const facets = parseFacets((k) => first(sp[k]).trim());
  const q = first(sp.q).trim();
  const review = first(sp.review) === "carriers" ? "carriers" : "";
  const page = parsePage(sp.page);
  const platform = ps.find((p) => p.id === platformId);
  const columns = all ? ALL_COLUMNS : (platform?.fieldSchema ?? []).filter((f) => f.type !== "url" && f.type !== "text" && f.type !== "json").slice(0, MAX_COLS);
  const platformName = new Map(ps.map((p) => [p.id, p.name]));

  const where: SQL[] = [];
  if (!all) where.push(eq(records.platformId, platformId));
  where.push(...facetWhere(facets, ps));
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
        platformId: records.platformId,
        carrierStatus: records.carrierStatus,
        availability: records.availability,
        looks: records.looks,
        data: records.data,
        race: sql<string | null>`${raceText(ps)}`,
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
    source: all ? (platformName.get(r.platformId) ?? "") : undefined,
    cells: [
      ...columns.map((c) => (c.key === "race" ? cellText(parseRace(r.race)) : cellText(r.data[c.key]))),
      CARRIER_LABEL[r.carrierStatus],
      AVAIL_LABEL[r.availability],
      r.looks?.toString() ?? "—",
    ],
    mediaCount: Number(r.mediaCount),
    capturedAt: fmtDate(r.capturedAt),
  }));

  return (
    <PageShell title="记录" description="插件采集入库的结果；列来自平台的字段模板">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <NativeSelect name="platformId" defaultValue={platformId} aria-label="数据来源">
          <option value={ALL}>全部来源</option>
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
        <div className="flex items-center gap-1">
          <Input name="hmin" type="number" min={100} max={250} defaultValue={facets.heightMin ?? ""} placeholder="身高≥cm" aria-label="最低身高（cm）" className="w-24" />
          <span className="text-muted-foreground">–</span>
          <Input name="hmax" type="number" min={100} max={250} defaultValue={facets.heightMax ?? ""} placeholder="身高≤cm" aria-label="最高身高（cm）" className="w-24" />
        </div>
        <FacetSelect name="edu" label="学历" value={facets.education} options={EDUCATION} />
        <FacetSelect name="skin" label="肤色" value={facets.complexion} options={COMPLEXION} />
        <FacetSelect name="race" label="人种" value={facets.race} options={RACE} />
        <FacetSelect name="eye" label="眼睛颜色" value={facets.eye} options={EYE} />
        <FacetSelect name="gene" label="基因筛查" value={facets.carrier} options={CARRIER} />
        <FacetSelect name="looks" label="颜值" value={facets.looks} options={LOOKS} />
        <FacetSelect name="avail" label="可用状态" value={facets.avail} options={AVAIL} />
        <Button type="submit" variant="secondary">
          筛选
        </Button>
        {q || review || hasFacets(facets) ? (
          <Button variant="ghost" render={<Link href={all ? "/records" : `/records?platformId=${platformId}`} />}>
            清除
          </Button>
        ) : null}
      </form>
      <RecordsTable rows={tableRows} columns={[...columns.map((c) => c.label), "基因筛查", "可用状态", "颜值"]} showSource={all} />
      <Pagination page={page} total={total} params={{ platformId: all ? "" : platformId, q, review, ...facetParams(facets) }} pageSize={PAGE_SIZE} />
    </PageShell>
  );
}

/** Race text is either a plain string (Cryobank `ethnicOrigin`) or a JSON list (FairFax `ancestry`). */
function parseRace(v: string | null): unknown {
  if (!v?.startsWith("[")) return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function FacetSelect({ name, label, value, options }: { name: string; label: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <NativeSelect name={name} defaultValue={value} aria-label={label}>
      <option value="">{label}：不限</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}
