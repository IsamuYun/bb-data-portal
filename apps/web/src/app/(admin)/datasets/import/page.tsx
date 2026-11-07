import { db, eq, platforms } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { ImportWizard } from "./import-wizard";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ps = await db().select({ id: platforms.id, name: platforms.name, slug: platforms.slug }).from(platforms).where(eq(platforms.enabled, true)).orderBy(platforms.name);
  return (
    <PageShell title="导入数据集" description="三步：上传文件 → 列映射 → 生成任务">
      <ImportWizard platforms={ps} />
    </PageShell>
  );
}
