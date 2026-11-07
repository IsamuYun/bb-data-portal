"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createDryRunAction } from "@/lib/actions/jobs";

export function DryRunForm({ platformId, placeholder }: { platformId: string; placeholder: string }) {
  const [state, action, pending] = useActionState(createDryRunAction, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>试跑</CardTitle>
        <CardDescription>用当前激活的 Recipe 采集一个 URL，结果只记在执行日志里，不写入记录。需要有在线的插件设备。</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="platformId" value={platformId} />
          <Input name="url" placeholder={placeholder} className="min-w-72 flex-1" required />
          <Button type="submit" disabled={pending}>
            {pending ? "创建中…" : "试跑"}
          </Button>
          {state?.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
