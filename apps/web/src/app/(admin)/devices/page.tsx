import { PageShell } from "@/components/layout/page-shell";
import { Placeholder } from "@/components/layout/placeholder";

export default function Page() {
  return (
    <PageShell title="设备" description="已配对的 Chrome 插件实例">
      <Placeholder milestone="M2" items={["配对码生成","在线状态与暂停"]} />
    </PageShell>
  );
}
