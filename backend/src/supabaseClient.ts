import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi di .env');
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  }
});

// Test service role connection
console.log('🔧 Supabase Admin Client initialized');
console.log('🔧 Service Role Key:', SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
console.log('🔧 Supabase URL:', SUPABASE_URL);