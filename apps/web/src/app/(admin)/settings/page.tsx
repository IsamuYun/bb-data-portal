import { PageShell } from "@/components/layout/page-shell";
import { Placeholder } from "@/components/layout/placeholder";

export default function Page() {
  return (
    <PageShell title="设置" description="系统与账号设置">
      <Placeholder milestone="M5" items={["管理员账号","服务器对外 URL","插件下载"]} />
    </PageShell>
  );
}
