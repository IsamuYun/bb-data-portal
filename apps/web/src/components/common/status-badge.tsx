import { Badge } from "@/components/ui/badge";

const JOB: Record<string, { label: string; cls: string }> = {
  pending: { label: "待处理", cls: "bg-muted text-foreground" },
  leased: { label: "已租约", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  running: { label: "执行中", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  done: { label: "完成", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  failed: { label: "失败", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  auth_required: { label: "需登录", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  skipped: { label: "已跳过", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "已取消", cls: "bg-muted text-muted-foreground" },
};

export const JOB_STATUSES = Object.keys(JOB);
export function jobStatusLabel(s: string) {
  return JOB[s]?.label ?? s;
}

export function JobStatusBadge({ status }: { status: string }) {
  const m = JOB[status] ?? { label: status, cls: "" };
  return <Badge className={m.cls}>{m.label}</Badge>;
}
