import Link from "next/link";
import { count, db, eq, jobs, platforms, recipes, records, sql } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { CreatePlatformDialog } from "./create-platform-dialog";

export const dynamic = "force-dynamic";

async function load() {
  const d = db();
  const rows = await d
    .select({
      id: platforms.id,
      slug: platforms.slug,
      name: platforms.name,
      baseUrl: platforms.baseUrl,
      enabled: platforms.enabled,
      fieldCount: sql<number>`jsonb_array_length(${platforms.fieldSchema})`,
      updatedAt: platforms.updatedAt,
    })
    .from(platforms)
    .orderBy(platforms.name);
  const [active, jobCounts, recCounts] = await Promise.all([
    d.select({ platformId: recipes.platformId, version: recipes.version }).from(recipes).where(eq(recipes.isActive, true)),
    d.select({ platformId: jobs.platformId, n: count() }).from(jobs).groupBy(jobs.platformId),
    d.select({ platformId: records.platformId, n: count() }).from(records).groupBy(records.platformId),
  ]);
  const by = <T extends { platformId: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.platformId, x]));
  const a = by(active), j = by(jobCounts), r = by(recCounts);
  return rows.map((p) => ({ ...p, activeVersion: a[p.id]?.version ?? null, jobs: j[p.id]?.n ?? 0, records: r[p.id]?.n ?? 0 }));
}

export default async function PlatformsPage() {
  const rows = await load();
  return (
    <PageShell title="平台与 Recipe" description="每个平台对应一个数据源站点；Recipe 是下发给插件执行的采集脚本" actions={<CreatePlatformDialog />}>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>平台</TableHead>
                <TableHead>站点</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>激活 Recipe</TableHead>
                <TableHead className="text-right">字段</TableHead>
                <TableHead className="text-right">任务</TableHead>
                <TableHead className="text-right">记录</TableHead>
                <TableHead>更新时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    还没有平台，点右上角“新建平台”。
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/platforms/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{p.slug}</div>
                    </TableCell>
                    <TableCell className="max-w-60 truncate text-muted-foreground">{p.baseUrl}</TableCell>
                    <TableCell>{p.enabled ? <Badge variant="secondary">启用</Badge> : <Badge variant="outline">停用</Badge>}</TableCell>
                    <TableCell>{p.activeVersion ? `v${p.activeVersion}` : <span className="text-muted-foreground">无</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.fieldCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.jobs}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.records}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(p.updatedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
