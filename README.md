# 🟠 Roundly

A warm, twice-daily news roundup. Users pick their categories, region, language
and who to follow; Roundly aggregates from many sources, cites every one, and
emails a tidy digest at **noon** and **9pm**. GDPR-compliant from day one.

## Repo layout

- `index.html` — the full product front-end (open it in a browser; no build step).
- `server/` — the Node/Express backend that aggregates news and sends the emails.
  See `server/README.md` for setup, API keys and deploy steps.

## Run the site locally

Just open `index.html` in your browser — it's a self-contained demo.

## Run the backend

```bash
cd server
cp .env.example .env   # fill in secrets + a news API key + SMTP
npm install
npm run migrate
npm run dev
```

Full details in `server/README.md`.
