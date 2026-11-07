import Link from "next/link";
import { and, asc, count, db, dictionaryEntries, eq, ilike, isNull, or, platforms, recordTranslations, type SQL } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { NativeSelect } from "@/components/common/native-select";
import { Pagination, parsePage } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { first } from "@/lib/format";
import { fieldMode } from "@/lib/translate/core";
import { translationModelLabel } from "@/lib/translate/llm";
import { EntryRow } from "./entry-row";
import { AddEntryForm, TranslateAllForm } from "./tools";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function DictionaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const fieldKey = first(sp.fieldKey);
  const blank = first(sp.blank) === "1";
  const page = parsePage(sp.page);
  const d = db();

  const where: SQL[] = [eq(dictionaryEntries.lang, "zh")];
  if (q) where.push(or(ilike(dictionaryEntries.source, `%${q}%`), ilike(dictionaryEntries.target, `%${q}%`))!);
  if (fieldKey) where.push(eq(dictionaryEntries.fieldKey, fieldKey === "_" ? "" : fieldKey));
  if (blank) where.push(isNull(dictionaryEntries.target));
  const cond = and(...where);

  const [rows, [{ total }], [{ blanks }], [{ pendingRecords }], ps, keys] = await Promise.all([
    d.select().from(dictionaryEntries).where(cond).orderBy(asc(dictionaryEntries.fieldKey), asc(dictionaryEntries.source)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    d.select({ total: count() }).from(dictionaryEntries).where(cond),
    d.select({ blanks: count() }).from(dictionaryEntries).where(and(eq(dictionaryEntries.lang, "zh"), isNull(dictionaryEntries.target))),
    d.select({ pendingRecords: count() }).from(recordTranslations).where(eq(recordTranslations.pending, true)),
    d.select({ id: platforms.id, name: platforms.name, fieldSchema: platforms.fieldSchema }).from(platforms).orderBy(platforms.name),
    d.selectDistinct({ fieldKey: dictionaryEntries.fieldKey }).from(dictionaryEntries).orderBy(dictionaryEntries.fieldKey),
  ]);
  const fieldKeys = Array.from(new Set([...keys.map((k) => k.fieldKey), ...ps.flatMap((p) => p.fieldSchema.filter((f) => fieldMode(f) === "dict").map((f) => f.key))])).filter(Boolean).sort();

  return (
    <PageShell title="翻译字典" description="固定词条（颜色、族裔、学历、专业等）在采集入库时按字典翻译；标题、简介等自由文本由模型翻译并缓存">
      <Card>
        <CardHeader>
          <CardTitle>批量操作</CardTitle>
          <CardDescription>
            空词条 {blanks} 条 · 待补全翻译的记录 {pendingRecords} 条。新采集的记录会自动翻译；修改字典后点“翻译全部记录”并勾选“强制重算”以应用到已有记录（模型译文会沿用缓存，不重复计费）。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <TranslateAllForm platforms={ps.map((p) => ({ id: p.id, name: p.name }))} modelLabel={translationModelLabel()} />
          <AddEntryForm fieldKeys={fieldKeys} />
        </CardContent>
      </Card>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <Input name="q" defaultValue={q} placeholder="搜索原文或译文" className="w-64" />
        <NativeSelect name="fieldKey" defaultValue={fieldKey} aria-label="字段">
          <option value="">全部字段</option>
          <option value="_">（通用）</option>
          {fieldKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="blank" value="1" defaultChecked={blank} /> 只看未翻译
        </label>
        <Button type="submit" variant="secondary">
          筛选
        </Button>
        {q || fieldKey || blank ? (
          <Button variant="ghost" render={<Link href="/dictionary" />}>
            清除
          </Button>
        ) : null}
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">字段</TableHead>
                <TableHead>原文</TableHead>
                <TableHead className="w-96">译文</TableHead>
                <TableHead className="w-16">来源</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    没有词条。
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => <EntryRow key={r.id} entry={{ id: r.id, fieldKey: r.fieldKey, source: r.source, target: r.target, origin: r.origin }} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Pagination page={page} total={total} params={{ q, fieldKey, blank: blank ? "1" : undefined }} pageSize={PAGE_SIZE} />
    </PageShell>
  );
}
