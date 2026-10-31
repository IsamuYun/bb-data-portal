import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getDatabaseUrl } from "./index";

/** Apply pending SQL migrations from `migrationsFolder`. Safe to run on every boot. */
export async function runMigrations(migrationsFolder: string) {
  const sql = postgres(getDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end();
  }
}
