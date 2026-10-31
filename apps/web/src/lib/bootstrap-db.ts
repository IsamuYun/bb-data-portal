import fs from "node:fs";
import path from "node:path";
import { runMigrations } from "@bb/db/migrate";
import { seed } from "@bb/db/seed";

/** Node-only: apply migrations and seed on server boot. Imported lazily from instrumentation.ts. */
export async function bootstrapDatabase() {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.join(process.cwd(), "drizzle"),
    path.join(process.cwd(), "../../packages/db/drizzle"),
  ].filter(Boolean) as string[];
  const folder = candidates.find((p) => fs.existsSync(p));
  if (!folder) {
    console.warn("[boot] migrations folder not found, skipping", candidates);
    return;
  }
  console.log(`[boot] applying migrations from ${folder}`);
  await runMigrations(folder);
  await seed({ log: (m) => console.log(`[boot] ${m}`) });
}
