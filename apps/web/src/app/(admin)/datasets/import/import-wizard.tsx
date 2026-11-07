"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createDatasetFromImport, type CreateDatasetResult } from "@/lib/actions/datasets";
import type { ImportMapping } from "@/lib/import/parse";

type Parsed = {
  token: string;
  fileName: string;
  sheetName: string;
  headers: string[];
  rowCount: number;
  preview: string[][];
  mapping: ImportMapping & { preset?: string };
};

export function ImportWizard({ platforms }: { platforms: { id: string; name: string; slug: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [platformId, setPlatformId] = useState(platforms[0]?.id ?? "");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({ urlColumn: "", externalIdColumn: "", seedColumns: [] });
  const [name, setName] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Extract<CreateDatasetResult, { ok: true }> | null>(null);

  const platform = platforms.find((p) => p.id === platformId);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/imports/parse", { method: "POST", body: fd });
      const body = (await res.json()) as Parsed | { error: string };
      if (!res.ok || "error" in body) throw new Error("error" in body ? body.error : "上传失败");
      setParsed(body);
      setMapping({ urlColumn: body.mapping.urlColumn, externalIdColumn: body.mapping.externalIdColumn, seedColumns: body.mapping.seedColumns });
      setName(`${platform?.name ?? ""} ${new Date().toISOString().slice(0, 10)} · ${body.fileName}`.trim());
      setStep(2);
      if (body.mapping.preset) toast.success(`已识别为 ${body.mapping.preset} 格式，自动填好了列映射`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  const previewJobs = useMemo(() => {
    if (!parsed) return [];
    const ui = parsed.headers.indexOf(mapping.urlColumn);
    const ii = mapping.externalIdColumn ? parsed.headers.indexOf(mapping.externalIdColumn) : -1;
    return parsed.preview.map((r) => ({ url: ui >= 0 ? r[ui] : "", id: ii >= 0 ? r[ii] : "（从 URL 推断）" }));
  }, [parsed, mapping]);

  function submit() {
    if (!parsed) return;
    start(async () => {
      const r = await createDatasetFromImport({ token: parsed.token, fileName: parsed.fileName, platformId, name, mapping, skipExisting });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult(r);
      setStep(3);
      router.refresh();
    });
  }

  const toggleSeed = (h: string) =>
    setMapping((m) => ({ ...m, seedColumns: m.seedColumns.includes(h) ? m.seedColumns.filter((x) => x !== h) : [...m.seedColumns, h] }));

  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap gap-2 text-sm">
        {["上传文件", "列映射", "完成"].map((t, i) => (
          <li key={t} className="flex items-center gap-2">
            <Badge variant={step === i + 1 ? "default" : step > i + 1 ? "secondary" : "outline"}>{i + 1}</Badge>
            <span className={step === i + 1 ? "font-medium" : "text-muted-foreground"}>{t}</span>
            {i < 2 ? <span className="text-muted-foreground">→</span> : null}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>选择平台并上传文件</CardTitle>
            <CardDescription>支持 .xlsx / .csv，第一行必须是表头。最大 20MB。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="platform">平台</Label>
              <NativeSelect id="platform" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.slug}）
                  </option>
                ))}
              </NativeSelect>
              {platforms.length === 0 ? (
                <p className="text-sm text-destructive">
                  没有启用的平台，请先到 <Link href="/platforms" className="underline">平台页</Link> 创建。
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="file">文件</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls,.csv,.tsv"
                disabled={uploading || !platformId}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              {uploading ? <p className="text-sm text-muted-foreground">解析中…</p> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && parsed ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <CardHeader>
              <CardTitle>列映射</CardTitle>
              <CardDescription>
                {parsed.fileName} · 工作表“{parsed.sheetName}” · {parsed.rowCount} 行 · {parsed.headers.length} 列
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">数据集名称</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="urlColumn">URL 列（必选）</Label>
                <NativeSelect id="urlColumn" value={mapping.urlColumn} onChange={(e) => setMapping((m) => ({ ...m, urlColumn: e.target.value, seedColumns: m.seedColumns.filter((c) => c !== e.target.value) }))}>
                  <option value="">— 请选择 —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="idColumn">外部 ID 列</Label>
                <NativeSelect id="idColumn" value={mapping.externalIdColumn} onChange={(e) => setMapping((m) => ({ ...m, externalIdColumn: e.target.value }))}>
                  <option value="">从 URL 自动推断（取最后一段数字）</option>
                  {parsed.headers
                    .filter((h) => h !== mapping.urlColumn)
                    .map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">同一平台内 ID 唯一；采集结果以 ID 作为记录主键。</p>
              </div>
              <div className="grid gap-2">
                <Label>随任务保存的种子列</Label>
                <div className="flex flex-wrap gap-2">
                  {parsed.headers
                    .filter((h) => h !== mapping.urlColumn)
                    .map((h) => (
                      <label key={h} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                        <input type="checkbox" checked={mapping.seedColumns.includes(h)} onChange={() => toggleSeed(h)} /> {h}
                      </label>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">种子列存入任务的 seed，用于和采集结果做一致性校验，不会覆盖采集字段。</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} /> 跳过该平台已存在任务的 ID
              </label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setStep(1); setParsed(null); }} disabled={pending}>
                  重新上传
                </Button>
                <Button onClick={submit} disabled={pending || !mapping.urlColumn || !name.trim()}>
                  {pending ? "生成中…" : `生成任务（最多 ${parsed.rowCount} 个）`}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>预览（前 {parsed.preview.length} 行）</CardTitle>
              <CardDescription>按当前映射解析出的 URL 与 ID</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>外部 ID</TableHead>
                    <TableHead>URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewJobs.map((j, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 2}</TableCell>
                      <TableCell className="font-mono text-xs">{j.id || <span className="text-destructive">空</span>}</TableCell>
                      <TableCell className="max-w-80 truncate font-mono text-xs">{j.url || <span className="text-destructive">空</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">原始表头与首行</p>
                <div className="grid gap-1 text-xs">
                  {parsed.headers.map((h, i) => (
                    <div key={h} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                      <span className="truncate font-medium">{h}</span>
                      <span className="truncate text-muted-foreground">{parsed.preview[0]?.[i] ?? ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 3 && result ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>导入完成</CardTitle>
            <CardDescription>已生成 {result.created} 个待处理任务</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {result.skippedExisting > 0 ? <p>跳过了 {result.skippedExisting} 行：该平台已有相同 ID 的任务。</p> : null}
            {result.skippedRows.length > 0 ? (
              <div>
                <p className="mb-1">跳过了 {result.skippedRows.length} 行无效数据：</p>
                <ul className="max-h-48 list-disc overflow-auto pl-5 text-xs text-muted-foreground">
                  {result.skippedRows.map((s) => (
                    <li key={s.row}>
                      第 {s.row} 行：{s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button render={<Link href={`/jobs?datasetId=${result.datasetId}`} />}>查看任务</Button>
              <Button variant="outline" render={<Link href="/datasets" />}>
                返回数据集
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
