import { PageShell } from "@/components/layout/page-shell";
import { Placeholder } from "@/components/layout/placeholder";

export default function Page() {
  return (
    <PageShell title="导出" description="导出 Excel 或 PDF">
      <Placeholder milestone="M4" items={["异步导出任务","Excel（exceljs）/ PDF（react-pdf）"]} />
    </PageShell>
  );
}
