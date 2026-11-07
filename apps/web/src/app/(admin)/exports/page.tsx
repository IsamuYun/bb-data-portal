import { db, desc, eq, exports, platforms, users } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { AutoRefresh } from "@/components/common/auto-refresh";
import { ConfirmForm } from "@/components/common/confirm-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteExportAction, retryExportAction } from "@/lib/actions/exports";
import { failStaleExports } from "@/lib/export/run";
import type { ExportFilters } from "@/lib/export/types";
import { fmtDate } from "@/lib/format";
import { ExportForm } from "./export-form";
import { RetryButton } from "./retry-button";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "排队中", cls: "bg-muted text-foreground" },
  running: { label: "生成中", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  done: { label: "完成", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  failed: { label: "失败", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
};

function describeFilters(f: ExportFilters) {
  const parts: string[] = [];
  if (f.q) parts.push(`搜索“${f.q}”`);
  if (f.withMediaOnly) parts.push("仅含媒体");
  parts.push(f.translate ? "中文" : "英文原文");
  return parts.length ? parts.join("，") : "全部记录";
}

export default async function ExportsPage() {
  await failStaleExports();
  const d = db();
  const [ps, rows] = await Promise.all([
    d.select({ id: platforms.id, name: platforms.name }).from(platforms).orderBy(platforms.name),
    d
      .select({ e: exports, platformName: platforms.name, author: users.name })
      .from(exports)
      .leftJoin(platforms, eq(platforms.id, exports.platformId))
      .leftJoin(users, eq(users.id, exports.createdBy))
      .orderBy(desc(exports.createdAt))
      .limit(100),
  ]);
  const busy = rows.some((r) => r.e.status === "pending" || r.e.status === "running");

  return (
    <PageShell title="导出" description="按平台导出 Excel（一行一条记录，含照片缩略图）或 PDF（每条记录一张卡片）">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>新建导出</CardTitle>
            <CardDescription>在后台生成，完成后在右侧下载</CardDescription>
          </CardHeader>
          <CardContent>
            {ps.length === 0 ? <p className="text-sm text-muted-foreground">还没有平台。</p> : <ExportForm platforms={ps} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>导出列表</CardTitle>
            <CardDescription>
              最近 100 次 <AutoRefresh active={busy} message="正在生成文件" />
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>格式</TableHead>
                  <TableHead>范围</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">记录数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      还没有导出。
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map(({ e, platformName, author }) => {
                    const st = STATUS[e.status] ?? { label: e.status, cls: "" };
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(e.createdAt)}
                          {author ? <div>{author}</div> : null}
                        </TableCell>
                        <TableCell>{platformName ?? "—"}</TableCell>
                        <TableCell className="uppercase">{e.type}</TableCell>
                        <TableCell className="max-w-48 truncate text-xs">{describeFilters((e.filters ?? {}) as ExportFilters)}</TableCell>
                        <TableCell>
                          <Badge className={st.cls}>{st.label}</Badge>
                          {e.error ? <div className="mt-1 max-w-64 text-xs text-destructive">{e.error}</div> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{e.rowCount ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {e.status === "done" ? (
                              <Button size="xs" variant="outline" render={<a href={`/api/exports/${e.id}`} />}>
                                下载
                              </Button>
                            ) : null}
                            {e.status === "failed" ? <RetryButton id={e.id} action={retryExportAction} /> : null}
                            <ConfirmForm
                              action={deleteExportAction}
                              fields={{ id: e.id }}
                              title="删除这次导出？"
                              description="会同时删除生成的文件。"
                              triggerLabel="删除"
                              triggerVariant="ghost"
                              triggerSize="xs"
                              confirmLabel="删除"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
