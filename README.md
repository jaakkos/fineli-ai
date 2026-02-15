# Fineli AI — Ruokapäiväkirja

A Finnish food diary app powered by the [Fineli](https://fineli.fi) food database. Log meals via natural language (e.g. “kaurapuuroa ja maitoa”), get nutrient summaries, and export to Excel.

- **Tech:** Next.js 16, React 19, Drizzle ORM, PostgreSQL (or SQLite for local dev), Tailwind CSS
- **License:** [MIT](LICENSE)

## Prerequisites

- Node.js 20+
- pnpm (or npm / yarn)
- PostgreSQL 14+ (for production and optional local dev), or SQLite for local-only

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/YOUR_USERNAME/fineli-ai.git
   cd fineli-ai
   pnpm install
   ```

2. **Environment variables**

   Copy the example env and edit as needed:

   ```bash
   cp .env.example .env.local
   ```

   Required:

   - `SESSION_SECRET` — secret for signing session cookies (e.g. `openssl rand -hex 32`)
   - `DATABASE_URL` — PostgreSQL connection string (Render sets this automatically when you add a Postgres instance)

   Optional:

   - `NEXT_PUBLIC_APP_URL` — public app URL (default `http://localhost:3000`)
   - `FINELI_API_BASE_URL` — Fineli API base (default `https://fineli.fi/fineli/api/v1`)
   - AI: set `AI_PROVIDER` and `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for AI-powered parsing/ranking

3. **Database**

   - **PostgreSQL (recommended for production):** Create a database and run migrations:

     ```bash
     pnpm db:migrate
     pnpm db:seed
     ```

   - **SQLite (local dev):** Use `DATABASE_URL=file:./data/fineli.db` and run the same migrate/seed commands.

4. **Run**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command        | Description                |
|----------------|----------------------------|
| `pnpm dev`    | Start dev server           |
| `pnpm build`  | Production build           |
| `pnpm start`  | Start production server     |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations          |
| `pnpm db:seed`   | Seed export template       |
| `pnpm test:run`  | Run unit tests            |

## Deploy on Render

[Render](https://render.com) offers a free PostgreSQL instance and free-tier web services.

### Option A: Blueprint (recommended)

A `render.yaml` in the repo defines a Web Service and a **free PostgreSQL** database. After connecting the repo to Render:

1. In the Render Dashboard, go to **Blueprints** and create a new Blueprint from this repo.
2. Render will create the PostgreSQL database and the Web Service, and link `DATABASE_URL` automatically.
3. Set **SESSION_SECRET** in the Web Service environment (e.g. generate with `openssl rand -hex 32`).
4. Deploy. The build runs `pnpm db:migrate:pg` and `pnpm db:seed` before `pnpm build`.

**Note:** The app supports both SQLite (default, `DATABASE_URL=file:...`) and PostgreSQL. When `DATABASE_URL` is a `postgres://` URL, the app uses the async PostgreSQL client. Local dev typically uses SQLite; Render uses the free Postgres from the Blueprint.

### Option B: Manual setup

1. Create a **PostgreSQL** database (Dashboard → New → PostgreSQL). Copy the **Internal Database URL**.
2. Create a **Web Service**, connect the repo, set:
   - **Build:** `pnpm install && pnpm db:migrate:pg && pnpm db:seed && pnpm build`
   - **Start:** `pnpm start`
   - **Env:** `SESSION_SECRET` (required), `DATABASE_URL` = the Internal Database URL from step 1.

After deploy, set `NEXT_PUBLIC_APP_URL` to your service URL if you use auth callbacks or absolute links.

### Magic-link–only and email on Render

When deployed, you can allow **only magic link login** (no anonymous users):

1. In the Web Service environment, set:
   - `REQUIRE_MAGIC_LINK=true`
   - `NEXT_PUBLIC_REQUIRE_MAGIC_LINK=true`
   - `NEXT_PUBLIC_APP_URL` = your Render service URL (e.g. `https://fineli-ai.onrender.com`)

2. **Sending email:** Render’s free tier [blocks outbound SMTP](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports). Use an HTTP-based provider instead:
   - **[Resend](https://resend.com)** (recommended): free tier 3,000 emails/month. Sign up, create an API key, add `RESEND_API_KEY` to the Web Service. Optionally set `RESEND_FROM` (e.g. `Ruokapäiväkirja <noreply@yourdomain.com>`); otherwise Resend’s default sender is used.
   - Alternatives: SendGrid, Mailgun, Postmark (each has a free tier and HTTP API).

Without `RESEND_API_KEY`, magic link emails are only logged in development; in production the API returns 503 until email is configured.

## Project structure

- `src/app/` — Next.js App Router (pages, API routes)
- `src/components/` — React UI components
- `src/lib/` — DB client, auth, Fineli client, conversation engine, AI, utils
- `src/types/` — Shared TypeScript types
- `drizzle/` — SQL migrations (PostgreSQL)

## License

MIT. See [LICENSE](LICENSE).
