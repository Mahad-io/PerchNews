// Core sending routine. Selects users due for the given period, builds each
// digest, sends it, and logs the delivery. Idempotent per user/day/period.
import { query } from '../db/index.js';
import { buildDigest, renderDigestEmail } from '../services/digest.js';
import { sendEmail } from '../services/email.js';
import { issueToken } from '../services/tokens.js';

// period: 'noon' | 'evening'
// currentHHMM (optional): only send to users whose configured time matches this minute.
export async function sendDigests(period, currentHHMM = null) {
  const enabledCol = period === 'noon' ? 'noon_enabled' : 'evening_enabled';
  const timeCol = period === 'noon' ? 'noon_time' : 'evening_time';
  const isWeekend = [0, 6].includes(new Date().getDay());

  const { rows: recipients } = await query(
    `SELECT u.id, u.name, u.email, p.*
       FROM users u JOIN preferences p ON p.user_id = u.id
      WHERE u.status = 'active' AND u.email_verified = true
        AND p.paused = false AND p.${enabledCol} = true
        ${isWeekend ? 'AND p.weekend_enabled = true' : ''}
        ${currentHHMM ? `AND to_char(p.${timeCol}, 'HH24:MI') = $1` : ''}`,
    currentHHMM ? [currentHHMM] : []
  );

  let sent = 0, failed = 0, skipped = 0;
  for (const r of recipients) {
    try {
      // De-dupe: skip if already sent this period today.
      const dup = await query(
        `SELECT 1 FROM deliveries WHERE user_id=$1 AND period=$2 AND sent_at::date = now()::date`,
        [r.id, period]);
      if (dup.rows.length) { skipped++; continue; }

      const follows = (await query('SELECT label FROM follows WHERE user_id=$1', [r.id])).rows;
      const prefs = {
        categories: r.categories, region: r.region, language: r.language,
        stories_per_section: r.stories_per_section, balanced: r.balanced,
      };
      const digest = await buildDigest({ id: r.id, name: r.name, email: r.email }, prefs, follows, period);
      if (!digest.sections.length) { skipped++; continue; }

      const unsubToken = await issueToken(r.id, 'unsubscribe', 24 * 365);
      const html = renderDigestEmail(digest, {
        unsubscribeUrl: `${process.env.APP_URL}/api/auth/unsubscribe?token=${unsubToken}`,
        manageUrl: `${process.env.APP_URL}/dashboard`,
        verifyUrl: '#',
      });

      await sendEmail({
        to: r.email,
        subject: `${period === 'noon' ? '☀️ Your noon roundup' : '🌙 Your evening roundup'} — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        html,
        // One-click unsubscribe headers (Gmail/Apple compliant, good deliverability + GDPR).
        headers: {
          'List-Unsubscribe': `<${process.env.APP_URL}/api/auth/unsubscribe?token=${unsubToken}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      await query('INSERT INTO deliveries (user_id, period, story_count, status) VALUES ($1,$2,$3,$4)',
        [r.id, period, digest.sections.reduce((n, s) => n + s.stories.length, 0), 'sent']);
      sent++;
    } catch (e) {
      failed++;
      console.error(`digest failed for ${r.email}:`, e.message);
      await query('INSERT INTO deliveries (user_id, period, status) VALUES ($1,$2,$3)', [r.id, period, 'failed']).catch(() => {});
    }
  }
  console.log(`[${period}] sent=${sent} skipped=${skipped} failed=${failed} (candidates=${recipients.length})`);
  return { sent, skipped, failed };
}
