import Link from "next/link";
import { and, count, datasets, db, desc, eq, ilike, jobs, or, platforms, type SQL } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { ConfirmForm } from "@/components/common/confirm-form";
import { NativeSelect } from "@/components/common/native-select";
import { PAGE_SIZE, Pagination, parsePage } from "@/components/common/pagination";
import { JOB_STATUSES, JobStatusBadge, jobStatusLabel } from "@/components/common/status-badge";
import { JobsTable } from "./jobs-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelJobsAction, retryJobsAction } from "@/lib/actions/jobs";
import { first, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function JobsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const f = { platformId: first(sp.platformId), datasetId: first(sp.datasetId), status: first(sp.status), q: first(sp.q).trim() };
  const page = parsePage(sp.page);
  const d = db();

  const where: SQL[] = [];
  if (f.platformId) where.push(eq(jobs.platformId, f.platformId));
  if (f.datasetId) where.push(eq(jobs.datasetId, f.datasetId));
  if (f.status) where.push(eq(jobs.status, f.status as (typeof jobs.status.enumValues)[number]));
  if (f.q) where.push(or(ilike(jobs.url, `%${f.q}%`), ilike(jobs.externalId, `%${f.q}%`))!);
  const cond = where.length ? and(...where) : undefined;

  const [rows, [{ total }], statusCounts, ps, dss] = await Promise.all([
    d
      .select({
        id: jobs.id,
        url: jobs.url,
        externalId: jobs.externalId,
        status: jobs.status,
        priority: jobs.priority,
        attempts: jobs.attempts,
        maxAttempts: jobs.maxAttempts,
        lastError: jobs.lastError,
        dryRun: jobs.dryRun,
        updatedAt: jobs.updatedAt,
        platformName: platforms.name,
        datasetName: datasets.name,
        datasetId: jobs.datasetId,
      })
      .from(jobs)
      .innerJoin(platforms, eq(platforms.id, jobs.platformId))
      .leftJoin(datasets, eq(datasets.id, jobs.datasetId))
      .where(cond)
      .orderBy(desc(jobs.priority), desc(jobs.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    d.select({ total: count() }).from(jobs).where(cond),
    d.select({ status: jobs.status, n: count() }).from(jobs).where(cond).groupBy(jobs.status),
    d.select({ id: platforms.id, name: platforms.name }).from(platforms).orderBy(platforms.name),
    d.select({ id: datasets.id, name: datasets.name }).from(datasets).orderBy(desc(datasets.createdAt)),
  ]);
  const sc = Object.fromEntries(statusCounts.map((s) => [s.status, s.n])) as Record<string, number>;
  const retryable = (sc.failed ?? 0) + (sc.cancelled ?? 0) + (sc.auth_required ?? 0) + (sc.skipped ?? 0);
  const scope = { platformId: f.platformId, datasetId: f.datasetId };

  return (
    <PageShell
      title="任务"
      description="每个 URL 一个任务；插件按优先级与创建时间领取待处理任务"
      actions={
        <>
          <ConfirmForm
            action={retryJobsAction}
            fields={scope}
            title={`重试 ${retryable} 个任务？`}
            description="当前筛选范围内失败、已取消、需登录、已跳过的任务会重置为待处理。"
            confirmLabel="重试"
            variant="default"
            triggerLabel={`重试失败（${retryable}）`}
            triggerDisabled={retryable === 0}
          />
          <ConfirmForm
            action={cancelJobsAction}
            fields={scope}
            title={`取消 ${sc.pending ?? 0} 个待处理任务？`}
            description="当前筛选范围内的待处理任务将标记为已取消，可以之后再重试。"
            confirmLabel="取消任务"
            triggerLabel={`取消待处理（${sc.pending ?? 0}）`}
            triggerDisabled={!sc.pending}
          />
        </>
      }
    >
      <form method="get" className="flex flex-wrap items-end gap-2">
        <NativeSelect name="platformId" defaultValue={f.platformId} aria-label="平台">
          <option value="">全部平台</option>
          {ps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="datasetId" defaultValue={f.datasetId} aria-label="数据集" className="max-w-64">
          <option value="">全部数据集</option>
          {dss.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={f.status} aria-label="状态">
          <option value="">全部状态</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {jobStatusLabel(s)}
            </option>
          ))}
        </NativeSelect>
        <Input name="q" defaultValue={f.q} placeholder="搜索 URL 或 ID" className="w-56" />
        <Button type="submit" variant="secondary">
          筛选
        </Button>
        {f.platformId || f.datasetId || f.status || f.q ? (
          <Button variant="ghost" render={<Link href="/jobs" />}>
            清除
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2 text-sm">
        {JOB_STATUSES.filter((s) => sc[s]).map((s) => (
          <Link key={s} href={`?${new URLSearchParams({ ...scope, q: f.q, status: s }).toString()}`} className="inline-flex items-center gap-1">
            <JobStatusBadge status={s} />
            <span className="tabular-nums">{sc[s]}</span>
          </Link>
        ))}
      </div>

      <JobsTable
        key={`${page}|${f.platformId}|${f.datasetId}|${f.status}|${f.q}`}
        rows={rows.map((j) => ({ ...j, updatedAt: fmtDate(j.updatedAt) }))}
        total={total}
        filter={{ platformId: f.platformId, datasetId: f.datasetId, status: f.status, q: f.q }}
      />
      <Pagination page={page} total={total} params={{ ...scope, status: f.status, q: f.q }} />
    </PageShell>
  );
}
