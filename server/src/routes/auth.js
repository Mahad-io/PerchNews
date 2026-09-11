import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { query, withTx } from '../db/index.js';
import { issueToken, consumeToken } from '../services/tokens.js';
import { sendEmail, verificationEmail } from '../services/email.js';
import { signSession, cookieOpts, requireAuth } from '../middleware/auth.js';

const router = Router();

const signupSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  consent: z.object({
    personalisation: z.boolean(),
    marketing: z.boolean(),
    terms: z.literal(true),           // must accept terms
  }),
});

// POST /api/auth/signup  — creates account (unverified), logs consent, sends verify email.
router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  const { name, email, password, consent } = parsed.data;

  const exists = await query('SELECT 1 FROM users WHERE email=$1', [email]);
  if (exists.rows.length) return res.status(409).json({ error: 'An account with this email already exists.' });

  const password_hash = await argon2.hash(password, { type: argon2.argon2id });
  const ip = req.ip, ua = req.get('user-agent');

  const user = await withTx(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id, email, name',
      [email, name, password_hash]
    );
    const u = rows[0];
    await c.query('INSERT INTO preferences (user_id) VALUES ($1)', [u.id]);
    // Append-only consent proof (GDPR Art. 7): who, what, when, from where.
    const log = (purpose, granted) =>
      c.query('INSERT INTO consents (user_id, purpose, granted, ip, user_agent) VALUES ($1,$2,$3,$4,$5)',
        [u.id, purpose, granted, ip, ua]);
    await log('essential', true);
    await log('personalisation', consent.personalisation);
    await log('marketing', consent.marketing);
    return u;
  });

  const raw = await issueToken(user.id, 'verify', 48);
  const url = `${process.env.APP_URL}/verify?token=${raw}`;
  const mail = verificationEmail(name, url);
  try { await sendEmail({ to: email, subject: mail.subject, html: mail.html }); } catch (e) { console.error('verify email failed', e.message); }

  res.status(201).json({ ok: true, message: 'Check your inbox to confirm your subscription.' });
});

// POST /api/auth/verify  — double opt-in confirmation.
router.post('/verify', async (req, res) => {
  const { token } = req.body;
  const userId = await consumeToken(token, 'verify');
  if (!userId) return res.status(400).json({ error: 'This link is invalid or has expired.' });
  const { rows } = await query('UPDATE users SET email_verified=true, updated_at=now() WHERE id=$1 RETURNING id, email, name', [userId]);
  res.cookie('roundly_session', signSession(rows[0]), cookieOpts);
  res.json({ ok: true, user: rows[0] });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await query('SELECT * FROM users WHERE email=$1 AND status != $2', [email, 'deleted']);
  const user = rows[0];
  // Constant-ish response to avoid user enumeration.
  if (!user || !(await argon2.verify(user.password_hash, password || '').catch(() => false)))
    return res.status(401).json({ error: 'Incorrect email or password.' });
  if (!user.email_verified) return res.status(403).json({ error: 'Please confirm your email first.' });
  res.cookie('roundly_session', signSession(user), cookieOpts);
  res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => { res.clearCookie('roundly_session'); res.json({ ok: true }); });

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT id, email, name, email_verified FROM users WHERE id=$1', [req.userId]);
  res.json({ user: rows[0] });
});

// GET /api/auth/unsubscribe?token=...  — one-click unsubscribe (RFC 8058 friendly).
router.get('/unsubscribe', async (req, res) => {
  const userId = await consumeToken(req.query.token, 'unsubscribe');
  if (!userId) return res.status(400).send('Invalid or expired unsubscribe link.');
  await query('UPDATE preferences SET paused=true, updated_at=now() WHERE user_id=$1', [userId]);
  res.send('You have been unsubscribed. You can re-enable roundups anytime from your dashboard.');
});

export default router;
