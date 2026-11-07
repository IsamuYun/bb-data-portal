"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { deleteDictionaryEntryAction, saveDictionaryEntryAction } from "@/lib/actions/dictionary";

const ORIGIN: Record<string, string> = { seed: "内置", manual: "手工", llm: "模型", scan: "扫描" };

export function EntryRow({ entry }: { entry: { id: string; fieldKey: string; source: string; target: string | null; origin: string } }) {
  const [value, setValue] = useState(entry.target ?? "");
  const [pending, start] = useTransition();
  const dirty = value.trim() !== (entry.target ?? "");
  const run = (fn: (fd: FormData) => Promise<void>, extra: Record<string, string>) =>
    start(async () => {
      const fd = new FormData();
      fd.append("id", entry.id);
      for (const [k, v] of Object.entries(extra)) fd.append(k, v);
      try {
        await fn(fd);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
    });
  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">{entry.fieldKey || "（通用）"}</TableCell>
      <TableCell className="max-w-64 break-words">{entry.source}</TableCell>
      <TableCell>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(saveDictionaryEntryAction, { target: value });
          }}
        >
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="未翻译" className={entry.target ? "" : "border-amber-400"} />
          <Button type="submit" size="sm" variant={dirty ? "default" : "outline"} disabled={pending || !dirty}>
            保存
          </Button>
        </form>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{ORIGIN[entry.origin] ?? entry.origin}</TableCell>
      <TableCell className="text-right">
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(deleteDictionaryEntryAction, {})}>
          删除
        </Button>
      </TableCell>
    </TableRow>
  );
}
