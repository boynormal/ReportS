import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import pg from "pg";

loadEnv({ path: resolve(process.cwd(), "../.env") });
loadEnv({ path: resolve(process.cwd(), ".env.local") });

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("กรุณาตั้งค่า DATABASE_URL ใน .env ของโปรเจกต์ราก");
  }
  pool = new Pool({ connectionString: databaseUrl });
  return pool;
}

export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
