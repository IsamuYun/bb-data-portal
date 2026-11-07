"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { JobStatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requeueSelectedJobsAction } from "@/lib/actions/jobs";
import { JobRowActions } from "./row-actions";

export type JobRow = {
  id: string;
  url: string;
  externalId: string | null;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  dryRun: boolean;
  updatedAt: string;
  platformName: string;
  datasetName: string | null;
};

/** Jobs that 重采 would put back in the queue (queued / in-flight jobs are skipped server-side too). */
const REQUEUEABLE = new Set(["done", "failed", "cancelled", "auth_required", "skipped"]);

/**
 * Job list with row selection: tick rows (or the header box for the whole page, then optionally every job matching
 * the filter) and 重采 puts them back in the queue. Done jobs overwrite their record when re-collected.
 * The page renders it with a key per page + filter, so a new list starts with an empty selection.
 */
export function JobsTable({ rows, total, filter }: { rows: JobRow[]; total: number; filter: Record<string, string> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const pageAll = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) => {
    setAllMatching(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const togglePage = () => {
    setAllMatching(false);
    setSelected(pageAll ? new Set() : new Set(rows.map((r) => r.id)));
  };

  const count = allMatching ? total : selected.size;
  const requeueable = allMatching ? null : rows.filter((r) => selected.has(r.id) && REQUEUEABLE.has(r.status)).length;

  const requeue = () =>
    start(async () => {
      const fd = new FormData();
      if (allMatching) {
        fd.append("all", "1");
        for (const [k, v] of Object.entries(filter)) if (v) fd.append(k, v);
      } else for (const id of selected) fd.append("id", id);
      try {
        const { queued } = await requeueSelectedJobsAction(fd);
        toast.success(queued ? `已加入队列 ${queued} 个任务，插件会按顺序重新采集` : "所选任务都在队列中或正在执行，无需重采");
        setSelected(new Set());
        setAllMatching(false);
        setConfirm(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
    });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="flex flex-wrap items-center gap-2">
          {count > 0 ? (allMatching ? `已选择全部 ${total} 个筛选结果` : `已选择 ${count} 个`) : "勾选任务后可批量重采"}
          {pageAll && !allMatching && total > rows.length ? (
            <Button size="xs" variant="link" className="h-auto p-0" onClick={() => setAllMatching(true)}>
              选择全部 {total} 个筛选结果
            </Button>
          ) : null}
          {count > 0 ? (
            <Button size="xs" variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => (setSelected(new Set()), setAllMatching(false))}>
              清除选择
            </Button>
          ) : null}
        </span>
        <Button size="sm" disabled={count === 0 || pending} onClick={() => setConfirm(true)}>
          重采选中{count > 0 ? `（${count}）` : ""}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" aria-label="全选本页" checked={pageAll} onChange={togglePage} disabled={rows.length === 0} />
                </TableHead>
                <TableHead>外部 ID</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>平台 / 数据集</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">优先级</TableHead>
                <TableHead className="text-right">尝试</TableHead>
                <TableHead>更新</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    没有匹配的任务。
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((j) => (
                  <TableRow key={j.id} data-state={allMatching || selected.has(j.id) ? "selected" : undefined}>
                    <TableCell>
                      <input type="checkbox" aria-label={`选择 ${j.externalId ?? j.id.slice(0, 8)}`} checked={allMatching || selected.has(j.id)} onChange={() => toggle(j.id)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/jobs/${j.id}`} className="hover:underline">
                        {j.externalId ?? j.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72">
                      <a href={j.url} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs hover:underline">
                        {j.url}
                      </a>
                      {j.lastError ? <div className="truncate text-xs text-destructive">{j.lastError}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{j.platformName}</div>
                      <div className="truncate text-muted-foreground">{j.datasetName ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={j.status} />
                      {j.dryRun ? <span className="ml-1 text-xs text-muted-foreground">试跑</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{j.priority}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {j.attempts}/{j.maxAttempts}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.updatedAt}</TableCell>
                    <TableCell className="text-right">
                      <JobRowActions id={j.id} status={j.status} priority={j.priority} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重采 {allMatching ? `全部 ${total}` : count} 个任务？</DialogTitle>
            <DialogDescription>
              已完成、失败、已取消、需登录、已跳过的任务会重置为待处理，由插件重新采集；已完成任务的记录会被新结果覆盖（照片与报告按内容去重）。待处理和执行中的任务保持不变
              {requeueable !== null && requeueable < count ? `（所选中 ${count - requeueable} 个将被跳过）` : ""}。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={pending}>
              取消
            </Button>
            <Button onClick={requeue} disabled={pending}>
              {pending ? "提交中…" : "重采"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
