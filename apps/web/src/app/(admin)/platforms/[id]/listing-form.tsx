"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createListingJobAction } from "@/lib/actions/jobs";

export function ListingForm({ platformId, match }: { platformId: string; match: string }) {
  const [state, action, pending] = useActionState(createListingJobAction, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>从列表页生成任务</CardTitle>
        <CardDescription>
          先在插件所在的 Chrome 里登录站点、设好搜索条件，再把搜索结果页的地址粘贴到这里。插件会逐页翻完结果，把每位 donor 生成一个采集任务（已有任务的编号自动跳过），归入一个新数据集。
          列表页需匹配 <code className="text-xs">{match}</code>。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-wrap gap-2">
          <input type="hidden" name="platformId" value={platformId} />
          <Input name="url" placeholder="搜索结果页 URL" className="min-w-72 flex-[2]" required />
          <Input name="name" placeholder="数据集名称（可选）" className="min-w-40 flex-1" />
          <Button type="submit" disabled={pending}>
            {pending ? "创建中…" : "开始收集"}
          </Button>
          {state?.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
