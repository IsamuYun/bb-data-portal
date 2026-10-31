import { PageShell } from "@/components/layout/page-shell";
import { Placeholder } from "@/components/layout/placeholder";

export default function Page() {
  return (
    <PageShell title="平台与 Recipe" description="管理数据源与下发给插件的采集脚本">
      <Placeholder milestone="M1" items={["平台列表与字段模板","Recipe JSON 编辑、版本与激活","Recipe 试跑（M2）"]} />
    </PageShell>
  );
}
