import Link from "next/link";
import { notFound } from "next/navigation";
import { count, db, desc, eq, jobs, platforms, recipes, records, users } from "@bb/db";
import { PageShell } from "@/components/layout/page-shell";
import { ConfirmForm } from "@/components/common/confirm-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { activateRecipeAction, deletePlatformAction } from "@/lib/actions/platforms";
import { fmtDate } from "@/lib/format";
import { recipeToPrettyJson } from "@/lib/recipe-json";
import { FieldSchemaForm, NewRecipeForm, PlatformForm } from "./forms";
import { DryRunForm } from "./dry-run-form";
import { ListingForm } from "./listing-form";

export const dynamic = "force-dynamic";

export default async function PlatformDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const [p] = await d.select().from(platforms).where(eq(platforms.id, id)).limit(1);
  if (!p) notFound();
  const [versions, [{ jobCount }], [{ recordCount }]] = await Promise.all([
    d
      .select({ id: recipes.id, version: recipes.version, isActive: recipes.isActive, note: recipes.note, createdAt: recipes.createdAt, json: recipes.json, author: users.name })
      .from(recipes)
      .leftJoin(users, eq(users.id, recipes.createdBy))
      .where(eq(recipes.platformId, id))
      .orderBy(desc(recipes.version)),
    d.select({ jobCount: count() }).from(jobs).where(eq(jobs.platformId, id)),
    d.select({ recordCount: count() }).from(records).where(eq(records.platformId, id)),
  ]);
  const active = versions.find((v) => v.isActive) ?? versions[0];

  return (
    <PageShell
      title={p.name}
      description={`${p.slug} · ${p.baseUrl}`}
      actions={
        <>
          <Button variant="outline" render={<Link href="/platforms" />}>
            返回列表
          </Button>
          <ConfirmForm
            action={deletePlatformAction}
            fields={{ id }}
            title={`删除平台 ${p.name}？`}
            description={`将级联删除该平台的 ${jobCount} 个任务、${recordCount} 条记录与全部 Recipe，不可恢复。`}
            confirmLabel="删除"
            triggerLabel="删除平台"
            triggerVariant="destructive"
          />
        </>
      }
    >
      <Tabs defaultValue="recipes">
        <TabsList>
          <TabsTrigger value="recipes">Recipe（{versions.length}）</TabsTrigger>
          <TabsTrigger value="fields">字段模板（{p.fieldSchema.length}）</TabsTrigger>
          <TabsTrigger value="basic">基本信息</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="lg:col-span-2">
            <DryRunForm platformId={id} placeholder={`${p.baseUrl.replace(/\/$/, "")}/...`} />
          </div>
          {versions.find((v) => v.isActive)?.json.listing ? (
            <div className="lg:col-span-2">
              <ListingForm platformId={id} match={versions.find((v) => v.isActive)!.json.listing!.match} />
            </div>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>版本</CardTitle>
              <CardDescription>插件总是取“激活”的版本；激活会立即影响后续下发的任务。</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>版本</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead>创建</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        还没有 Recipe，在右侧新建第一个版本。
                      </TableCell>
                    </TableRow>
                  ) : (
                    versions.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">
                          v{v.version} {v.isActive ? <Badge className="ml-1">激活</Badge> : null}
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground">{v.note ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(v.createdAt)}
                          {v.author ? ` · ${v.author}` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          {v.isActive ? null : (
                            <form action={activateRecipeAction}>
                              <input type="hidden" name="id" value={v.id} />
                              <Button size="sm" variant="outline" type="submit">
                                激活
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <NewRecipeForm platformId={id} slug={p.slug} nextVersion={(versions[0]?.version ?? 0) + 1} initialJson={active ? recipeToPrettyJson(active.json) : defaultRecipe(p)} />
        </TabsContent>

        <TabsContent value="fields">
          <FieldSchemaForm platformId={id} initialJson={JSON.stringify(p.fieldSchema, null, 2)} />
        </TabsContent>

        <TabsContent value="basic">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
            </CardHeader>
            <CardContent>
              <PlatformForm platform={{ id: p.id, slug: p.slug, name: p.name, baseUrl: p.baseUrl, enabled: p.enabled }} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function defaultRecipe(p: { slug: string; baseUrl: string }) {
  const host = p.baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\./g, "\\\\.");
  return JSON.stringify(
    {
      platform: p.slug,
      version: 1,
      match: `^https://${host}/`,
      settings: { delayMs: [3000, 8000], timeoutMs: 30000, maxRetries: 2 },
      steps: [
        { op: "navigate", url: "{{job.url}}" },
        { op: "waitFor", selector: "h1", timeoutMs: 15000 },
        { op: "extract", fields: { title: { selector: "h1", trim: true } } },
        { op: "emit" },
      ],
    },
    null,
    2,
  );
}
