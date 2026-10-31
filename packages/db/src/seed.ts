import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { platforms, recipes, users } from "./schema";
import { cryobankFieldSchema, cryobankRecipeV1 } from "./seed-data/cryobank";

/**
 * Idempotent seed: admin user from env + the cryobank platform with its first recipe.
 * Runs on every boot; only inserts what is missing.
 */
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
  const hasRecipe = await d.select({ id: recipes.id }).from(recipes).where(eq(recipes.platformId, cb.id)).limit(1);
  if (hasRecipe.length === 0) {
    await d.insert(recipes).values({ platformId: cb.id, version: 1, json: cryobankRecipeV1, isActive: true, note: "初版：label 模式抽取，selector 待 M3 试跑确认" });
    log("seed: created cryobank recipe v1");
  }
}
