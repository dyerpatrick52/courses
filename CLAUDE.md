# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A scheduled web scraper for the [uOttawa Public Class Search](https://uocampus.public.uottawa.ca/psc/csprpr9pub/EMPLOYEE/SA/c/UO_SR_AA_MODS.UO_PUB_CLSSRCH.GBL). It uses Playwright to scrape terms, subjects, courses, and sections into a PostgreSQL database. Runs on a cron schedule (Jan 1, May 1, Sep 1 at 02:00) inside Docker.

## Commands

```bash
# Development (local, requires .env with POSTGRES_HOST=localhost)
npm run dev           # run with ts-node
npm run build         # compile TypeScript to dist/
npm start             # run compiled output

# Test a single scrape without waiting for cron
npm run test:scrape   # runs test-scrape.ts

# Docker (primary workflow)
docker compose up --build     # start db + scraper
docker compose down           # stop (data preserved)
docker compose down -v        # stop and wipe database volume

# Trigger a manual scrape run against a running Docker instance
docker compose run --rm scraper node -e "require('./dist/scraper').runScraper()"

# Trigger a manual scrape run against a running Docker instance
docker compose run --rm scraper node -e "require('./dist/scraper').runSections()"

# Logs
docker compose logs -f scraper
```

## Deploying to Server

SSH into the server, then:

```bash
git pull
docker compose up --build -d          # rebuild and restart all services

# If only frontend/API changed (faster — skips scraper rebuild):
docker compose up --build -d api frontend
```

The frontend is served on port 80. The database volume is preserved across rebuilds.

## Architecture

The scraper runs as a long-lived process that waits for cron triggers. On each run:

1. `src/index.ts` → starts `src/scheduler/index.ts` (node-cron)
2. Scheduler calls `src/scraper/index.ts:runScraper()`
3. `runScraper()` orchestrates the full scrape: browser → terms → subjects → courses → sections
4. Each scrape operation wraps calls in `withRetry()` (3 attempts, 2s delay) from `src/scraper/retry.ts`
5. Scraped data is upserted into PostgreSQL via `src/db/queries/`

**Scraper layer** (`src/scraper/`):
- `browser.ts` — launches/closes Playwright Chromium
- `navigation.ts` — page interactions and CSS selectors
- `terms.ts`, `subjects.ts`, `courses.ts`, `sections.ts` — each scrape their respective data from the uOttawa site
- `index.ts` — orchestrator that calls scrape → upsert in nested loops (term → subject → course → section)

**Database layer** (`src/db/`):
- `client.ts` — single `pg.Pool` instance, configured from env vars
- `queries/terms.ts`, `queries/subjects.ts`, `queries/courses.ts`, `queries/sections.ts` — upsert functions
- `queries/runs.ts` — tracks scrape run metadata in `scrape_runs` table (status, counts, errors as JSONB)

**Schema** (`init/schema.sql`): auto-applied by PostgreSQL on first container start. Hierarchy: `terms → subjects → courses → sections → section_meetings`. The `scrape_runs` table logs every run.

## Environment Variables

Copy `.env.example` to `.env`. When running locally (not in Docker), set `POSTGRES_HOST=localhost`. In Docker, `POSTGRES_HOST=db` (the compose service name).

## Changing the Schedule

Edit the cron expression in `src/scheduler/index.ts`. Current: `'0 2 1 1,5,9 *'` (02:00 on Jan 1, May 1, Sep 1).

## Frontend (`frontend/`)

Vite + React + TypeScript + Tailwind v4 (via `@tailwindcss/vite` plugin).

```bash
cd frontend && npm run dev   # dev server at http://localhost:5173
cd frontend && npm run build # production build
```

The Vite dev server proxies `/api/*` → `http://localhost:3000` (the Express API). Keep Docker running when doing frontend dev.

### Conventions
- **Components**: functional components only, no class components
- **Styling**: Tailwind utility classes only — no separate CSS files, no inline `style` except for dynamic values (e.g. calculated positions/heights)
- **Types**: all API response shapes are defined in `frontend/src/api/types.ts` — keep them in sync with the backend interfaces in `src/api/schedules.ts`
- **API calls**: all `fetch` calls go through `frontend/src/api/client.ts` — never call `fetch` directly in a component
- **State**: keep state as high as needed but no higher — lift to `App.tsx` only when multiple siblings need it
- **File structure**: one component per file, named to match the export (e.g. `CalendarGrid.tsx` exports `CalendarGrid`)
- **No useEffect for derived data**: compute derived values inline during render instead of syncing into state with `useEffect`
