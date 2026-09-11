// News aggregation: pulls from every configured provider + RSS, normalises to a
// common shape, groups near-duplicate stories so each headline shows ALL the
// outlets that reported it (that's the "clearly sourced" promise), and returns
// a balanced, de-duplicated set per category.

import 'dotenv/config';
import { CATEGORY_MAP, RSS_FEEDS, REGIONS } from './sources.js';

const TTL_MS = 10 * 60 * 1000;              // 10-min cache to respect rate limits
const cache = new Map();

const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.val;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
};

// --- provider fetchers: each returns [{title, url, source, publishedAt, summary}] ---

async function fromNewsAPI(category, region) {
  if (!process.env.NEWSAPI_KEY) return [];
  const cat = CATEGORY_MAP[category]?.newsapi || 'general';
  const country = REGIONS[region]?.country || 'us';
  const url = `https://newsapi.org/v2/top-headlines?category=${cat}&country=${country}&pageSize=20&apiKey=${process.env.NEWSAPI_KEY}`;
  const r = await fetch(url).then(x => x.json()).catch(() => ({}));
  return (r.articles || []).map(a => ({
    title: a.title, url: a.url, source: a.source?.name || 'NewsAPI',
    publishedAt: a.publishedAt, summary: a.description || '',
  }));
}

async function fromGNews(category, region, lang) {
  if (!process.env.GNEWS_KEY) return [];
  const cat = CATEGORY_MAP[category]?.gnews || 'world';
  const country = REGIONS[region]?.country || 'us';
  const url = `https://gnews.io/api/v4/top-headlines?category=${cat}&country=${country}&lang=${lang || 'en'}&max=20&apikey=${process.env.GNEWS_KEY}`;
  const r = await fetch(url).then(x => x.json()).catch(() => ({}));
  return (r.articles || []).map(a => ({
    title: a.title, url: a.url, source: a.source?.name || 'GNews',
    publishedAt: a.publishedAt, summary: a.description || '',
  }));
}

async function fromGuardian(category) {
  if (!process.env.GUARDIAN_KEY) return [];
  const section = CATEGORY_MAP[category]?.guardian || 'news';
  const url = `https://content.guardianapis.com/${section}?show-fields=trailText&page-size=20&api-key=${process.env.GUARDIAN_KEY}`;
  const r = await fetch(url).then(x => x.json()).catch(() => ({}));
  return (r.response?.results || []).map(a => ({
    title: a.webTitle, url: a.webUrl, source: 'The Guardian',
    publishedAt: a.webPublicationDate, summary: (a.fields?.trailText || '').replace(/<[^>]+>/g, ''),
  }));
}

// Minimal dependency-free RSS parse (title/link/description).
async function fromRSS(category) {
  const feeds = RSS_FEEDS[category] || [];
  const out = [];
  await Promise.all(feeds.map(async feed => {
    try {
      const xml = await fetch(feed, { headers: { 'User-Agent': 'RoundlyBot/1.0' } }).then(x => x.text());
      const host = new URL(feed).hostname.replace(/^www\.|^feeds\./, '');
      const items = xml.split(/<item[ >]/).slice(1, 21);
      for (const it of items) {
        const pick = (tag) => {
          const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
          return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() : '';
        };
        const title = pick('title');
        const link = pick('link');
        if (title) out.push({
          title, url: link, source: prettySource(host),
          publishedAt: pick('pubDate'), summary: pick('description').slice(0, 240),
        });
      }
    } catch { /* skip broken feed */ }
  }));
  return out;
}

function prettySource(host) {
  const map = { 'bbci.co.uk': 'BBC', 'bbc.co.uk': 'BBC', 'theguardian.com': 'The Guardian',
    'aljazeera.com': 'Al Jazeera', 'arstechnica.com': 'Ars Technica', 'theverge.com': 'The Verge',
    'eurogamer.net': 'Eurogamer' };
  return map[host] || host;
}

// --- normalise & dedupe ---
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(the|a|an|of|in|on|to|for|as|says?)\b/g, '').replace(/\s+/g, ' ').trim();

// Two titles are "the same story" if they share enough significant words.
function similar(a, b) {
  const wa = new Set(norm(a).split(' ').filter(w => w.length > 3));
  const wb = new Set(norm(b).split(' ').filter(w => w.length > 3));
  if (!wa.size || !wb.size) return false;
  let shared = 0; wa.forEach(w => { if (wb.has(w)) shared++; });
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}

function clusterStories(articles) {
  const clusters = [];
  for (const art of articles) {
    if (!art.title) continue;
    const c = clusters.find(cl => similar(cl.title, art.title));
    if (c) {
      if (!c.sources.some(s => s.name === art.source)) c.sources.push({ name: art.source, url: art.url });
    } else {
      clusters.push({
        title: art.title.replace(/\s+[-|–]\s+[^-|–]+$/, '').trim(), // strip "— Source" suffix
        summary: art.summary,
        publishedAt: art.publishedAt,
        sources: [{ name: art.source, url: art.url }],
      });
    }
  }
  // More sources = more corroborated = surface first, then most recent.
  clusters.sort((a, b) =>
    b.sources.length - a.sources.length ||
    new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return clusters;
}

// Public API: top stories for one category, corroborated across providers.
export async function getCategoryStories(category, { region = 'uk', language = 'en', limit = 3 } = {}) {
  return cached(`${category}|${region}|${language}`, async () => {
    const batches = await Promise.all([
      fromNewsAPI(category, region),
      fromGNews(category, region, language),
      fromGuardian(category),
      fromRSS(category),
    ]);
    const all = batches.flat();
    const clusters = clusterStories(all);
    return clusters.slice(0, limit).map(c => ({
      title: c.title,
      summary: c.summary,
      sources: c.sources,                 // <-- every outlet, with links
      sourceCount: c.sources.length,
      corroborated: c.sources.length >= 3, // used to render the "balanced" badge
      publishedAt: c.publishedAt,
    }));
  });
}

// Stories matching a followed entity (person/team/company/topic) via keyword search.
export async function getFollowStories(label, { language = 'en', limit = 1 } = {}) {
  // Prefer providers that support free-text search.
  const results = [];
  if (process.env.GNEWS_KEY) {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(label)}&lang=${language}&max=10&apikey=${process.env.GNEWS_KEY}`;
    const r = await fetch(url).then(x => x.json()).catch(() => ({}));
    results.push(...(r.articles || []).map(a => ({ title: a.title, url: a.url, source: a.source?.name, publishedAt: a.publishedAt, summary: a.description })));
  }
  if (process.env.NEWSAPI_KEY) {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(label)}&language=${language}&sortBy=publishedAt&pageSize=10&apiKey=${process.env.NEWSAPI_KEY}`;
    const r = await fetch(url).then(x => x.json()).catch(() => ({}));
    results.push(...(r.articles || []).map(a => ({ title: a.title, url: a.url, source: a.source?.name, publishedAt: a.publishedAt, summary: a.description })));
  }
  const clusters = clusterStories(results);
  return clusters.slice(0, limit).map(c => ({ label, title: c.title, summary: c.summary, sources: c.sources }));
}
