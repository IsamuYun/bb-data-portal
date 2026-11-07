import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { dictionaryEntries, platforms, recipes, users, type FieldSchema } from "./schema";
import { dictionaryZh } from "./seed-data/dictionary-zh";
import { cryobankDocuments, cryobankFieldSchema, cryobankRecipeV1, documentFieldsOf, retiredDocumentFields, withDocumentSteps, withoutDocumentSteps } from "./seed-data/cryobank";
import { FAIRFAX_GENETIC_FIELDS, FAIRFAX_MEDICAL_FIELDS, fairfaxDictionaryZh, fairfaxFieldSchema, fairfaxListing, fairfaxRecipeV1, hasFairfaxV2, withFairfaxV2 } from "./seed-data/fairfax";
import { localtestFieldSchema, localtestRecipeV1 } from "./seed-data/localtest";

/**
 * Idempotent seed: admin user from env + the cryobank platform with its first recipe.
 * Runs on every boot; only inserts what is missing.
 */
/** Existing install: carry the seed's translate modes onto a stored schema that has none (keys matched, nothing else touched). */
async function addTranslateModes(p: { id: string; slug: string; fieldSchema: FieldSchema }, seedSchema: FieldSchema) {
  if (p.fieldSchema.some((f) => f.translate)) return;
  const modes = new Map(seedSchema.map((f) => [f.key, f.translate]));
  const merged: FieldSchema = p.fieldSchema.map((f) => (modes.get(f.key) ? { ...f, translate: modes.get(f.key) } : f));
  await db().update(platforms).set({ fieldSchema: merged }).where(eq(platforms.id, p.id));
}

/** Existing install: append seed fields added after the platform was created (only the listed keys, so other fields an admin removed stay removed). */
async function addFields(p: { id: string; fieldSchema: FieldSchema }, seedSchema: FieldSchema, keys: string[]) {
  const have = new Set(p.fieldSchema.map((f) => f.key));
  const add = seedSchema.filter((f) => keys.includes(f.key) && !have.has(f.key));
  if (add.length === 0) return false;
  await db().update(platforms).set({ fieldSchema: [...p.fieldSchema, ...add] }).where(eq(platforms.id, p.id));
  return true;
}

/**
 * Existing install: drop fields the seed retired and replace the stored definition of fields whose meaning changed
 * (`occupation` went from a model summary to the parsed answer). Only touches the listed keys.
 */
async function retireFields(p: { id: string; fieldSchema: FieldSchema }, seedSchema: FieldSchema, drop: string[], redefine: string[]) {
  const seedDef = new Map(seedSchema.map((f) => [f.key, f]));
  let changed = false;
  const next = p.fieldSchema.flatMap((f) => {
    if (drop.includes(f.key)) return (changed = true), [];
    const def = seedDef.get(f.key);
    if (redefine.includes(f.key) && def && JSON.stringify(def) !== JSON.stringify(f)) return (changed = true), [def];
    return [f];
  });
  if (changed) {
    await db().update(platforms).set({ fieldSchema: next }).where(eq(platforms.id, p.id));
    p.fieldSchema = next;
  }
  return changed;
}

