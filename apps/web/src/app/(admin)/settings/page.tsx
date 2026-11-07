import Link from "next/link";
import { count, db, devices, eq, media, records } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { findExtensionZip } from "@/lib/ext/zip";
import { fmtDate } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import { translationModelLabel } from "@/lib/translate/llm";
import { PasswordForm } from "./password-form";
import pkg from "../../../../package.json";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await getSessionUser();
  const zip = findExtensionZip();
  const d = db();
  const [[{ activeDevices }], [{ recordCount }], [{ mediaCount }]] = await Promise.all([
    d.select({ activeDevices: count() }).from(devices).where(eq(devices.status, "active")),
    d.select({ recordCount: count() }).from(records),
    d.select({ mediaCount: count() }).from(media),
  ]);
  const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

  return (
    <PageShell title="设置" description="插件下载与配对、服务器地址、账号与系统信息">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Chrome 插件</CardTitle>
            <CardDescription>通用采集执行器，站点逻辑全部由后台 Recipe 下发，插件本身无需随站点更新</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {zip ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button render={<a href="/api/ext/download" />}>下载插件 zip</Button>
                <span className="text-muted-foreground">
                  BB Collector v{zip.version || "?"} · {fmtSize(zip.size)} · 构建于 {fmtDate(zip.mtime)}
                </span>
              </div>
            ) : (
              <p className="text-destructive">尚未构建插件：本地运行 <code>pnpm --filter @bb/extension zip</code>，或重新构建 docker 镜像。</p>
            )}
            <ol className="list-decimal space-y-1 pl-5">
              <li>下载后解压到一个固定目录（删除该目录插件会失效）。</li>
              <li>
                Chrome 打开 <code>chrome://extensions</code>，右上角开启“开发者模式”，点“加载已解压的扩展程序”，选择解压出的目录。
              </li>
              <li>
                在{" "}
                <Link href="/devices" className="underline">
                  设备
                </Link>{" "}
                页点“生成配对码”（15 分钟内有效，一次性）。
              </li>
              <li>
                右键插件图标 → “选项”，填写服务器地址 <code>{env.APP_URL}</code>、设备名称和配对码，点“配对”。
              </li>
              <li>配对成功后插件自动领取任务；采集需要登录的站点时，先在同一个 Chrome 里登录该站点。</li>
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>服务器地址</CardTitle>
            <CardDescription>插件通过该地址访问 API，必须能从运行插件的电脑访问到</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              当前 <code>APP_URL</code>：<code>{env.APP_URL}</code>
            </p>
            <p className="text-muted-foreground">
              如需局域网或公网访问，修改 <code>.env</code> 中的 <code>APP_URL</code>（例如 <code>http://192.168.1.10:3000</code>）后执行 <code>docker compose up -d</code>；配对时在插件里填同样的地址。本地测试页平台的采集 URL 也基于此地址生成。
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>管理员账号</CardTitle>
            <CardDescription>
              当前登录：{me?.name}（{me?.email}）。首次部署后请修改 .env 里的默认密码。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>系统信息</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">后台版本</dt>
              <dd>v{pkg.version}</dd>
              <dt className="text-muted-foreground">在线设备</dt>
              <dd>{activeDevices}</dd>
              <dt className="text-muted-foreground">记录 / 媒体</dt>
              <dd>
                {recordCount} / {mediaCount}
              </dd>
              <dt className="text-muted-foreground">翻译模型</dt>
              <dd>{translationModelLabel() ?? "未配置（仅字典翻译）"}</dd>
              <dt className="text-muted-foreground">媒体目录</dt>
              <dd>
                <code>{env.MEDIA_DIR}</code>
              </dd>
              <dt className="text-muted-foreground">导出目录</dt>
              <dd>
                <code>{env.EXPORT_DIR}</code>
              </dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              备份：<code>scripts/backup.sh</code> 会导出数据库并打包媒体 / 导出卷；恢复用 <code>scripts/restore.sh &lt;备份目录&gt;</code>。详见 README。
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
