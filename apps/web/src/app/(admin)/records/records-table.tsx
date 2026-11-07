"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteRecordsAction } from "@/lib/actions/records";

export type RecordRow = {
  id: string;
  /** Portal-wide auto-increment donor number. */
  seq: number;
  /** Donor ID inside the data source. */
  externalId: string;
  version: number;
  thumbId: string | null;
  cells: string[];
  mediaCount: number;
  capturedAt: string;
};

/** Record list with a photo thumbnail per row, row selection and bulk delete. */
export function RecordsTable({ rows, columns }: { rows: RecordRow[]; columns: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const remove = () =>
    start(async () => {
      const fd = new FormData();
      for (const id of selected) fd.append("id", id);
      try {
        await deleteRecordsAction(fd);
        toast.success(`已删除 ${selected.size} 条记录`);
        setSelected(new Set());
        setConfirm(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败");
      }
    });

  return (
    <>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{selected.size > 0 ? `已选择 ${selected.size} 条` : "勾选记录后可批量删除"}</span>
        <Button variant="destructive" size="sm" disabled={selected.size === 0 || pending} onClick={() => setConfirm(true)}>
          删除选中{selected.size > 0 ? `（${selected.size}）` : ""}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" aria-label="全选" checked={allSelected} onChange={toggleAll} disabled={rows.length === 0} />
                </TableHead>
                <TableHead className="w-14">图片</TableHead>
                <TableHead>编号</TableHead>
                <TableHead>来源 ID</TableHead>
                {columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                <TableHead className="text-right">媒体</TableHead>
                <TableHead>采集时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 6} className="text-center text-muted-foreground">
                    还没有记录。插件执行任务后结果会出现在这里。
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                    <TableCell>
                      <input type="checkbox" aria-label={`选择 ${r.externalId}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    </TableCell>
                    <TableCell className="py-1">
                      <Link href={`/records/${r.id}`} className="block size-10 overflow-hidden rounded-md border bg-muted">
                        {r.thumbId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/media/${r.thumbId}`} alt="" loading="lazy" className="size-full object-cover" />
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/records/${r.id}`} className="font-mono text-xs font-medium tabular-nums hover:underline">
                        #{r.seq}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{r.externalId}</span>
                      {r.version > 1 ? <span className="ml-1 text-xs text-muted-foreground">v{r.version}</span> : null}
                    </TableCell>
                    {r.cells.map((v, i) => (
                      <TableCell key={columns[i]} className="max-w-48 truncate">
                        {v}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{r.mediaCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.capturedAt}</TableCell>
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
            <DialogTitle>删除 {selected.size} 条记录？</DialogTitle>
            <DialogDescription>记录及其媒体文件会被一并删除，无法恢复。对应的采集任务不受影响。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={pending}>
              取消
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
