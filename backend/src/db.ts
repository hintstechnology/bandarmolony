import { Pool } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL belum diisi di .env');
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  keepAlive: true
});

export async function testDbConnection() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}