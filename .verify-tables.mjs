import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
for (const table of ['landing_services','landing_catalog_revisions']) {
  const {data,error}=await db.from(table).select('*').limit(1);
  if (error) { console.error(table+':FAIL'); process.exitCode=1; }
  else console.log(table+':OK rows_sample='+data.length);
}
