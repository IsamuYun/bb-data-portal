import { PageShell } from "@/components/layout/page-shell";
import { Placeholder } from "@/components/layout/placeholder";

export default function Page() {
  return (
    <PageShell title="记录" description="已采集入库的数据">
      <Placeholder milestone="M1" items={["按平台动态列","详情页：字段 + 图片 + 原始 JSON"]} />
    </PageShell>
  );
}
