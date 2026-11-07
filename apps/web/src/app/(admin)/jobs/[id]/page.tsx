import Link from "next/link";
import { notFound } from "next/navigation";
import { datasets, db, desc, devices, eq, jobRuns, jobs, platforms, records } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { JobStatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/format";
import { JobRowActions } from "../row-actions";
import { AutoRefresh } from "@/components/common/auto-refresh";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const [row] = await d
    .select({ job: jobs, platform: platforms, dataset: datasets, recordId: records.id })
    .from(jobs)
    .innerJoin(platforms, eq(platforms.id, jobs.platformId))
    .leftJoin(datasets, eq(datasets.id, jobs.datasetId))
    .leftJoin(records, eq(records.jobId, jobs.id))
    .where(eq(jobs.id, id))
    .limit(1);
  if (!row) notFound();
  const runs = await d
    .select({ run: jobRuns, deviceName: devices.name })
    .from(jobRuns)
    .leftJoin(devices, eq(devices.id, jobRuns.deviceId))
    .where(eq(jobRuns.jobId, id))
    .orderBy(desc(jobRuns.startedAt));
  const j = row.job;

  return (
    <PageShell
      title={`${j.dryRun ? "试跑 " : "任务 "}${j.externalId ?? j.id.slice(0, 8)}`}
      description={j.url}
      actions={
        <>
          <JobRowActions id={j.id} status={j.status} priority={j.priority} from="detail" />
          {row.recordId ? (
            <Button variant="outline" render={<Link href={`/records/${row.recordId}`} />}>
              查看记录
            </Button>
          ) : null}
          <Button variant="outline" render={<Link href={`/jobs?datasetId=${j.datasetId ?? ""}`} />}>
            返回任务列表
          </Button>
        </>
      }
    >
      <AutoRefresh active={["pending", "leased", "running"].includes(j.status)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader>
            <CardTitle>概要</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">状态</dt>
              <dd>
                <JobStatusBadge status={j.status} />
                {j.dryRun ? <span className="ml-2 text-xs text-muted-foreground">试跑，不写入记录</span> : null}
              </dd>
              <dt className="text-muted-foreground">平台</dt>
              <dd>
                <Link href={`/platforms/${row.platform.id}`} className="hover:underline">
                  {row.platform.name}
                </Link>
              </dd>
              <dt className="text-muted-foreground">数据集</dt>
              <dd>{row.dataset?.name ?? "—"}</dd>
              <dt className="text-muted-foreground">尝试</dt>
              <dd>
                {j.attempts} / {j.maxAttempts}
              </dd>
              <dt className="text-muted-foreground">优先级</dt>
              <dd>{j.priority}</dd>
              <dt className="text-muted-foreground">租约</dt>
              <dd>{j.leaseUntil ? `至 ${fmtDate(j.leaseUntil)}` : "—"}</dd>
              <dt className="text-muted-foreground">最近错误</dt>
              <dd className="text-destructive">{j.lastError ?? "—"}</dd>
              <dt className="text-muted-foreground">创建</dt>
              <dd>{fmtDate(j.createdAt)}</dd>
            </dl>
            {j.seed && Object.keys(j.seed).length ? (
              <>
                <p className="mt-4 mb-1 text-xs font-medium text-muted-foreground">种子字段（来自导入文件）</p>
                <pre className="max-h-60 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(j.seed, null, 2)}</pre>
              </>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>执行记录（{runs.length}）</CardTitle>
            <CardDescription>每次插件领取并执行都会留下一条记录，含日志与原始输出</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {runs.length === 0 ? <p className="text-sm text-muted-foreground">还没有执行过。</p> : null}
            {runs.map(({ run, deviceName }) => (
              <div key={run.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <JobStatusBadge status={run.status} />
                  <span>{deviceName ?? "未知设备"}</span>
                  {run.recipeVersion ? <Badge variant="outline">Recipe v{run.recipeVersion}</Badge> : null}
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(run.startedAt)}
                    {run.finishedAt ? ` → ${fmtDate(run.finishedAt)}` : " · 进行中"}
                  </span>
                </div>
                {run.error ? <p className="mt-2 text-sm text-destructive">{run.error}</p> : null}
                {run.logs?.length ? (
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 text-xs leading-5">
                    {run.logs.map((l) => `${String(l.level).padEnd(5)} +${(l.t / 1000).toFixed(1)}s  ${l.msg}`).join("\n")}
                  </pre>
                ) : null}
                {run.output && Object.keys(run.output).length ? (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground">原始输出（{Object.keys(run.output).length} 个字段）</summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2">{JSON.stringify(run.output, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
