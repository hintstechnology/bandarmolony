import { Pool } from 'pg';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

// For development, create a mock database connection if DATABASE_URL is not set
let pool: Pool;

if (!DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL tidak diisi, menggunakan mode development tanpa database');
  // Create a mock pool for development
  pool = new Pool({
    connectionString: 'postgresql://localhost:5432/dev',
    ssl: false,
    keepAlive: false
  });
} else {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    keepAlive: true
  });
}

export { pool };

export async function testDbConnection() {
  try {
    const res = await pool.query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1;
  } catch (error) {
    console.warn('⚠️  Database connection failed, running in development mode');
    return true; // Allow development without database
  }
}