export async function seed(opts?: { adminEmail?: string; adminPassword?: string; log?: (m: string) => void }) {
  const log = opts?.log ?? (() => {});
  const email = (opts?.adminEmail ?? process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = opts?.adminPassword ?? process.env.ADMIN_PASSWORD ?? "admin1234";
  const d = db();

  const existing = await d.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length === 0) {
    await d.insert(users).values({ email, name: "Administrator", passwordHash: await bcrypt.hash(password, 10), role: "admin" });
    log(`seed: created admin ${email}`);
  }

  let [cb] = await d.select().from(platforms).where(eq(platforms.slug, "cryobank")).limit(1);
  if (!cb) {
    [cb] = await d
      .insert(platforms)
      .values({ slug: "cryobank", name: "California Cryobank", baseUrl: "https://www.cryobank.com", fieldSchema: cryobankFieldSchema })
      .returning();
    log("seed: created platform cryobank");
  }
  await addTranslateModes(cb, cryobankFieldSchema);
  // Model-written summaries replaced by parsed fields (2026-11-06).
  const retired = ["personalHealth", "familyHistory", "riskAssessment", "degreeSummary", "school", "gpa", "skills", "highlights"];
  if (await retireFields(cb, cryobankFieldSchema, retired, ["occupation"])) log("seed: cryobank model-summary fields retired");
  // Fields added after the first release: everything from gtsCarrierDiseases up to the photo fields.
  const keys = cryobankFieldSchema.map((f) => f.key);
  const laterFields = keys.slice(keys.indexOf("gtsCarrierDiseases"), keys.indexOf("childhoodPhotos"));
  if (await addFields(cb, cryobankFieldSchema, laterFields)) log("seed: cryobank fields added (GTS / medical / questionnaire)");

  const dictRows = [dictionaryZh, fairfaxDictionaryZh].flatMap((dict) => Object.entries(dict)).flatMap(([fieldKey, m]) => Object.entries(m).map(([source, target]) => ({ lang: "zh", fieldKey, source, target, origin: "seed" })));
  const inserted = await d.insert(dictionaryEntries).values(dictRows).onConflictDoNothing().returning({ id: dictionaryEntries.id });
  if (inserted.length) log(`seed: dictionary +${inserted.length} entries`);
  const hasRecipe = await d.select({ id: recipes.id }).from(recipes).where(eq(recipes.platformId, cb.id)).limit(1);
  if (hasRecipe.length === 0) {
    await d.insert(recipes).values({ platformId: cb.id, version: 1, json: cryobankRecipeV1, isActive: true, note: "按真实页面结构确定的 selector（M3）" });
    log("seed: created cryobank recipe v1");
  }
  // One-time upgrades: derive a new version from the active recipe (keeps admin edits) that also downloads the donor
  // documents. A document is added only if no version ever had it, so an admin can remove the steps again.
  const cbRecipes = await d.select().from(recipes).where(eq(recipes.platformId, cb.id));
  const active = cbRecipes.find((r) => r.isActive);
  const everHad = new Set(cbRecipes.flatMap((r) => [...documentFieldsOf(r.json)]));
  const missingDocs = cryobankDocuments.filter((doc) => !everHad.has(doc.field));
  if (active && missingDocs.length) {
    const version = Math.max(...cbRecipes.map((r) => r.version)) + 1;
    const names = missingDocs.map((doc) => doc.code).join("/");
    await d.transaction(async (tx) => {
      await tx.update(recipes).set({ isActive: false }).where(eq(recipes.platformId, cb.id));
      await tx.insert(recipes).values({ platformId: cb.id, version, json: withDocumentSteps(active.json, version, missingDocs), isActive: true, note: `在 v${active.version} 基础上新增下载 ${names} 报告 PDF（需插件 ≥ 0.3.0）` });
    });
    log(`seed: cryobank recipe v${version} (+${names} documents) activated`);
  }
  // Retired documents: derive a version without their steps (once; an admin can add them back by hand).
  const [act] = await d.select().from(recipes).where(and(eq(recipes.platformId, cb.id), eq(recipes.isActive, true))).limit(1);
  const stale = act ? retiredDocumentFields.filter((f) => documentFieldsOf(act.json).has(f)) : [];
  if (act && stale.length) {
    const all = await d.select({ version: recipes.version }).from(recipes).where(eq(recipes.platformId, cb.id));
    const version = Math.max(...all.map((r) => r.version)) + 1;
    await d.transaction(async (tx) => {
      await tx.update(recipes).set({ isActive: false }).where(eq(recipes.platformId, cb.id));
      await tx.insert(recipes).values({ platformId: cb.id, version, json: withoutDocumentSteps(act.json, version, stale), isActive: true, note: `在 v${act.version} 基础上停止下载 ${stale.join("/")}（随笔不再使用）` });
    });
    log(`seed: cryobank recipe v${version} (-${stale.join("/")}) activated`);
  }

  // Fairfax Cryobank: shares the core field keys with cryobank (see seed-data/fairfax.ts).
  let [ff] = await d.select().from(platforms).where(eq(platforms.slug, "fairfax")).limit(1);
  if (!ff) {
    [ff] = await d
      .insert(platforms)
      .values({ slug: "fairfax", name: "Fairfax Cryobank", baseUrl: "https://fairfaxcryobank.com", fieldSchema: fairfaxFieldSchema })
      .returning();
    log("seed: created platform fairfax");
  }
  // A platform created by hand in the admin UI starts with no fields: give it the template (never overwrites one).
  if (ff.fieldSchema.length === 0) {
    await d.update(platforms).set({ fieldSchema: fairfaxFieldSchema }).where(eq(platforms.id, ff.id));
    ff.fieldSchema = fairfaxFieldSchema;
    log("seed: fairfax field template filled");
  }
  if (await addFields(ff, fairfaxFieldSchema, ["hairTexture", "medicalProfile", ...FAIRFAX_MEDICAL_FIELDS, ...FAIRFAX_GENETIC_FIELDS])) log("seed: fairfax fields added");
  const hasFf = await d.select({ id: recipes.id }).from(recipes).where(eq(recipes.platformId, ff.id)).limit(1);
  if (hasFf.length === 0) {
    // Active so a dry run can lease it (nothing runs until jobs are imported). Photo Consent ships unaccepted.
    await d.insert(recipes).values({ platformId: ff.id, version: 1, json: fairfaxRecipeV1, isActive: true, note: "按 babiology 插件解析逻辑起草，需试跑核对 selector；照片集需将 consent.accepted 改为 true（需插件 ≥ 0.4.2）" });
    log("seed: created fairfax recipe v1");
  }
  // Recipes from before listing mode: derive a version that can also page through search results (keeps admin edits).
  const ffRecipes = await d.select().from(recipes).where(eq(recipes.platformId, ff.id));
  const ffActive = ffRecipes.find((r) => r.isActive);
  if (ffActive && !ffActive.json.listing && !ffRecipes.some((r) => r.json.listing)) {
    const version = Math.max(...ffRecipes.map((r) => r.version)) + 1;
    await d.transaction(async (tx) => {
      await tx.update(recipes).set({ isActive: false }).where(eq(recipes.platformId, ff.id));
      await tx.insert(recipes).values({ platformId: ff.id, version, json: { ...ffActive.json, version, listing: fairfaxListing }, isActive: true, note: `在 v${ffActive.version} 基础上新增列表页翻页收集（需插件 ≥ 0.4.2）` });
    });
    log(`seed: fairfax recipe v${version} (+listing) activated`);
  }
  // First live capture: selector corrections + report downloads, derived from the active version (keeps consent and other edits).
  const [ffAct] = await d.select().from(recipes).where(and(eq(recipes.platformId, ff.id), eq(recipes.isActive, true))).limit(1);
  if (ffAct && !hasFairfaxV2(ffAct.json)) {
    const all = await d.select({ version: recipes.version }).from(recipes).where(eq(recipes.platformId, ff.id));
    const version = Math.max(...all.map((r) => r.version)) + 1;
    await d.transaction(async (tx) => {
      await tx.update(recipes).set({ isActive: false }).where(eq(recipes.platformId, ff.id));
      await tx.insert(recipes).values({ platformId: ff.id, version, json: withFairfaxV2(ffAct.json, version), isActive: true, note: `在 v${ffAct.version} 基础上：修正简介正文、发色/发质拆分、“-”视为空；新增下载 Medical Profile / Genetic Testing（需插件 ≥ 0.4.2）` });
    });
    log(`seed: fairfax recipe v${version} (fixes + reports) activated`);
  }

  // Local fixture platform for verifying the extension end to end without touching a real site.
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  let [lt] = await d.select().from(platforms).where(eq(platforms.slug, "localtest")).limit(1);
  if (!lt) {
    [lt] = await d
      .insert(platforms)
      .values({ slug: "localtest", name: "本地测试页（M2 验收）", baseUrl: appUrl, fieldSchema: localtestFieldSchema })
      .returning();
    log("seed: created platform localtest");
  }
  await addTranslateModes(lt, localtestFieldSchema);
  const hasLt = await d.select({ id: recipes.id }).from(recipes).where(eq(recipes.platformId, lt.id)).limit(1);
  if (hasLt.length === 0) {
    await d.insert(recipes).values({ platformId: lt.id, version: 1, json: localtestRecipeV1, isActive: true, note: "本地 /test-page 固定页面的采集脚本" });
    log("seed: created localtest recipe v1");
  }
}
