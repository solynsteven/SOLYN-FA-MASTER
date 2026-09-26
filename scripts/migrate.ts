import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * 数据库迁移（Vercel 构建时执行：npm run vercel-build）
 * - 统一使用 node-postgres：整批迁移在一个事务内执行，任一语句失败会整体回滚并使构建失败，
 *   不会留下“执行了一半、却未登记”的状态
 * - Neon 优先使用直连串 DATABASE_URL_UNPOOLED（Vercel Neon 集成自动提供），否则用 DATABASE_URL
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("缺少 DATABASE_URL");
  const isNeon = url.includes("neon.tech");
  const pool = new Pool({ connectionString: url, ssl: isNeon ? { rejectUnauthorized: false } : undefined, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    const { rows } = await pool.query(`select count(*)::int as n, max(created_at) as last from drizzle.__drizzle_migrations`);
    console.log(`✔ 数据库迁移完成（已登记 ${rows[0].n} 个迁移）`);
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error("✘ 数据库迁移失败：", e);
  process.exit(1);
});
