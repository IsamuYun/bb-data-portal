"use server";

import { and, db, dictionaryEntries, eq, isNull, platforms, records } from "@bb/db";
import { revalidatePath } from "next/cache";
import { requireUser } from "../require-user";
import { learnEntries } from "../translate/dictionary";
import { defaultTranslator, NO_KEY_HINT } from "../translate/llm";
import { translateRecords } from "../translate/records";

export type DictActionState = { error?: string; ok?: boolean; message?: string } | undefined;

export async function addDictionaryEntryAction(_prev: DictActionState, formData: FormData): Promise<DictActionState> {
  await requireUser();
  const fieldKey = String(formData.get("fieldKey") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();
  if (!source) return { error: "原文不能为空" };
  await db()
    .insert(dictionaryEntries)
    .values({ lang: "zh", fieldKey, source, target: target || null, origin: "manual" })
    .onConflictDoUpdate({ target: [dictionaryEntries.lang, dictionaryEntries.fieldKey, dictionaryEntries.source], set: { target: target || null, origin: "manual", updatedAt: new Date() } });
  revalidatePath("/dictionary");
  return { ok: true };
}

export async function saveDictionaryEntryAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const target = String(formData.get("target") ?? "").trim();
  await db().update(dictionaryEntries).set({ target: target || null, origin: "manual", updatedAt: new Date() }).where(eq(dictionaryEntries.id, id));
  revalidatePath("/dictionary");
}

export async function deleteDictionaryEntryAction(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  await db().delete(dictionaryEntries).where(eq(dictionaryEntries.id, id));
  revalidatePath("/dictionary");
}

/** Translate every record (or one platform's): dictionary now, model for prose when a key is configured. */
export async function translateAllRecordsAction(_prev: DictActionState, formData: FormData): Promise<DictActionState> {
  await requireUser();
  const platformId = String(formData.get("platformId") ?? "");
  const force = formData.get("force") === "on";
  const d = db();
  const ids = (await d.select({ id: records.id }).from(records).where(platformId ? eq(records.platformId, platformId) : undefined)).map((r) => r.id);
  const s = await translateRecords(ids, { force });
  revalidatePath("/dictionary");
  revalidatePath("/records");
  const hint = s.error ? `（模型调用失败：${s.error.slice(0, 160)}）` : s.pending ? (defaultTranslator() ? "" : `（${NO_KEY_HINT}，自由文本字段暂未翻译）`) : "";
  return { ok: true, message: `共 ${s.total} 条：新翻译 ${s.translated}，沿用缓存 ${s.skipped}，待补全 ${s.pending}${hint}` };
}

/** Ask the model to fill every blank dictionary entry (batches of 40). */
export async function fillDictionaryWithModelAction(_prev: DictActionState, formData: FormData): Promise<DictActionState> {
  await requireUser();
  void formData;
  const llm = defaultTranslator();
  if (!llm) return { error: `${NO_KEY_HINT}，无法用模型填充` };
  const d = db();
  const blanks = await d.select().from(dictionaryEntries).where(and(eq(dictionaryEntries.lang, "zh"), isNull(dictionaryEntries.target)));
  if (!blanks.length) return { ok: true, message: "没有空词条" };
  const labels = Object.fromEntries((await d.select({ s: platforms.fieldSchema }).from(platforms)).flatMap((p) => p.s.map((f) => [f.key, f.label])));
  let filled = 0;
  for (let i = 0; i < blanks.length; i += 40) {
    const batch = blanks.slice(i, i + 40);
    const req = Object.fromEntries(batch.map((b, n) => [`__dict:${b.fieldKey || "_"}:${n}`, b.source]));
    const out = await llm(req, { platformName: "字典", labels });
    const learned = batch.flatMap((b, n) => {
      const t = out[`__dict:${b.fieldKey || "_"}:${n}`];
      return typeof t === "string" && t.trim() && t !== b.source ? [{ fieldKey: b.fieldKey, source: b.source, target: t.trim() }] : [];
    });
    await learnEntries(learned);
    filled += learned.length;
  }
  revalidatePath("/dictionary");
  return { ok: true, message: `已填充 ${filled} / ${blanks.length} 条空词条；点“翻译全部记录”应用到记录` };
}
