// In-process scheduler. Runs every minute and dispatches digests to users whose
// configured send time matches. This lets each user pick their own noon/evening
// time (default 12:00 and 21:00) rather than a single global send.
//
// For scale, replace this with a queue (BullMQ) or an external cron hitting
// /internal/run-digest — see README. This process-local version is fine to start.
import cron from 'node-cron';
import { sendDigests } from './sendDigests.js';

export function startScheduler() {
  const tz = process.env.DEFAULT_TZ || 'Europe/London';

  cron.schedule('* * * * *', async () => {
    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    // Morning window uses the noon config; afternoon/evening uses the evening config.
    const hour = Number(now.slice(0, 2));
    if (hour < 15) await sendDigests('noon', now);
    else await sendDigests('evening', now);
  }, { timezone: tz });

  console.log(`⏰ Scheduler running (tz=${tz}). Users receive digests at their chosen times.`);
}
