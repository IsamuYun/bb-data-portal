"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reparseMedicalAction } from "@/lib/actions/records";

/** Re-parse the stored report PDFs with the current rules (no model). */
export function ReparseMedicalButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.append("id", id);
          try {
            const r = await reparseMedicalAction(fd);
            const parts = [
              r.familyRows ? `家族史 ${r.familyRows} 行` : "",
              r.questionnaire ? "问卷已更新" : "",
              r.geneticTests !== null ? `基因检测 ${r.geneticTests} 项` : "",
              r.portraits !== null ? `照片集人像 ${r.portraits} 张` : "",
            ].filter(Boolean);
            toast.success(`报告已重新解析：${parts.join("，") || "无变化"}；翻译稍后自动更新`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "解析失败");
          }
        })
      }
    >
      {pending ? "解析中…" : "重新解析报告"}
    </Button>
  );
}
