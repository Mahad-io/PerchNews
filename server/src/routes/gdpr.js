import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// POST /api/gdpr/consent — record a consent change (append-only proof).
router.post('/consent', async (req, res) => {
  const { purpose, granted } = z.object({
    purpose: z.enum(['personalisation', 'marketing']),
    granted: z.boolean(),
  }).parse(req.body);
  await query('INSERT INTO consents (user_id, purpose, granted, ip, user_agent) VALUES ($1,$2,$3,$4,$5)',
    [req.userId, purpose, granted, req.ip, req.get('user-agent')]);
  res.json({ ok: true });
});

// GET /api/gdpr/export — right to data portability (Art. 20). Returns everything we hold.
router.get('/export', async (req, res) => {
  const [user, prefs, follows, consents, deliveries] = await Promise.all([
    query('SELECT id, email, name, email_verified, status, created_at FROM users WHERE id=$1', [req.userId]),
    query('SELECT * FROM preferences WHERE user_id=$1', [req.userId]),
    query('SELECT label, created_at FROM follows WHERE user_id=$1', [req.userId]),
    query('SELECT purpose, granted, created_at FROM consents WHERE user_id=$1 ORDER BY created_at', [req.userId]),
    query('SELECT period, sent_at, story_count, status FROM deliveries WHERE user_id=$1 ORDER BY sent_at DESC LIMIT 100', [req.userId]),
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    account: user.rows[0],
    preferences: prefs.rows[0],
    follows: follows.rows,
    consentHistory: consents.rows,
    recentDeliveries: deliveries.rows,
  };
  res.setHeader('Content-Disposition', 'attachment; filename="roundly-my-data.json"');
  res.json(payload);
});

// DELETE /api/gdpr/account — right to erasure (Art. 17). Hard delete; cascades.
router.delete('/account', async (req, res) => {
  await query('DELETE FROM users WHERE id=$1', [req.userId]);  // ON DELETE CASCADE removes all related rows
  res.clearCookie('roundly_session');
  res.json({ ok: true, message: 'Your account and all associated data have been permanently deleted.' });
});

export default router;
