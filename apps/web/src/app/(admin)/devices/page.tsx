import { and, db, desc, eq, gt, isNull, jobs, pairingCodes, devices, sql } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { ConfirmForm } from "@/components/common/confirm-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createPairingCodeAction, deleteDeviceAction, setDeviceStatusAction } from "@/lib/actions/devices";
import { env } from "@/lib/env";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const ONLINE_SEC = 120;

async function load() {
  const d = db();
  const now = Date.now();
  const [devs, codes] = await Promise.all([
    d
      .select({
        id: devices.id,
        name: devices.name,
        status: devices.status,
        chromeVersion: devices.chromeVersion,
        extVersion: devices.extVersion,
        lastSeenAt: devices.lastSeenAt,
        createdAt: devices.createdAt,
        currentJobId: devices.currentJobId,
        currentJobUrl: jobs.url,
        done: sql<number>`(select count(*) from job_runs r where r.device_id = ${devices.id} and r.status = 'done')`,
        failed: sql<number>`(select count(*) from job_runs r where r.device_id = ${devices.id} and r.status in ('failed','auth_required'))`,
      })
      .from(devices)
      .leftJoin(jobs, eq(jobs.id, devices.currentJobId))
      .orderBy(desc(devices.createdAt)),
    d
      .select({ code: pairingCodes.code, expiresAt: pairingCodes.expiresAt, createdAt: pairingCodes.createdAt })
      .from(pairingCodes)
      .where(and(isNull(pairingCodes.usedAt), gt(pairingCodes.expiresAt, new Date())))
      .orderBy(desc(pairingCodes.createdAt)),
  ]);
  return { devs, codes, now };
}

export default async function DevicesPage() {
  const { devs, codes, now } = await load();

  return (
    <PageShell title="设备" description="每个安装了 BB Collector 插件的 Chrome 是一台设备；设备用配对码换取 token">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader>
            <CardTitle>配对新设备</CardTitle>
            <CardDescription>
              1. 在 Chrome 打开 <code>chrome://extensions</code>，开启开发者模式，“加载已解压的扩展程序”选择 <code>apps/extension/dist/chrome-mv3</code>。
              <br />
              2. 打开插件的选项页，填入服务器地址 <code>{env.APP_URL}</code> 与下面的配对码。配对码 15 分钟内有效，只能用一次。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <form action={createPairingCodeAction}>
              <Button type="submit">生成配对码</Button>
            </form>
            {codes.length === 0 ? (
              <p className="text-sm text-muted-foreground">当前没有可用的配对码。</p>
            ) : (
              <ul className="grid gap-2">
                {codes.map((c) => (
                  <li key={c.code} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="font-mono text-lg tracking-widest">{c.code}</span>
                    <span className="text-xs text-muted-foreground">{Math.max(0, Math.round((c.expiresAt.getTime() - now) / 60000))} 分钟后过期</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>设备列表（{devs.length}）</CardTitle>
            <CardDescription>最近 2 分钟有请求视为在线。暂停后设备不再领取任务；遇到登录页时服务端会自动暂停设备。</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>当前任务</TableHead>
                  <TableHead className="text-right">完成 / 失败</TableHead>
                  <TableHead>最近活动</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      还没有设备。生成配对码并在插件里完成配对。
                    </TableCell>
                  </TableRow>
                ) : (
                  devs.map((v) => {
                    const online = v.lastSeenAt && now - v.lastSeenAt.getTime() < ONLINE_SEC * 1000;
                    return (
                      <TableRow key={v.id}>
                        <TableCell>
                          <div className="font-medium">{v.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Chrome {v.chromeVersion ?? "?"} · 插件 {v.extVersion ?? "?"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {v.status === "active" ? <Badge variant="secondary">启用</Badge> : v.status === "paused" ? <Badge className="bg-amber-100 text-amber-800">已暂停</Badge> : <Badge variant="destructive">已吊销</Badge>}
                            {online ? <Badge className="bg-emerald-100 text-emerald-800">在线</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-56 truncate font-mono text-xs">{v.currentJobUrl ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {v.done} / {v.failed}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(v.lastSeenAt)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {v.status !== "revoked" ? (
                              <form action={setDeviceStatusAction}>
                                <input type="hidden" name="id" value={v.id} />
                                <input type="hidden" name="status" value={v.status === "active" ? "paused" : "active"} />
                                <Button size="xs" variant="ghost" type="submit">
                                  {v.status === "active" ? "暂停" : "恢复"}
                                </Button>
                              </form>
                            ) : null}
                            {v.status !== "revoked" ? (
                              <ConfirmForm
                                action={setDeviceStatusAction}
                                fields={{ id: v.id, status: "revoked" }}
                                title={`吊销设备 ${v.name}？`}
                                description="该设备的 token 立即失效，需要重新配对才能继续使用。"
                                confirmLabel="吊销"
                                triggerLabel="吊销"
                                triggerVariant="ghost"
                                triggerSize="xs"
                              />
                            ) : (
                              <ConfirmForm
                                action={deleteDeviceAction}
                                fields={{ id: v.id }}
                                title={`删除设备 ${v.name}？`}
                                description="执行记录中对该设备的引用会被清空。"
                                confirmLabel="删除"
                                triggerLabel="删除"
                                triggerVariant="ghost"
                                triggerSize="xs"
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
