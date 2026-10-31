import { count, db, devices, eq, jobs, platforms, records, sql } from "@bb/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/page-shell";

export const dynamic = "force-dynamic";

async function loadStats() {
  const d = db();
  const [[p], [r], [dev], byStatus] = await Promise.all([
    d.select({ n: count() }).from(platforms).where(eq(platforms.enabled, true)),
    d.select({ n: count() }).from(records),
    d
      .select({ n: count() })
      .from(devices)
      .where(sql`${devices.status} = 'active' and ${devices.lastSeenAt} > now() - interval '2 minutes'`),
    d.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status),
  ]);
  const js = Object.fromEntries(byStatus.map((s) => [s.status, s.n])) as Record<string, number>;
  return { platforms: p.n, records: r.n, onlineDevices: dev.n, jobs: js };
}

export default async function DashboardPage() {
  const s = await loadStats();
  const total = Object.values(s.jobs).reduce((a, b) => a + b, 0);
  const cards = [
    { title: "在线设备", value: s.onlineDevices, desc: "最近 2 分钟有心跳的插件" },
    { title: "启用平台", value: s.platforms, desc: "已配置 Recipe 的数据源" },
    { title: "任务总数", value: total, desc: `完成 ${s.jobs.done ?? 0} · 待处理 ${s.jobs.pending ?? 0}` },
    { title: "记录数", value: s.records, desc: "已入库的采集结果" },
  ];
  return (
    <PageShell title="仪表盘" description="采集设备、任务与数据概览">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardDescription>{c.title}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{c.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{c.desc}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>任务状态</CardTitle>
          <CardDescription>按状态统计</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {total === 0 ? (
            <span className="text-sm text-muted-foreground">还没有任务。导入数据集后会在这里显示进度。</span>
          ) : (
            Object.entries(s.jobs).map(([k, v]) => (
              <Badge key={k} variant="secondary">
                {k}: {v}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
