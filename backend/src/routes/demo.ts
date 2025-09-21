import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClient';
import { z } from 'zod';

const router = Router();

const profileSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email(),
  full_name: z.string().min(1)
});

router.post('/profiles', async (req, res) => {
  try {
    const payload = profileSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert(payload)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message });
  }
});

router.get('/profiles', async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('profiles').select('*').limit(50);
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

export default router;