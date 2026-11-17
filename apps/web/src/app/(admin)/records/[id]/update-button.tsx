"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recollectRecordAction } from "@/lib/actions/jobs";

const IN_FLIGHT: Record<string, string> = { pending: "排队中", leased: "采集中", running: "采集中" };

/**
 * "更新数据": re-collect this donor from the source (page, photos and report PDFs, which are parsed again on upload).
 * While its job is queued or running the page refreshes itself, so the new data shows up when the capture lands.
 */
export function UpdateRecordButton({ id, jobStatus, lastError }: { id: string; jobStatus: string | null; lastError: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const busy = jobStatus ? IN_FLIGHT[jobStatus] : undefined;

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [busy, router]);

  return (
    <Button
      variant="outline"
      disabled={pending || !!busy}
      title={busy ? "插件完成后页面会自动刷新" : (lastError ?? "从来源页重新采集，覆盖当前数据（手动整理的携带者结果和颜值评分保留）")}
      onClick={() =>
        start(async () => {
          try {
            const r = await recollectRecordAction(id);
            toast.success(r.message);
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "提交失败");
          }
        })
      }
    >
      {busy ? `更新中（${busy}）…` : pending ? "提交中…" : "更新数据"}
    </Button>
  );
}
