import nodemailer from 'nodemailer';
import 'dotenv/config';

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

export async function sendEmail({ to, subject, html, headers }) {
  return transport.sendMail({
    from: process.env.MAIL_FROM || 'Roundly <hello@roundly.news>',
    to, subject, html, headers,
  });
}

export function verificationEmail(name, url) {
  return {
    subject: 'Confirm your Roundly subscription',
    html: `<div style="font-family:'Trebuchet MS','Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#2c2620">Welcome to Roundly, ${esc(name)} 👋</h2>
      <p style="color:#6b6357">One click and your twice-daily roundups begin. We never email you until you confirm — that's our double opt-in promise.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${esc(url)}" style="background:#e8722c;color:#fff;text-decoration:none;font-weight:800;padding:14px 26px;border-radius:999px;display:inline-block">Confirm my email →</a>
      </p>
      <p style="color:#9a9084;font-size:12px">If you didn't sign up, ignore this email and nothing will be sent to you.</p>
    </div>`,
  };
}

function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
