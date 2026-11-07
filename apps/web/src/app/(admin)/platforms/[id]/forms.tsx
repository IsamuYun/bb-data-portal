"use client";

import { ActionForm } from "@/components/common/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRecipeVersionAction, saveFieldSchemaAction, updatePlatformAction } from "@/lib/actions/platforms";

export function PlatformForm({ platform }: { platform: { id: string; slug: string; name: string; baseUrl: string; enabled: boolean } }) {
  return (
    <ActionForm action={updatePlatformAction}>
      <input type="hidden" name="id" value={platform.id} />
      <div className="grid gap-2">
        <Label htmlFor="slug">slug</Label>
        <Input id="slug" name="slug" defaultValue={platform.slug} required pattern="[a-z0-9][a-z0-9-]+" />
        <p className="text-xs text-muted-foreground">插件按 slug 匹配 Recipe；改动后需同步 Recipe JSON 中的 platform。</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="name">名称</Label>
        <Input id="name" name="name" defaultValue={platform.name} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="baseUrl">站点 URL</Label>
        <Input id="baseUrl" name="baseUrl" type="url" defaultValue={platform.baseUrl} required />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={platform.enabled} /> 启用（停用后插件不再领取该平台任务）
      </label>
    </ActionForm>
  );
}

export function FieldSchemaForm({ platformId, initialJson }: { platformId: string; initialJson: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>字段模板</CardTitle>
        <CardDescription>
          决定记录列表与导出的列顺序。数组元素：<code>{`{ "key": "height", "label": "身高", "type": "string" }`}</code>，type 可选 string / number / string[] / text / url / json（结构化值，如对象数组，详情页显示为表格，不翻译）。可选 <code>translate</code>：<code>dict</code> 固定词条走字典（string / string[] 默认）、<code>llm</code> 自由文本走模型（text 默认）、<code>none</code> 不翻译（number / url 默认，编号、身高等也应设为 none）。key 需与 Recipe extract 的字段名一致。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={saveFieldSchemaAction} submitLabel="保存字段模板">
          <input type="hidden" name="id" value={platformId} />
          <Textarea name="json" defaultValue={initialJson} rows={18} className="font-mono text-xs" spellCheck={false} />
        </ActionForm>
      </CardContent>
    </Card>
  );
}

export function NewRecipeForm({ platformId, slug, nextVersion, initialJson }: { platformId: string; slug: string; nextVersion: number; initialJson: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>新建版本 v{nextVersion}</CardTitle>
        <CardDescription>
          以当前激活版本为底稿编辑。保存时按 Recipe DSL 校验；<code>platform</code> 固定为 {slug}，<code>version</code> 自动分配。试跑功能在 M2 插件完成后开放。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={createRecipeVersionAction} submitLabel={`保存为 v${nextVersion}`} successMessage="已创建新版本">
          <input type="hidden" name="platformId" value={platformId} />
          <Textarea name="json" defaultValue={initialJson} rows={26} className="font-mono text-xs" spellCheck={false} />
          <div className="grid gap-2">
            <Label htmlFor="note">版本说明</Label>
            <Input id="note" name="note" placeholder="例如：修正身高 selector" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="activate" /> 保存后立即激活
          </label>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
