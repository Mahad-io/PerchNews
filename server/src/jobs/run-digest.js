// One-shot runner for external cron / testing:
//   node src/jobs/run-digest.js noon
//   node src/jobs/run-digest.js evening
// Sends to ALL due users for that period regardless of per-user minute.
import 'dotenv/config';
import { sendDigests } from './sendDigests.js';
import { pool } from '../db/index.js';

const period = process.argv[2] === 'evening' ? 'evening' : 'noon';
sendDigests(period)
  .then(r => { console.log('done', r); return pool.end(); })
  .catch(e => { console.error(e); process.exit(1); });
