import { Router } from 'express';
import { testDbConnection } from '../db';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

router.get('/live', (_req, res) => {
  res.json({ ok: true, message: 'Server is alive' });
});

router.get('/db', async (_req, res) => {
  try {
    const ok = await testDbConnection();
    res.json({ ok, via: 'pg' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
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