// Builds a personalised digest for one user and renders the HTML email.
import { getCategoryStories, getFollowStories } from './news.js';
import { REGIONS } from './sources.js';

const CATEGORY_META = {
  world:{e:'🌐',t:'World'}, politics:{e:'🏛',t:'Politics'}, business:{e:'📈',t:'Business'},
  tech:{e:'💻',t:'Technology'}, science:{e:'🔬',t:'Science'}, health:{e:'🩺',t:'Health'},
  sport:{e:'⚽',t:'Sport'}, culture:{e:'🎬',t:'Culture'}, climate:{e:'🌱',t:'Climate'},
  finance:{e:'💰',t:'Personal finance'}, lifestyle:{e:'🧘',t:'Lifestyle'}, gaming:{e:'🎮',t:'Gaming'},
  education:{e:'🎓',t:'Education'}, local:{e:'📍',t:'Local news'},
};

// Assemble the raw digest data (categories + follows) for a user + preferences.
export async function buildDigest(user, prefs, follows, period) {
  const sections = [];
  for (const cat of prefs.categories) {
    const stories = await getCategoryStories(cat, {
      region: prefs.region, language: prefs.language, limit: prefs.stories_per_section,
    });
    if (stories.length) sections.push({ id: cat, ...CATEGORY_META[cat], stories });
  }
  let followSection = null;
  if (follows.length) {
    const items = [];
    for (const f of follows) {
      const s = await getFollowStories(f.label, { language: prefs.language, limit: 1 });
      if (s.length) items.push(s[0]);
    }
    if (items.length) followSection = items;
  }
  return { user, prefs, period, sections, followSection };
}

// --- HTML email renderer (inline styles for email-client compatibility) ---
export function renderDigestEmail(digest, { verifyUrl, unsubscribeUrl, manageUrl }) {
  const { user, prefs, period, sections, followSection } = digest;
  const meta = period === 'noon'
    ? { kick: 'Your Noon Roundup', hi: 'Good afternoon', emoji: '☀️' }
    : { kick: 'Your Evening Roundup', hi: 'Good evening', emoji: '🌙' };
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const srcPills = (sources) => sources.map(s =>
    `<a href="${esc(s.url)}" style="display:inline-block;background:#fff8ef;border:1px solid #ece3d6;border-radius:999px;padding:2px 10px;margin:2px 4px 2px 0;font-size:12px;font-weight:700;color:#c85a18;text-decoration:none">${esc(s.name)}</a>`
  ).join('');

  const story = (s) => `
    <div style="padding:12px 0;border-bottom:1px dashed #ece3d6">
      <div style="font-family:'Trebuchet MS','Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#2c2620;line-height:1.3;margin-bottom:5px">
        <a href="${esc(s.sources?.[0]?.url || '#')}" style="color:#2c2620;text-decoration:none">${esc(s.title)}</a>
      </div>
      ${s.summary ? `<div style="font-size:14px;color:#6b6357;margin-bottom:8px">${esc(s.summary)}</div>` : ''}
      <div>${srcPills(s.sources || [])}
        ${s.corroborated ? `<span style="display:inline-block;background:#e3f0ec;color:#3f7d6e;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800">⚖️ ${s.sourceCount} sources</span>` : ''}
      </div>
    </div>`;

  const sectionHTML = (sec) => `
    <div style="padding:16px 24px;border-bottom:1px solid #ece3d6">
      <div style="font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#3f7d6e;margin-bottom:8px">${sec.e} ${esc(sec.t)}</div>
      ${sec.stories.map(story).join('')}
    </div>`;

  const followHTML = followSection ? `
    <div style="padding:16px 24px;border-bottom:1px solid #ece3d6;background:#fff8ef">
      <div style="font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#c85a18;margin-bottom:8px">👥 Following</div>
      ${followSection.map(story).join('')}
    </div>` : '';

  return `<!doctype html><html><body style="margin:0;background:#fbf7f0;font-family:'Trebuchet MS','Segoe UI',Helvetica,Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:20px 12px">
      <div style="background:#fff;border:1px solid #ece3d6;border-radius:16px;overflow:hidden">
        <div style="background:linear-gradient(120deg,#f2b544,#e8722c);color:#fff;padding:22px 24px">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;opacity:.95">${meta.kick} · ${today}</div>
          <div style="font-family:'Trebuchet MS','Segoe UI',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;margin-top:4px">${meta.hi}, ${esc(user.name)} ${meta.emoji}</div>
          <div style="font-size:13px;opacity:.95;margin-top:2px">${sections.length} sections · every source cited · ${REGIONS[prefs.region]?.label || prefs.region}</div>
        </div>
        ${followHTML}
        ${sections.map(sectionHTML).join('')}
        <div style="padding:18px 24px;text-align:center;font-size:12px;color:#9a9084">
          You're receiving this because you subscribed to Roundly.<br>
          <a href="${esc(manageUrl)}" style="color:#c85a18">Manage preferences</a> ·
          <a href="${esc(unsubscribeUrl)}" style="color:#c85a18">Unsubscribe</a>
        </div>
      </div>
      <div style="text-align:center;font-size:11px;color:#b8ac9a;margin-top:12px">Roundly · Your world, twice a day</div>
    </div></body></html>`;
}

function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
