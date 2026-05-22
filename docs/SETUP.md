# BIBS B2B Company Cart API — Setup Guide

This app syncs the Online Store cart (`/cart.js`) to the company metafield `custom.company_cart` (JSON) on **bibs-b2b**.

**Theme repo:** `D:\Github-CLI\bibs-b2b-cart-sync` (or `bibs-b2b`)  
**API repo:** `D:\Github-CLI\bibs-b2b-cart-sync-api` (this project)

---

## Prerequisites

| Tool | Check |
|------|--------|
| Node 20+ / 22+ | `node -v` |
| Shopify CLI 3.94+ | `shopify version` |
| Partner account | [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard) |
| Access to **bibs-b2b** store | Install app on this shop |

---

## Step 1 — Install dependencies

Open a terminal **in this folder** (must be interactive for login later):

```powershell
cd D:\Github-CLI\bibs-b2b-cart-sync-api
npm install
```

---

## Step 2 — Link app to Partner Dashboard

Run in the same folder (CLI will ask you to log in and pick org + create/link app):

```powershell
shopify app config link
```

This fills `shopify.app.toml` → `client_id` and creates `.env` with API keys.

**App name suggestion:** `bibs-b2b-cart-sync`

---

## Step 3 — Confirm scopes & App Proxy

`shopify.app.toml` should include:

```toml
[access_scopes]
scopes = "read_customers,write_customers,read_companies,write_companies"

[app_proxy]
url = "/apps/company-cart"
subpath = "company-cart"
prefix = "apps"
```

After changing scopes, reinstall on the dev store when prompted during `shopify app dev`.

---

## Step 4 — Database (session storage)

The template uses SQLite via Prisma for OAuth sessions:

```powershell
npm run setup
```

---

## Step 5 — Local development

```powershell
shopify app dev
```

- CLI creates a tunnel URL and updates App Proxy automatically in dev.
- **If bibs-b2b is not in the store list:** that is normal for live/client stores. Use **Install from the store** (Step 5b) instead of the CLI picker.

### Step 5b — Install when the store is NOT in `shopify app dev` list

The CLI only lists **development stores** (and some Plus sandboxes) in your Partner org. A live B2B store (bibs-b2b) must be installed via **Custom distribution**.

1. **Keep `shopify app dev` running** in the API folder (tunnel must be up for OAuth redirect and App Proxy in dev).

2. **Partner Dashboard** → [Apps](https://partners.shopify.com) → **bibs-b2b-cart-sync** → **Distribution** (or App setup → Distribution).

3. Choose **Custom distribution** (not Public App Store).

4. Enter the store domain, e.g. `bibs-b2b.myshopify.com` (your exact `.myshopify.com` hostname).

5. Click **Generate link** and copy the install URL.

6. Open that link while logged into **that store’s** Shopify admin (store owner or staff with permission to install apps). Approve the install.

7. After install, open the app once from **Admin → Apps** so OAuth completes and the dev session is stored.

**If the link says “invalid”:**

- Distribution must be **Custom**, not only “dev preview”.
- Scopes in Partner Dashboard must match `shopify.app.toml` (customers + companies).
- Run install in an incognito window or while logged into the correct store only.
- `redirect_urls` / app URL must match what `shopify app dev` shows (tunnel URL). Re-run `shopify app dev` and retry if the tunnel URL changed.

**Optional — force CLI to a store you have access to:**

```powershell
shopify app dev --store=bibs-b2b.myshopify.com
```

This only works if that shop is tied to your Partner account (dev store, collaborator, or custom-distribution target). Otherwise use the generated install link above.

**Sync endpoint (storefront):**

```
POST https://{shop}.myshopify.com/apps/company-cart/sync
```

Theme sends JSON:

```json
{
  "lines": [
    { "variant_id": 12345678901234, "quantity": 2 }
  ]
}
```

Shopify App Proxy adds query params including `logged_in_customer_id` when the buyer is logged in.

---

## Step 6 — Deploy on Render (production)

See **`docs/DEPLOY-RENDER.md`** for full steps (Blueprint `render.yaml`, Postgres, env vars, Shopify URLs).

Quick summary:

1. Deploy repo to Render (Blueprint or manual Web Service + PostgreSQL).
2. Set `SHOPIFY_APP_URL` to `https://<your-service>.onrender.com`.
3. Run `shopify app deploy` and install via **Custom distribution** on **bibs-b2b**.

---

## Step 7 — Theme integration (separate repo)

In the theme (`bibs-b2b-cart-sync`):

1. **Read (Liquid):** expose `customer.current_company.metafields.custom.company_cart` to JS and prefill cart on load.
2. **Write (JS):** after cart changes, `POST` to `/apps/company-cart/sync` with debounce (~500–800 ms).

Only run sync when `customer` and `customer.current_company` exist.

---

## Test checklist (e.g. Invicta company)

1. Customer A adds items → Admin → Company → Metafield `custom.company_cart` updates with quantities.
2. Customer B logs in → cart prefilled from metafield.
3. Customer A changes qty → Customer B refreshes → sees update after debounced sync.
4. WCP/BSS blocked variant → sync still saves other lines; theme handles add errors.

---

## Troubleshooting

| Issue | Fix |
|--------|-----|
| `config link` needs org | Run in **your** terminal (not CI); pass `--organization-id` if you know it |
| 403 on sync | Customer not logged in, or missing `logged_in_customer_id` on proxy request |
| Metafield not updating | App not installed on shop; missing `write_companies`; customer has no company |
| Proxy 404 | App Proxy not configured; run `shopify app dev` or deploy with `[app_proxy]` in toml |

---

## Project layout (company cart)

```
app/
  lib/company-cart.server.ts    # GraphQL: customer → company → metafieldsSet
  routes/apps.company-cart.sync.tsx   # App Proxy POST handler
docs/SETUP.md                   # This file
```
