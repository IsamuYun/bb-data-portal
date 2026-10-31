import path from "node:path";
import { runMigrations } from "./migrate";
import { seed } from "./seed";

const cmd = process.argv[2];
const folder = path.resolve(import.meta.dirname, "../drizzle");
if (cmd === "migrate") {
  await runMigrations(folder);
  console.log("migrations applied");
} else if (cmd === "seed") {
  await seed({ log: console.log });
  console.log("seed done");
} else {
  console.error("usage: tsx src/cli.ts <migrate|seed>");
  process.exit(1);
}
process.exit(0);
