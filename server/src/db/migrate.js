import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  // CITEXT must exist before schema runs
  await pool.query('CREATE EXTENSION IF NOT EXISTS citext;');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('✓ Migration complete');
  await pool.end();
}
migrate().catch(e => { console.error(e); process.exit(1); });
