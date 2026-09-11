# 📰 Roundly — backend

The service that powers Roundly: a twice-daily, GDPR-compliant news roundup.
Users pick categories, region, language and who to follow; Roundly aggregates from
many sources, cites every one, and emails a tidy digest at **noon** and **9pm**.

The clickable product UI lives in `../roundly.html` — open it in a browser to see
exactly what this backend serves and sends.

---

## What's here

```
roundly-backend/
├── package.json
├── .env.example
└── src/
    ├── index.js              # Express app + route mounting + scheduler boot
    ├── db/
    │   ├── schema.sql        # Postgres schema (users, prefs, follows, consents, tokens, deliveries)
    │   ├── migrate.js        # runs schema.sql
    │   └── index.js          # pg pool + transaction helper
    ├── middleware/
    │   └── auth.js           # JWT session cookie (httpOnly)
    ├── routes/
    │   ├── auth.js           # signup + double opt-in + login + unsubscribe
    │   ├── preferences.js    # categories / region / language / schedule / follows / live preview
    │   └── gdpr.js           # consent log, data export, account deletion
    ├── services/
    │   ├── sources.js        # source registry + category/region mappings + RSS feeds
    │   ├── news.js           # multi-provider aggregation, clustering, de-dupe, source attribution
    │   ├── digest.js         # builds a user's digest + renders the HTML email
    │   ├── email.js          # SMTP transport + verification email
    │   └── tokens.js         # hashed single-use tokens (verify / unsubscribe)
    └── jobs/
        ├── sendDigests.js    # selects due users, builds + sends + logs
        ├── scheduler.js      # per-minute cron; sends at each user's chosen time
        └── run-digest.js     # one-shot CLI runner for external cron / testing
```

## Why the frontend + backend are split

The site (`roundly.html`) is a fully working single-file app so you can click
through the whole product immediately — signup, consent, onboarding, schedule,
digest preview, GDPR export/delete. It stores state in your browser so it needs
no server.

Actually **sending email at 12:00 and 21:00** needs an always-on server, a
database, a news API key and an email account — this backend. Deploy it once and
point the frontend at it (`fetch('/api/...')`), and it's live.

---

## Quick start (local)

```bash
# 1. Postgres running locally, then:
createdb roundly
cd roundly-backend
cp .env.example .env         # fill in secrets + at least one news key + SMTP
npm install
npm run migrate              # creates tables
npm run dev                  # API on :4000, scheduler active
```

Generate secrets: `openssl rand -hex 32` for `JWT_SECRET` and `TOKEN_SECRET`.

### Send a digest immediately (test)

```bash
npm run send:noon            # or: npm run send:evening
```

Use a dev SMTP catcher like [Mailpit](https://github.com/axllent/mailpit) or
[Ethereal](https://ethereal.email) to see emails without a real provider.

---

## News sources

`src/services/news.js` pulls in parallel from every configured provider plus
open RSS feeds, then **clusters near-duplicate stories** so each headline lists
*all* the outlets that reported it — that's the "clearly discernible where things
come from" requirement. More sources on a story ⇒ ranked higher ⇒ flagged as
corroborated/balanced.

Providers (add any subset of keys to `.env`):

| Provider   | Free tier | Notes                                  |
|------------|-----------|----------------------------------------|
| NewsAPI    | yes       | top-headlines by category + country    |
| GNews      | yes       | headlines + free-text search (follows) |
| Guardian   | yes       | rich sections, generous limits         |
| NYT        | yes       | optional, add a fetcher in `news.js`   |
| RSS        | no key    | BBC, Guardian, Al Jazeera, Ars, Verge… |

You need at least one key; RSS alone will also work with zero keys.

---

## The 12:00 / 21:00 sends

- Each user stores their own `noon_time` (default `12:00`) and `evening_time`
  (default `21:00`), plus per-slot on/off and a weekend toggle.
- `scheduler.js` runs **every minute** and sends to whoever's time matches, in
  their timezone. This is why users can nudge their own times.
- Delivery is **idempotent**: one send per user, per period, per day
  (`deliveries` table).
- Every email carries `List-Unsubscribe` + one-click POST headers for
  deliverability and compliance.

**At scale**, swap the in-process cron for either:
- an external scheduler (cloud cron / GitHub Actions) hitting
  `POST /internal/run-digest` with header `x-internal-key: <JWT_SECRET>`, or
- a job queue (BullMQ + Redis) for retries and horizontal workers.

---

## GDPR compliance built in

| Requirement                     | Where                                                        |
|---------------------------------|-------------------------------------------------------------|
| Double opt-in                   | `auth.js` — no email sent until `/verify` confirms          |
| Granular, timestamped consent   | `consents` table, append-only; logged at signup + on change |
| Proof of consent (IP + UA)      | `consents` rows capture `ip`, `user_agent`, `created_at`    |
| Right of access / portability   | `GET /api/gdpr/export` → full JSON download                 |
| Right to erasure                | `DELETE /api/gdpr/account` → hard delete, cascades          |
| Withdraw consent                | `POST /api/gdpr/consent` + dashboard toggles                |
| One-click unsubscribe           | `GET /api/auth/unsubscribe` + email headers                 |
| Data minimisation               | only name, email, prefs stored; no article bodies retained  |
| Passwords                       | Argon2id hashing (`argon2`)                                 |
| Sessions                        | httpOnly, SameSite, Secure cookies (`middleware/auth.js`)   |
| Transport/security headers      | `helmet`, rate limiting, input validation via `zod`         |

Before a real launch you'll also want: a named Data Controller + DPO contact, a
published Privacy Policy/DPA with sub-processors, cookie consent for any
analytics, and a data-retention policy. The Privacy Policy copy is in the
frontend (`openLegal` in `roundly.html`) as a starting point.

---

## API summary

```
POST   /api/auth/signup            { name, email, password, consent }
POST   /api/auth/verify            { token }            → sets session, confirms opt-in
POST   /api/auth/login             { email, password }
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/auth/unsubscribe?token=…                     (one-click)

GET    /api/preferences                                  → prefs + follows
PATCH  /api/preferences            partial prefs
PUT    /api/preferences/follows    { follows: [...] }
GET    /api/preferences/preview?period=noon|evening      → live digest + HTML

POST   /api/gdpr/consent           { purpose, granted }
GET    /api/gdpr/export                                   → JSON download
DELETE /api/gdpr/account                                  → erase everything

POST   /internal/run-digest        (header x-internal-key) → manual send
GET    /health
```

---

## Deploy

Any Node host + managed Postgres works (Railway, Render, Fly.io, Heroku).

1. Provision Postgres, set `DATABASE_URL`.
2. Set all `.env` secrets in the host's env config.
3. `npm run migrate` once.
4. Start `npm start`. Keep `RUN_SCHEDULER=true` on exactly **one** instance
   (or set `RUN_SCHEDULER=false` everywhere and drive sends via external cron →
   `/internal/run-digest`).
5. Point the frontend's API calls at your deployed URL and host `roundly.html`
   (or wire it to your framework of choice).

---

*Roundly — your world, twice a day.*
