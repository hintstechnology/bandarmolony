import { Pool } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;
console.log('🔍 DB: DATABASE_URL check:', DATABASE_URL ? 'SET' : 'NOT SET');
console.log('🔍 DB: All env vars:', Object.keys(process.env).filter(key => key.includes('DATABASE') || key.includes('SUPABASE')));

if (!DATABASE_URL) {
  console.error('❌ DB: DATABASE_URL is not set');
  console.error('❌ DB: Available env vars:', process.env);
  throw new Error('DATABASE_URL belum diisi di .env');
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds
  max: 10 // max connections
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('❌ Database pool error:', err);
});

pool.on('connect', () => {
  console.log('✅ Database connection established');
});

pool.on('remove', () => {
  console.log('🔌 Database connection removed');
});

export async function testDbConnection() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}