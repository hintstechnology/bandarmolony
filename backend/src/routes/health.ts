import { Router } from 'express';
import { testDbConnection } from '../db';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

router.get('/live', (_req, res) => {
  res.json({ ok: true, message: 'Server is alive' });
});

router.get('/db', async (_req, res) => {
  try {
    console.log('🔍 Health check: Testing database connection...');
    const ok = await testDbConnection();
    console.log('✅ Health check: Database connection OK');
    res.json({ ok, via: 'pg', timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('❌ Health check: Database connection failed:', err?.message);
    res.status(500).json({ ok: false, error: err?.message, timestamp: new Date().toISOString() });
  }
});

router.get('/supabase', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .limit(1);
    if (error) throw error;
    res.json({ ok: true, rows: data?.length ?? 0 });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;