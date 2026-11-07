import Link from "next/link";
import { Upload } from "lucide-react";
import { count, datasets, db, desc, eq, jobs, platforms, users } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { ConfirmForm } from "@/components/common/confirm-form";
import { JobStatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteDatasetAction } from "@/lib/actions/datasets";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

async function load() {
  const d = db();
  const rows = await d
    .select({
      id: datasets.id,
      name: datasets.name,
      sourceFile: datasets.sourceFile,
      createdAt: datasets.createdAt,
      platformName: platforms.name,
      platformId: platforms.id,
      author: users.name,
    })
    .from(datasets)
    .innerJoin(platforms, eq(platforms.id, datasets.platformId))
    .leftJoin(users, eq(users.id, datasets.createdBy))
    .orderBy(desc(datasets.createdAt));
  const counts = await d.select({ datasetId: jobs.datasetId, status: jobs.status, n: count() }).from(jobs).groupBy(jobs.datasetId, jobs.status);
  const byDs = new Map<string, Record<string, number>>();
  for (const c of counts) {
    if (!c.datasetId) continue;
    const m = byDs.get(c.datasetId) ?? {};
    m[c.status] = c.n;
    byDs.set(c.datasetId, m);
  }
  return rows.map((r) => ({ ...r, counts: byDs.get(r.id) ?? {} }));
}

export default async function DatasetsPage() {
  const rows = await load();
  return (
    <PageShell
      title="数据集 / 导入"
      description="上传 xlsx / csv，映射 URL 与 ID 列，生成采集任务"
      actions={
        <Button render={<Link href="/datasets/import" />}>
          <Upload data-icon="inline-start" />
          导入文件
        </Button>
      }
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>数据集</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>来源文件</TableHead>
                <TableHead>任务</TableHead>
                <TableHead>创建</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    还没有数据集。点“导入文件”上传 xlsx。
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/jobs?datasetId=${r.id}`} className="font-medium hover:underline">
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/platforms/${r.platformId}`} className="hover:underline">
                          {r.platformName}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">{r.sourceFile ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="mr-1 tabular-nums">{total}</span>
                          {Object.entries(r.counts).map(([s, n]) => (
                            <span key={s} className="inline-flex items-center gap-1 text-xs">
                              <JobStatusBadge status={s} />
                              <span className="tabular-nums">{n}</span>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(r.createdAt)}
                        {r.author ? ` · ${r.author}` : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <ConfirmForm
                          action={deleteDatasetAction}
                          fields={{ id: r.id }}
                          title={`删除数据集 ${r.name}？`}
                          description={`将删除其 ${total} 个任务（已入库的记录保留）。`}
                          confirmLabel="删除"
                          triggerLabel="删除"
                          triggerVariant="ghost"
                          triggerSize="sm"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
