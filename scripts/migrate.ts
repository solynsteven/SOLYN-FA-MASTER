import "dotenv/config";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少 DATABASE_URL");
  if (url.includes("neon.tech")) {
    await migrateNeon(drizzleNeon(neon(url)), { migrationsFolder: "./drizzle" });
  } else {
    const pool = new Pool({ connectionString: url });
    await migratePg(drizzlePg(pool), { migrationsFolder: "./drizzle" });
    await pool.end();
  }
  console.log("✔ 数据库迁移完成");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
