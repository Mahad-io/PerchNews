import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import prefRoutes from './routes/preferences.js';
import gdprRoutes from './routes/gdpr.js';
import { startScheduler } from './jobs/scheduler.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(cors({ origin: process.env.APP_URL, credentials: true }));

// Basic rate limiting; stricter on auth.
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 40 }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'roundly', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/preferences', prefRoutes);
app.use('/api/gdpr', gdprRoutes);

// Protected internal trigger for external schedulers (e.g. GitHub Actions / cloud cron).
app.post('/internal/run-digest', async (req, res) => {
  if (req.get('x-internal-key') !== process.env.JWT_SECRET) return res.status(403).json({ error: 'forbidden' });
  const { sendDigests } = await import('./jobs/sendDigests.js');
  const period = req.body?.period === 'evening' ? 'evening' : 'noon';
  res.json(await sendDigests(period));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`📰 Roundly API listening on :${PORT}`);
  if (process.env.RUN_SCHEDULER !== 'false') startScheduler();
});
