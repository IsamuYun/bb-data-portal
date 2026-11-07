"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileTextIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MediaItem = { id: string; kind: string; mime: string; v: string };
export type MediaGroup = { key: string; label: string; doc: boolean; items: MediaItem[] };
export type MediaField = { key: string; label: string; doc: boolean };

/** Media of one record, grouped by field, with manual add / replace / delete. */
export function MediaManager({ recordId, groups, fields }: { recordId: string; groups: MediaGroup[]; fields: MediaField[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // What the hidden file input is currently picking for.
  const target = useRef<{ field?: string; replaceId?: string; doc: boolean }>({ doc: false });
  const missing = fields.filter((f) => !groups.some((g) => g.key === f.key));
  const [newField, setNewField] = useState(missing[0]?.key ?? "");

  const pick = (t: { field?: string; replaceId?: string; doc: boolean }) => {
    target.current = t;
    const el = input.current!;
    el.accept = t.doc ? "application/pdf" : "image/*";
    el.multiple = !t.replaceId && !t.doc;
    el.value = "";
    el.click();
  };

  const upload = (files: File[]) => {
    const t = target.current;
    setBusy(t.replaceId ?? t.field ?? null);
    start(async () => {
      let ok = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        if (t.replaceId) fd.append("replaceId", t.replaceId);
        else if (t.field) fd.append("field", t.field);
        const res = await fetch(`/api/records/${recordId}/media`, { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { error?: string; parsed?: boolean };
        if (!res.ok) {
          toast.error(`${file.name}：${body.error ?? `上传失败（${res.status}）`}`);
          continue;
        }
        ok++;
        if (body.parsed) toast.success("报告已解析，字段已更新；翻译稍后自动刷新");
      }
      if (ok) toast.success(t.replaceId ? "已替换" : `已上传 ${ok} 个文件`);
      setBusy(null);
      router.refresh();
    });
  };

  const remove = (m: MediaItem, doc: boolean) => {
    if (!confirm(doc ? "删除这份报告？已从报告解析出的字段会保留。" : "删除这张照片？")) return;
    setBusy(m.id);
    start(async () => {
      const res = await fetch(`/api/records/${recordId}/media?mediaId=${m.id}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) toast.success("已删除");
      else toast.error(body.error ?? "删除失败");
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4">
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) upload(files);
        }}
      />
      {groups.length === 0 ? <p className="text-sm text-muted-foreground">没有媒体文件。</p> : null}
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {g.label}（{g.items.length}）
            </p>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => pick({ field: g.key, doc: g.doc })}>
              <PlusIcon /> {busy === g.key ? "上传中…" : g.doc ? "添加 PDF" : "添加照片"}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {g.items.map((m) => {
              const src = `/api/media/${m.id}?v=${m.v}`;
              return (
                <div key={m.id} className={`overflow-hidden rounded-md border ${busy === m.id ? "opacity-50" : ""}`}>
                  <a href={src} target="_blank" rel="noreferrer" className="block">
                    {m.kind === "photo" || m.kind === "screenshot" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={g.label} className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="flex aspect-square flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                        <FileTextIcon className="size-6" />
                        {m.mime === "application/pdf" ? "PDF 报告" : m.kind}
                      </div>
                    )}
                  </a>
                  <div className="flex border-t">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => pick({ replaceId: m.id, doc: g.doc })}
                      className="flex flex-1 items-center justify-center gap-1 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      <RefreshCwIcon className="size-3" /> 替换
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(m, g.doc)}
                      className="flex flex-1 items-center justify-center gap-1 border-l py-1 text-xs text-destructive hover:bg-muted disabled:opacity-50"
                    >
                      <Trash2Icon className="size-3" /> 删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {missing.length ? (
        <div className="flex items-center gap-2 border-t pt-3">
          <select
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
            aria-label="上传到字段"
          >
            {missing.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
                {f.doc ? "（PDF）" : "（照片）"}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={pending || !newField} onClick={() => pick({ field: newField, doc: !!missing.find((f) => f.key === newField)?.doc })}>
            <PlusIcon /> {busy === newField ? "上传中…" : "上传"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
