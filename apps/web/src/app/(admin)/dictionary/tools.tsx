"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/common/native-select";
import { addDictionaryEntryAction, fillDictionaryWithModelAction, translateAllRecordsAction, type DictActionState } from "@/lib/actions/dictionary";

function useToast(state: DictActionState, ok: string) {
  useEffect(() => {
    if (state?.ok) toast.success(state.message ?? ok);
    if (state?.error) toast.error(state.error);
  }, [state, ok]);
}

export function AddEntryForm({ fieldKeys }: { fieldKeys: string[] }) {
  const [state, action, pending] = useActionState(addDictionaryEntryAction, undefined);
  useToast(state, "已添加词条");
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <NativeSelect name="fieldKey" aria-label="字段" defaultValue="">
        <option value="">（通用）</option>
        {fieldKeys.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </NativeSelect>
      <Input name="source" placeholder="原文" className="w-56" required />
      <Input name="target" placeholder="译文" className="w-56" />
      <Button type="submit" variant="secondary" disabled={pending}>
        添加词条
      </Button>
    </form>
  );
}

export function TranslateAllForm({ platforms, modelLabel }: { platforms: { id: string; name: string }[]; modelLabel: string | null }) {
  const hasKey = modelLabel !== null;
  const [state, action, pending] = useActionState(translateAllRecordsAction, undefined);
  useToast(state, "已翻译");
  const [fillState, fillAction, filling] = useActionState(fillDictionaryWithModelAction, undefined);
  useToast(fillState, "已填充");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <NativeSelect name="platformId" aria-label="平台" defaultValue="">
          <option value="">全部平台</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="force" /> 强制重算字典字段
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "翻译中…" : "翻译全部记录"}
        </Button>
      </form>
      <form action={fillAction}>
        <Button type="submit" variant="outline" disabled={filling || !hasKey} title={hasKey ? "" : "需要 QWEN_API_KEY 或 ANTHROPIC_API_KEY"}>
          {filling ? "填充中…" : "AI 填充空词条"}
        </Button>
      </form>
      <span className="text-xs text-muted-foreground">{hasKey ? `模型：${modelLabel}` : "未配置 QWEN_API_KEY / ANTHROPIC_API_KEY：只翻译字典字段，简介等自由文本保持原文"}</span>
    </div>
  );
}
