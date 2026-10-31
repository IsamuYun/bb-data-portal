export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_MIGRATIONS === "1") return;
  const { bootstrapDatabase } = await import("./lib/bootstrap-db");
  await bootstrapDatabase();
}
