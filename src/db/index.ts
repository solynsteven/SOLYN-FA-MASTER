import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * 生产（Vercel + Neon）走 Neon HTTP 驱动，无连接池压力；
 * 本地开发如果 DATABASE_URL 不是 neon.tech，自动改用 node-postgres。
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少环境变量 DATABASE_URL");
  if (url.includes("neon.tech")) {
    return drizzleNeon(neon(url), { schema });
  }
  const g = globalThis as unknown as { __pgPool?: Pool };
  g.__pgPool ??= new Pool({ connectionString: url, max: 5 });
  return drizzlePg(g.__pgPool, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>;
}

type DB = ReturnType<typeof drizzleNeon<typeof schema>>;
let _db: DB | undefined;
export function getDb(): DB {
  _db ??= createDb();
  return _db;
}
export const db = new Proxy({} as DB, {
  get(_t, prop) {
    return Reflect.get(getDb() as object, prop);
  },
});
export { schema };
