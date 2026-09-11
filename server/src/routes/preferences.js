import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { CATEGORIES, REGIONS } from '../services/sources.js';
import { buildDigest, renderDigestEmail } from '../services/digest.js';

const router = Router();
router.use(requireAuth);

// GET /api/preferences — full preference + follows payload for the dashboard.
router.get('/', async (req, res) => {
  const p = (await query('SELECT * FROM preferences WHERE user_id=$1', [req.userId])).rows[0];
  const follows = (await query('SELECT label FROM follows WHERE user_id=$1 ORDER BY created_at', [req.userId])).rows.map(r => r.label);
  res.json({ preferences: p, follows });
});

const prefSchema = z.object({
  categories: z.array(z.enum(CATEGORIES)).min(1).optional(),
  region: z.enum(Object.keys(REGIONS)).optional(),
  language: z.string().min(2).max(8).optional(),
  stories_per_section: z.number().int().min(1).max(8).optional(),
  balanced: z.boolean().optional(),
  timezone: z.string().optional(),
  noon_enabled: z.boolean().optional(),
  noon_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  evening_enabled: z.boolean().optional(),
  evening_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  weekend_enabled: z.boolean().optional(),
  paused: z.boolean().optional(),
});

// PATCH /api/preferences — partial update.
router.patch('/', async (req, res) => {
  const parsed = prefSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid preferences', details: parsed.error.flatten() });
  const fields = parsed.data;
  const keys = Object.keys(fields);
  if (!keys.length) return res.json({ ok: true });
  const set = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  const vals = keys.map(k => fields[k]);
  await query(`UPDATE preferences SET ${set}, updated_at=now() WHERE user_id=$1`, [req.userId, ...vals]);
  res.json({ ok: true });
});

// PUT /api/preferences/follows — replace the follow list.
router.put('/follows', async (req, res) => {
  const labels = z.array(z.string().min(1).max(80)).max(50).parse(req.body.follows || []);
  await query('DELETE FROM follows WHERE user_id=$1', [req.userId]);
  for (const label of [...new Set(labels)]) {
    await query('INSERT INTO follows (user_id, label) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.userId, label]);
  }
  res.json({ ok: true, follows: labels });
});

// GET /api/preferences/preview?period=noon — live digest preview (same code path as the sender).
router.get('/preview', async (req, res) => {
  const period = req.query.period === 'evening' ? 'evening' : 'noon';
  const user = (await query('SELECT id, name, email FROM users WHERE id=$1', [req.userId])).rows[0];
  const prefs = (await query('SELECT * FROM preferences WHERE user_id=$1', [req.userId])).rows[0];
  const follows = (await query('SELECT label FROM follows WHERE user_id=$1', [req.userId])).rows;
  const digest = await buildDigest(user, prefs, follows, period);
  const html = renderDigestEmail(digest, { unsubscribeUrl: '#', manageUrl: '#', verifyUrl: '#' });
  res.json({ digest: { sections: digest.sections, followSection: digest.followSection }, html });
});

export default router;
