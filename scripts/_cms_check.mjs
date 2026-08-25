import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('hasUrl', Boolean(url && url.startsWith('http')), 'hasKey', Boolean(key && key.length > 20));
if (!url || !key) process.exit(1);
const db = createClient(url, key, { auth: { persistSession: false } });

// Try using Postgres via supabase - create table with RPC won't work.
// Use REST: if table missing, report.
let { error } = await db.from('landing_cms').select('id').limit(1);
if (error) {
  console.log('cms_err', error.message, error.code);
  // Attempt storage bucket ensure for uploads
} else {
  console.log('cms_table_ok');
  await db.from('landing_cms').upsert({ id: 'default', content: {}, updated_at: new Date().toISOString() });
  console.log('cms_row_ready');
}

// Ensure 3 packs still visible
const { data } = await db.from('landing_services').select('name,price,visible,display_order').eq('visible', true).order('display_order');
console.log('visible_packs', data);