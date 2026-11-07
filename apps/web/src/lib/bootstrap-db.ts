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
  // Derived fields of raw page captures follow the current parser (no re-collection needed).
  const { rederiveFairfaxMedical, rederiveFairfaxReports } = await import("./fairfax/rederive");
  await rederiveFairfaxMedical((m) => console.log(`[boot] ${m}`)).catch((e) => console.warn("[boot] fairfax medical re-derive failed", e));
  // Not awaited: PDF parsing / cropping must not delay the server becoming ready.
  void rederiveFairfaxReports((m) => console.log(`[boot] ${m}`)).catch((e) => console.warn("[boot] fairfax report re-derive failed", e));
}
