"use client";

import { useActionState } from "react";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { collectByIdsAction } from "@/lib/actions/jobs";

/** "按 ID 采集": new job for an unknown ID, re-collect for a known one; both go to the front of the queue. */
export function CollectByIdForm({ platforms, defaultPlatformId }: { platforms: { id: string; name: string }[]; defaultPlatformId: string }) {
  const [state, action, pending] = useActionState(collectByIdsAction, undefined);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>按 ID 采集</CardTitle>
        <CardDescription>
          输入 Donor ID（可多个，用空格、逗号或换行分隔，也可直接粘贴详情页 URL）。已有任务的 ID 会重新采集并覆盖记录，没有任务的会新建任务；都排在队首。来源页已不存在的 ID 会把记录标记为“已下架”。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-wrap items-start gap-2">
          <NativeSelect name="platformId" defaultValue={defaultPlatformId} aria-label="数据源" required>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <Textarea name="ids" placeholder="例如：14520, 16495" rows={1} className="min-h-9 min-w-64 flex-1" required />
          <Button type="submit" disabled={pending}>
            {pending ? "提交中…" : "采集 / 重采"}
          </Button>
          {state?.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
          {state?.message ? <p className="w-full text-sm text-muted-foreground">{state.message}</p> : null}
          {state?.problems?.length ? (
            <ul className="w-full list-disc pl-5 text-sm text-destructive">
              {state.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
