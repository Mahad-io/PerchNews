// Central registry of news sources & category mappings.
// Roundly aggregates from ANY configured provider + open RSS feeds, so no single
// outlet dominates. Add/remove freely.

export const CATEGORIES = [
  'world','politics','business','tech','science','health','sport',
  'culture','climate','finance','lifestyle','gaming','education','local',
];

export const REGIONS = {
  uk:    { country: 'gb', label: 'United Kingdom' },
  us:    { country: 'us', label: 'United States' },
  eu:    { country: 'eu', label: 'Europe' },
  me:    { country: 'ae', label: 'Middle East & Africa' },
  as:    { country: 'sg', label: 'Asia-Pacific' },
  latam: { country: 'br', label: 'Latin America' },
  global:{ country: '',   label: 'Global' },
};

// Map Roundly categories -> provider-specific category strings.
export const CATEGORY_MAP = {
  world:    { newsapi: 'general',   gnews: 'world',        guardian: 'world' },
  politics: { newsapi: 'general',   gnews: 'nation',       guardian: 'politics' },
  business: { newsapi: 'business',  gnews: 'business',     guardian: 'business' },
  tech:     { newsapi: 'technology',gnews: 'technology',   guardian: 'technology' },
  science:  { newsapi: 'science',   gnews: 'science',      guardian: 'science' },
  health:   { newsapi: 'health',    gnews: 'health',       guardian: 'society' },
  sport:    { newsapi: 'sports',    gnews: 'sports',       guardian: 'sport' },
  culture:  { newsapi: 'entertainment', gnews: 'entertainment', guardian: 'culture' },
  climate:  { newsapi: 'science',   gnews: 'world',        guardian: 'environment' },
  finance:  { newsapi: 'business',  gnews: 'business',     guardian: 'money' },
  lifestyle:{ newsapi: 'general',   gnews: 'lifestyle',    guardian: 'lifeandstyle' },
  gaming:   { newsapi: 'technology',gnews: 'technology',   guardian: 'games' },
  education:{ newsapi: 'general',   gnews: 'nation',       guardian: 'education' },
  local:    { newsapi: 'general',   gnews: 'nation',       guardian: 'uk-news' },
};

// Curated open RSS feeds per category (no API key needed).
// Kept deliberately diverse to keep coverage balanced.
export const RSS_FEEDS = {
  world:   ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://www.aljazeera.com/xml/rss/all.xml'],
  politics:['https://feeds.bbci.co.uk/news/politics/rss.xml'],
  business:['https://feeds.bbci.co.uk/news/business/rss.xml'],
  tech:    ['https://feeds.arstechnica.com/arstechnica/index', 'https://www.theverge.com/rss/index.xml'],
  science: ['https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'],
  health:  ['https://feeds.bbci.co.uk/news/health/rss.xml'],
  sport:   ['https://feeds.bbci.co.uk/sport/rss.xml'],
  culture: ['https://www.theguardian.com/culture/rss'],
  climate: ['https://www.theguardian.com/environment/climate-crisis/rss'],
  finance: ['https://feeds.bbci.co.uk/news/business/economy/rss.xml'],
  lifestyle:['https://www.theguardian.com/lifeandstyle/rss'],
  gaming:  ['https://www.eurogamer.net/feed'],
  education:['https://feeds.bbci.co.uk/news/education/rss.xml'],
  local:   ['https://feeds.bbci.co.uk/news/england/rss.xml'],
};
