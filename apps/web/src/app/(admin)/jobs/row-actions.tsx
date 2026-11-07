"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ConfirmForm } from "@/components/common/confirm-form";
import { Button } from "@/components/ui/button";
import { cancelJobsAction, deleteJobsAction, forceCancelJobsAction, recollectJobsAction, retryJobsAction, setJobPriorityAction } from "@/lib/actions/jobs";

const IN_FLIGHT = ["leased", "running"];

/** `from="detail"`: the job's own page, which goes back to the list after a delete. */
export function JobRowActions({ id, status, priority, from }: { id: string; status: string; priority: number; from?: "detail" }) {
  const [pending, start] = useTransition();
  const run = (fn: (fd: FormData) => Promise<void>, extra: Record<string, string> = {}) =>
    start(async () => {
      const fd = new FormData();
      fd.append("id", id);
      for (const [k, v] of Object.entries(extra)) fd.append(k, v);
      try {
        await fn(fd);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失败");
      }
    });
  return (
    <div className="flex justify-end gap-1">
      {status === "pending" ? (
        <>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(setJobPriorityAction, { priority: String(priority + 10) })} title="提高优先级">
            置顶
          </Button>
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(cancelJobsAction)}>
            取消
          </Button>
        </>
      ) : null}
      {status === "done" ? (
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(recollectJobsAction)} title="重新采集并覆盖记录">
          重采
        </Button>
      ) : null}
      {["failed", "cancelled", "auth_required", "skipped"].includes(status) ? (
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(retryJobsAction)}>
          重试
        </Button>
      ) : null}
      {IN_FLIGHT.includes(status) ? (
        <ConfirmForm
          action={forceCancelJobsAction}
          fields={{ id }}
          title="取消执行中的任务？"
          description="释放插件的租约并标记为已取消。插件之后回传的结果会被拒收；需要时可再点“重试”。"
          confirmLabel="取消任务"
          triggerLabel="取消"
          triggerVariant="ghost"
          triggerSize="xs"
        />
      ) : (
        <ConfirmForm
          action={deleteJobsAction}
          fields={from ? { id, from } : { id }}
          title="删除这个任务？"
          description="任务和它的执行日志会被删除，已入库的记录保留。"
          confirmLabel="删除"
          triggerLabel="删除"
          triggerVariant="ghost"
          triggerSize="xs"
        />
      )}
    </div>
  );
}
