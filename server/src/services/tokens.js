import crypto from 'node:crypto';
import { query } from '../db/index.js';

// Store only a hash of each token so a DB leak can't be replayed.
const hash = (raw) => crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(raw).digest('hex');

export async function issueToken(userId, kind, ttlHours = 48) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + ttlHours * 3600 * 1000);
  await query(
    'INSERT INTO tokens (user_id, kind, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
    [userId, kind, hash(raw), expires]
  );
  return raw;
}

// Returns the userId if valid & unused, else null. Single-use.
export async function consumeToken(raw, kind) {
  const { rows } = await query(
    `SELECT * FROM tokens WHERE token_hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at > now() LIMIT 1`,
    [hash(raw), kind]
  );
  if (!rows.length) return null;
  await query('UPDATE tokens SET used_at = now() WHERE id=$1', [rows[0].id]);
  return rows[0].user_id;
}
