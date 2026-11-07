"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveManualCarriersAction } from "@/lib/actions/records";

export type CarrierRow = { gene: string; disease: string; diseaseEn: string; status: string };
export type CarrierEditorValue = { mode: "auto" | "none" | "carrier"; panel: string; items: CarrierRow[] };

/** Qualifiers printed after the disease ("· 静默携带者"); empty = plain carrier. */
const STATUSES = ["", "静默携带者", "可能携带者", "携带风险升高"];
const EMPTY: CarrierRow = { gene: "", disease: "", diseaseEn: "", status: "" };

export function CarrierEditor({ recordId, initial, autoSummary }: { recordId: string; initial: CarrierEditorValue; autoSummary: string }) {
  const router = useRouter();
  const [v, setV] = useState<CarrierEditorValue>(initial.items.length ? initial : { ...initial, items: [{ ...EMPTY }] });
  const [pending, start] = useTransition();
  const setRow = (i: number, patch: Partial<CarrierRow>) => setV((x) => ({ ...x, items: x.items.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const save = (mode = v.mode) =>
    start(async () => {
      try {
        const items = v.items.filter((r) => r.gene.trim() || r.disease.trim());
        await saveManualCarriersAction(recordId, mode === "carrier" ? { mode, panel: v.panel, items } : mode === "none" ? { mode, panel: v.panel } : { mode });
        if (mode === "auto") setV((x) => ({ ...x, mode: "auto" }));
        toast.success(mode === "auto" ? "已恢复为自动解析结果" : "已保存，导出资料将使用人工整理结果");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    });

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
        <Label htmlFor="mode">结果</Label>
        <NativeSelect id="mode" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value as CarrierEditorValue["mode"] })}>
          <option value="auto">使用自动解析结果（{autoSummary}）</option>
          <option value="none">未检出携带者</option>
          <option value="carrier">携带者阳性（按下表）</option>
        </NativeSelect>
        <Label htmlFor="panel">检测项目</Label>
        <Input id="panel" value={v.panel} disabled={v.mode === "auto"} placeholder="例如 Expanded Genetic Disease Carrier Screening Panel (514 diseases)" onChange={(e) => setV({ ...v, panel: e.target.value })} />
      </div>

      {v.mode === "carrier" ? (
        <div className="grid gap-2">
          <div className="hidden grid-cols-[8rem_1fr_1fr_9rem_2rem] gap-2 text-xs text-muted-foreground sm:grid">
            <span>基因</span>
            <span>疾病（中文，导出显示）</span>
            <span>疾病英文名（可选）</span>
            <span>携带类型</span>
            <span />
          </div>
          {v.items.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_9rem_2rem]">
              <Input aria-label="基因" value={r.gene} placeholder="ABCA4" onChange={(e) => setRow(i, { gene: e.target.value })} />
              <Input aria-label="疾病中文名" value={r.disease} placeholder="Stargardt病" onChange={(e) => setRow(i, { disease: e.target.value })} />
              <Input aria-label="疾病英文名" value={r.diseaseEn} placeholder="Stargardt Disease" onChange={(e) => setRow(i, { diseaseEn: e.target.value })} />
              <NativeSelect aria-label="携带类型" value={r.status} onChange={(e) => setRow(i, { status: e.target.value })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s || "携带者"}
                  </option>
                ))}
              </NativeSelect>
              <Button variant="ghost" size="icon" aria-label="删除此行" onClick={() => setV({ ...v, items: v.items.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" size="sm" onClick={() => setV({ ...v, items: [...v.items, { ...EMPTY }] })}>
              <Plus data-icon="inline-start" />
              添加一行
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => save()}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <Button variant="outline" render={<a href={`/api/records/${recordId}/profile?format=pdf`} />}>
          导出资料 PDF
        </Button>
        <Button variant="outline" render={<a href={`/api/records/${recordId}/profile?format=html&inline=1`} target="_blank" rel="noreferrer" />}>
          预览 HTML
        </Button>
      </div>
    </div>
  );
}
