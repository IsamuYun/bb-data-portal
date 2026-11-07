"use server";

import { and, db, eq, platforms, recipes, sql, type FieldSchema } from "@bb/db";
import { recipeSchema } from "@bb/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "../require-user";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const platformInput = z.object({
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "slug 只能用小写字母、数字和连字符"),
  name: z.string().trim().min(1, "名称必填").max(100),
  baseUrl: z.string().trim().url("请输入完整的站点 URL"),
  enabled: z.boolean(),
});

const fieldSchemaInput = z.array(
  z.object({
    key: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "字段 key 必须是合法标识符"),
    label: z.string().trim().min(1),
    type: z.enum(["string", "number", "string[]", "text", "url", "json"]),
    translate: z.enum(["none", "dict", "llm"]).optional(),
  }),
);

function firstIssue(e: z.ZodError) {
  const i = e.issues[0];
  return i ? `${i.path.join(".") ? i.path.join(".") + ": " : ""}${i.message}` : "输入无效";
}

export async function createPlatformAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = platformInput.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    baseUrl: formData.get("baseUrl"),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = db();
  const dup = await d.select({ id: platforms.id }).from(platforms).where(eq(platforms.slug, parsed.data.slug)).limit(1);
  if (dup.length) return { error: `slug “${parsed.data.slug}” 已存在` };
  const [row] = await d.insert(platforms).values({ ...parsed.data, fieldSchema: [] }).returning({ id: platforms.id });
  revalidatePath("/platforms");
  redirect(`/platforms/${row.id}`);
}

export async function updatePlatformAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const parsed = platformInput.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    baseUrl: formData.get("baseUrl"),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = db();
  const dup = await d
    .select({ id: platforms.id })
    .from(platforms)
    .where(and(eq(platforms.slug, parsed.data.slug), sql`${platforms.id} <> ${id}`))
    .limit(1);
  if (dup.length) return { error: `slug “${parsed.data.slug}” 已被其他平台使用` };
  await d.update(platforms).set(parsed.data).where(eq(platforms.id, id));
  revalidatePath("/platforms");
  revalidatePath(`/platforms/${id}`);
  return { ok: true };
}

export async function saveFieldSchemaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("json") ?? ""));
  } catch {
    return { error: "不是合法的 JSON" };
  }
  const parsed = fieldSchemaInput.safeParse(json);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const keys = new Set<string>();
  for (const f of parsed.data) {
    if (keys.has(f.key)) return { error: `字段 key 重复：${f.key}` };
    keys.add(f.key);
  }
  await db().update(platforms).set({ fieldSchema: parsed.data as FieldSchema }).where(eq(platforms.id, id));
  revalidatePath(`/platforms/${id}`);
  revalidatePath("/records");
  return { ok: true };
}

export async function createRecipeVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const platformId = String(formData.get("platformId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const activate = formData.get("activate") === "on";
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("json") ?? ""));
  } catch {
    return { error: "不是合法的 JSON" };
  }
  const d = db();
  const [p] = await d.select().from(platforms).where(eq(platforms.id, platformId)).limit(1);
  if (!p) return { error: "平台不存在" };
  const [{ max }] = await d
    .select({ max: sql<number>`coalesce(max(${recipes.version}), 0)` })
    .from(recipes)
    .where(eq(recipes.platformId, platformId));
  const version = Number(max) + 1;
  // The stored version number is authoritative; the JSON copy is kept in sync for the extension.
  const parsed = recipeSchema.safeParse({ ...(json as object), platform: p.slug, version });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await d.transaction(async (tx) => {
    if (activate) await tx.update(recipes).set({ isActive: false }).where(eq(recipes.platformId, platformId));
    await tx.insert(recipes).values({ platformId, version, json: parsed.data, isActive: activate, note, createdBy: user.id });
  });
  revalidatePath(`/platforms/${platformId}`);
  return { ok: true };
}

export async function activateRecipeAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const d = db();
  const [r] = await d.select({ platformId: recipes.platformId }).from(recipes).where(eq(recipes.id, id)).limit(1);
  if (!r) return;
  await d.transaction(async (tx) => {
    await tx.update(recipes).set({ isActive: false }).where(eq(recipes.platformId, r.platformId));
    await tx.update(recipes).set({ isActive: true }).where(eq(recipes.id, id));
  });
  revalidatePath(`/platforms/${r.platformId}`);
}

export async function deletePlatformAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  await db().delete(platforms).where(eq(platforms.id, id));
  revalidatePath("/platforms");
  redirect("/platforms");
}
