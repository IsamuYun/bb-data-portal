import { PageShell } from "@/components/layout/page-shell";
import { Placeholder } from "@/components/layout/placeholder";

export default function Page() {
  return (
    <PageShell title="任务" description="采集任务队列与执行日志">
      <Placeholder milestone="M1" items={["筛选 / 重试 / 取消","run 日志与截图（M2）"]} />
    </PageShell>
  );
}
