#!/usr/bin/env node
/**
 * Reads SQLite citas_pendientes and POSTs them to Vercel reconcile-import.
 * Usage:
 *   DAIMA_WEB_URL=https://soydaima.vercel.app WHATSAPP_INTERNAL_TOKEN=... node scripts/reconcile-from-sqlite.mjs [--dry-run]
 * Does not send WhatsApp messages. Does not delete remote rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dryRun = process.argv.includes('--dry-run');
const dbPath = process.env.DAIMA_DB || '/root/daima-whatsapp/data/daima.db';
const base = (process.env.DAIMA_WEB_URL || 'https://soydaima.vercel.app').replace(/\/$/, '');
const token = process.env.WHATSAPP_INTERNAL_TOKEN || process.env.WHATSAPP_API_TOKEN;
if (!token) {
  console.error('Falta WHATSAPP_INTERNAL_TOKEN');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const rows = db.prepare('SELECT id, jid, creado_en, sincronizada, payload FROM citas_pendientes ORDER BY id').all();
const citas = rows.map((r) => {
  const p = JSON.parse(r.payload);
  return {
    localId: r.id,
    jid: r.jid,
    creado_en: r.creado_en,
    sincronizada: r.sincronizada,
    ...p,
  };
});

const snapDir = process.env.SNAP_DIR || path.join('/root/daima-web/backups', `reconcile-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(snapDir, { recursive: true });
fs.writeFileSync(path.join(snapDir, 'payload.json'), JSON.stringify({ dryRun, count: citas.length, citas }, null, 2));
console.log('snapshot', snapDir, 'citas', citas.length);

const resp = await fetch(`${base}/api/admin/reconcile-import`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ dryRun, citas }),
});
const text = await resp.text();
fs.writeFileSync(path.join(snapDir, 'result.json'), text);
console.log('HTTP', resp.status);
console.log(text.slice(0, 2000));
if (!resp.ok) process.exit(1);
