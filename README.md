# NectarFusions — Order & Event Request System

Same setup process as your Muck-a-Muck site: **Supabase** for the database,
**Netlify** for hosting. This is a fully separate project from Muck-a-Muck —
its own Supabase project, its own Netlify site, its own repo.

## What's different from Muck-a-Muck (quick tour)

- **4 sizes**: 4oz ($7, mix-and-match 3-for-$20), 7oz ($12), 1lb ($20), and
  Half Gallon ($50 plain / $60 infused — price follows whichever flavor you pick).
- **Honey type**: Regular or Spun, selectable on every item, with a short
  explainer popup for customers who aren't sure of the difference.
- **Flavors are admin-managed**: your core six are pre-loaded by the SQL
  script below. Add seasonal flavors anytime from the vendor Flavors tab, and
  toggle "Featured" to spotlight whichever flavor(s) you want up top.
- **4oz upsell popup**: if someone adds a single 4oz jar, a popup nudges them
  toward the 3-for-$20 deal with a one-tap "add 2 more of this flavor" button.
- **Special Event Requests**: a separate path (no market/pickup needed) that
  captures event details as a lead and emails you — no automatic pricing,
  since those are custom quotes.

## Setup steps (same pattern as before)

### 1. Supabase
1. [supabase.com](https://supabase.com) → New Project (e.g. `nectarfusions`).
2. Once it's done provisioning, open **SQL Editor → New query**.
3. Paste in all of `supabase-schema.sql` (select-all-delete the box first,
   paste with Ctrl+V/Cmd+V, scroll down to confirm it pasted in full) → **Run**.
   This creates your tables *and* pre-loads your six core flavors.
   - If you hit a "policy already exists" error, run `supabase-schema-reset.sql`
     first, then run the full schema again.
4. Go to **Project Settings → API Keys**. Copy:
   - **Project URL** (`https://xxxxx.supabase.co`)
   - **Publishable key** (starts with `sb_publishable_...`) — this is the only
     key you need here. Never use the **secret** key (`sb_secret_...`) in this
     project — that one has full access to your database and must stay private.

### 2. GitHub
Upload everything in this folder (not the folder itself — its *contents*,
including the `src` folder) to a new repo, e.g. `nectarfusions-site`.

### 3. Netlify
1. **Add new site → Import an existing project** → connect the repo.
2. Build settings should read from `netlify.toml` automatically:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - (If your repo shows files inside a subfolder instead of at the top
     level, set **Base directory** to that folder name and **Publish directory**
     to `<that folder>/dist`.)
3. Before or after deploying, go to **Project configuration → Environment
   variables → Add a variable**, and add both:
   - `VITE_SUPABASE_URL` → your Project URL
   - `VITE_SUPABASE_ANON_KEY` → your publishable key
4. Deploy. If you added the env vars after the first deploy, go to
   **Deploys → Trigger deploy → Deploy site** to rebuild with them included.

Vendor login passcode is `nectarfusions` (gear icon, top right) — change
`ADMIN_PASSCODE` in `src/App.jsx` before sharing the link, then push the
change to GitHub to redeploy.

## Connecting order emails

Create a free form at [formspree.io](https://formspree.io) using
**info@nectar-fusions.com**, copy the endpoint URL it gives you
(`https://formspree.io/f/xxxxx`), and paste it into `FORMSPREE_ENDPOINT` near
the top of `src/App.jsx`. Both pickup orders and event requests will email
there. Formspree requires confirming the first submission via a link in your
inbox before live emails start arriving — send yourself a test order first.

## Changing prices, flavors, or the passcode later

Everything's near the top of `src/App.jsx`:
- `PRICE_4OZ`, `DEAL_QTY_4OZ`, `DEAL_PRICE_4OZ`, `PRICE_7OZ`, `PRICE_1LB`,
  `HALFGAL_PLAIN`, `HALFGAL_INFUSED` — pricing
- `ADMIN_PASSCODE` — vendor login
- `FORMSPREE_ENDPOINT` — where emails go
- `PLAIN_FLAVOR_NAME` — which flavor counts as "plain" for half-gallon pricing

Flavors themselves (adding seasonal ones, featuring specific ones) don't need
a code change at all — do that from the vendor Flavors tab on the live site.

After any code change: push to GitHub, Netlify rebuilds automatically.
