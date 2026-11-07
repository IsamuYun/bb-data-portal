import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };
export type { SQL } from "drizzle-orm";
export { eq, ne, and, or, not, desc, asc, sql, count, inArray, notInArray, isNull, isNotNull, lt, gt, gte, lte, ilike, like, getTableColumns } from "drizzle-orm";

export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

const globalForDb = globalThis as unknown as { __bbSql?: ReturnType<typeof postgres> };

/** One connection pool per process (Next dev hot-reload safe). */
export function getSql() {
  if (!globalForDb.__bbSql) {
    globalForDb.__bbSql = postgres(getDatabaseUrl(), { max: 10, onnotice: () => {} });
  }
  return globalForDb.__bbSql;
}

export type Db = ReturnType<typeof createDb>;
export function createDb() {
  return drizzle(getSql(), { schema });
}

let cached: Db | undefined;
export function db(): Db {
  if (!cached) cached = createDb();
  return cached;
}
