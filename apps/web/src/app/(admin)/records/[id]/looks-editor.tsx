"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/common/native-select";
import { setLooksAction } from "@/lib/actions/records";

/** 颜值 score picker: saves on change; the empty option clears the score. */
export function LooksEditor({ id, value }: { id: string; value: number | null }) {
  const [v, setV] = useState(value?.toString() ?? "");
  const [pending, start] = useTransition();
  return (
    <NativeSelect
      aria-label="颜值评分"
      value={v}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        const prev = v;
        setV(next);
        start(async () => {
          try {
            await setLooksAction(id, next ? Number(next) : null);
            toast.success(next ? `颜值已设为 ${next} 分` : "已清除颜值评分");
          } catch (err) {
            setV(prev);
            toast.error(err instanceof Error ? err.message : "保存失败");
          }
        });
      }}
    >
      <option value="">颜值：未评分</option>
      {Array.from({ length: 10 }, (_, i) => 10 - i).map((n) => (
        <option key={n} value={n}>
          颜值 {n} 分
        </option>
      ))}
    </NativeSelect>
  );
}
