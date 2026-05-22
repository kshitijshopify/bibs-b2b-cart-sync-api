# Deploy bibs-b2b-cart-sync API on Render

Production hosting for the Remix app + OAuth sessions (Postgres) + App Proxy `/apps/company-cart/sync`.

---

## Overview

| Component | Render |
|-----------|--------|
| Web service | Node — runs `remix-serve` |
| Database | PostgreSQL (sessions for Shopify OAuth) |
| Public URL | `https://<your-service>.onrender.com` |

After deploy, point Shopify (Partner Dashboard + `shopify.app.toml`) at this URL.

---

## Option A — Blueprint (`render.yaml`)

1. Push this repo to GitHub/GitLab.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
3. Connect the repo; Render reads `render.yaml` (web service + Postgres).
4. Set **secret** env vars when prompted (see table below).
5. Deploy; copy the web service URL (e.g. `https://bibs-b2b-cart-sync-api.onrender.com`).

---

## Option B — Manual web service + database

### 1. PostgreSQL

1. **New** → **PostgreSQL** (free or paid).
2. Copy **Internal Database URL** (use this on the web service in the same region).

### 2. Web service

1. **New** → **Web Service** → connect repo.
2. Settings:

| Setting | Value |
|---------|--------|
| Runtime | Node |
| Build Command | `npm install && npm run render-build` |
| Start Command | `npm run start` |
| Plan | Starter+ recommended for production (free tier sleeps) |

### 3. Environment variables

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Postgres **Internal** URL from step 1 |
| `SHOPIFY_API_KEY` | Partner app Client ID |
| `SHOPIFY_API_SECRET` | Partner app Client secret |
| `SCOPES` | `read_customers,write_customers,read_companies,write_companies` |
| `SHOPIFY_APP_URL` | `https://<your-service>.onrender.com` (no trailing slash) |

Render sets `PORT` automatically; Remix serves on it.

---

## Link Shopify to Render URL

### 1. Partner Dashboard

**Apps** → **bibs-b2b-cart-sync**:

- **App URL** / **Allowed redirection URL(s):**  
  `https://<your-service>.onrender.com`  
  `https://<your-service>.onrender.com/auth/callback`  
  `https://<your-service>.onrender.com/auth/shopify/callback`  
  (match paths your Remix auth routes use — check after first deploy in logs if OAuth fails)

- **App proxy** (if not pushed by CLI):  
  - Subpath prefix: `apps`  
  - Subpath: `company-cart`  
  - Proxy URL: `https://<your-service>.onrender.com/apps/company-cart`

### 2. Update `shopify.app.toml` locally

```toml
application_url = "https://<your-service>.onrender.com"
embedded = true

[auth]
redirect_urls = [
  "https://<your-service>.onrender.com/auth/callback",
  "https://<your-service>.onrender.com/auth/shopify/callback"
]
```

Then push config to Shopify:

```powershell
cd D:\Github-CLI\bibs-b2b-cart-sync-api
shopify app deploy
```

### 3. Install on bibs-b2b store

Use **Custom distribution** install link (see `docs/SETUP.md` Step 5b).  
Install while logged into the store admin; open the app once to complete OAuth.

---

## Local dev with Postgres (optional)

SQLite was removed for production parity. For local `shopify app dev`:

1. Use Render Postgres **External** URL in `.env`, or local Postgres.
2. Copy `.env.example` → `.env` and fill values.
3. `npm run setup` then `shopify app dev`.

You can still use CLI tunnel for `SHOPIFY_APP_URL` during dev; Render URL is for production only.

---

## Verify production

1. **Render** → service **Logs** — no crash on start; migrations applied.
2. **Admin** → Apps → open **bibs-b2b-cart-sync** (loads embedded app).
3. Logged-in B2B customer on storefront → theme `POST` to  
   `https://<shop>.myshopify.com/apps/company-cart/sync`  
   → company metafield `custom.company_cart` updates.

---

## Render notes

- **Free web tier** spins down after inactivity; first request may be slow (cold start). Use **Starter** for always-on if App Proxy sync must be fast.
- Use **Internal** `DATABASE_URL` on the web service (same region as Postgres).
- Commit `package-lock.json` for reproducible builds (recommended); build uses `npm install` if lockfile is missing.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails on Prisma | Check `DATABASE_URL` is set for **build** if migrations run at build time; Blueprint links DB automatically |
| OAuth redirect mismatch | `SHOPIFY_APP_URL` and Partner redirect URLs must match exactly |
| App proxy 404 | Proxy URL must be `https://<host>/apps/company-cart`; redeploy + `shopify app deploy` |
| Session / install loop | Clear app from store and reinstall; check Postgres has `Session` table (`migrate deploy`) |
