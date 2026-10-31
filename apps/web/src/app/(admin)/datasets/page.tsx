import { PageShell } from "@/components/layout/page-shell";
import { Placeholder } from "@/components/layout/placeholder";

export default function Page() {
  return (
    <PageShell title="数据集 / 导入" description="上传 xlsx/csv 并生成采集任务">
      <Placeholder milestone="M1" items={["上传与列映射向导","cryobank.xlsx 预置映射","生成 jobs"]} />
    </PageShell>
  );
}
