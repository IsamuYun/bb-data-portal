"use client";

import { ActionForm } from "@/components/common/action-form";
import { NativeSelect } from "@/components/common/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createExportAction } from "@/lib/actions/exports";

export function ExportForm({ platforms }: { platforms: { id: string; name: string }[] }) {
  return (
    <ActionForm action={createExportAction} submitLabel="开始导出" successMessage="已加入导出队列">
      <div className="grid gap-2">
        <Label htmlFor="platformId">平台</Label>
        <NativeSelect id="platformId" name="platformId" defaultValue={platforms[0]?.id}>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="type">格式</Label>
        <NativeSelect id="type" name="type" defaultValue="xlsx">
          <option value="xlsx">Excel（.xlsx，含 40×60 缩略图）</option>
          <option value="pdf">PDF（每条记录一张卡片）</option>
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="q">筛选（可选）</Label>
        <Input id="q" name="q" placeholder="与记录页相同：匹配 ID 或任意字段" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="withMediaOnly" className="size-4" />
        只导出有媒体（照片）的记录
      </label>
      <div className="grid gap-2">
        <Label htmlFor="lang">语言</Label>
        <NativeSelect id="lang" name="lang" defaultValue="zh">
          <option value="zh">中文（固定词条查字典；标题、简介等由模型翻译，需配置 QWEN_API_KEY）</option>
          <option value="en">英文原文（不翻译，导出采集到的原始内容）</option>
        </NativeSelect>
      </div>
    </ActionForm>
  );
}
