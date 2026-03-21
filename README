# courses

Automated scraper for the [uOttawa Public Class Search](https://uocampus.public.uottawa.ca/psc/csprpr9pub/EMPLOYEE/SA/c/UO_SR_AA_MODS.UO_PUB_CLSSRCH.GBL).

Scrapes all terms, subjects, courses, and section details into a PostgreSQL database. Runs automatically on a schedule every term.

---

## What Gets Scraped

| Data | Details |
|---|---|
| **Terms** | Term code and name (e.g. `2261` → `2026 Winter Term`) |
| **Subjects** | Subject code and name per term (e.g. `CSI` → `Computer Science`) |
| **Courses** | Code, title, units, career, description, prerequisites, attributes |
| **Sections** | Section code, status, component, session, instruction mode, location, campus, dates, grading, exam info, topic |
| **Meetings** | Days & times, instructor, date range per meeting slot |

---

## Prerequisites

Install these before anything else:

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (free) — runs the database and scraper
- [Git](https://git-scm.com/downloads) — for version control
- [VS Code](https://code.visualstudio.com) (recommended) — for editing

---

## Setup

### 1. Clone the repository

```powershell
git clone https://github.com/your-username/courses.git
cd courses
```

### 2. Configure environment variables

Copy the example env file and open it:

```powershell
copy .env.example .env
```

Open `.env` and set a secure password:

```env
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=courses
POSTGRES_USER=courses_user
POSTGRES_PASSWORD=your_secure_password_here
```

> ⚠️ `.env` is gitignored and will never be committed. Never commit real credentials.

### 3. Start Docker Desktop

Open Docker Desktop and wait for it to finish starting (the whale icon in the taskbar stops animating).

---

## Running

### Start everything

```powershell
docker compose up --build
```

This will:
1. Pull and start a PostgreSQL container
2. Automatically create all database tables from `init/schema.sql`
3. Build and start the scraper container
4. The scraper will wait silently for the next scheduled run

### Stop everything

```powershell
docker compose down
```

Your database data is preserved in a Docker volume — it will still be there next time you run `docker compose up`.

### Wipe the database and start fresh

```powershell
docker compose down -v
```

> ⚠️ The `-v` flag deletes the database volume. All scraped data will be lost.

---

## Schedule

The scraper runs automatically **three times per year**:

| Date | Term |
|---|---|
| January 1 at 02:00 | Winter term |
| May 1 at 02:00 | Spring/Summer term |
| September 1 at 02:00 | Fall term |

### Trigger a manual run

If you want to run the scraper immediately without waiting for the schedule:

```powershell
docker compose run --rm scraper node -e "require('./dist/scraper').runScraper()"
```

---

## Database

PostgreSQL runs inside Docker on port `5432`. You can connect to it with any database client (e.g. [DBeaver](https://dbeaver.io), [pgAdmin](https://www.pgadmin.org), TablePlus):

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `courses` |
| User | `courses_user` |
| Password | *(whatever you set in `.env`)* |

### Schema

```
terms
  └── subjects        (term_id → terms)
        └── courses   (subject_id → subjects)
              └── sections       (course_id → courses)
                    └── section_meetings  (section_id → sections)
```

---

## Project Structure

```
courses/
  src/
    index.ts                  ← Entry point, starts the scheduler
    scheduler/
      index.ts                ← Cron job (Jan 1, May 1, Sep 1)
    db/
      client.ts               ← PostgreSQL connection pool
      queries/
        terms.ts              ← Upsert terms
        subjects.ts           ← Upsert subjects
        courses.ts            ← Upsert courses
        sections.ts           ← Upsert sections and meetings
    scraper/
      browser.ts              ← Playwright browser launch/close
      navigation.ts           ← Page interactions and selectors
      terms.ts                ← Scrape term dropdown
      subjects.ts             ← Scrape A–Z subject lookup modal
      courses.ts              ← Scrape search results per subject
      sections.ts             ← Scrape detail page per section
      index.ts                ← Scraper orchestrator
  init/
    schema.sql                ← Auto-run by PostgreSQL on first start
  .env                        ← Your credentials (gitignored)
  .env.example                ← Safe template to commit
  docker-compose.yml          ← Defines db and scraper containers
  Dockerfile                  ← Builds the scraper image
  package.json
  tsconfig.json
```

---

## Viewing Logs

```powershell
# All containers
docker compose logs -f

# Scraper only
docker compose logs -f scraper

# Database only
docker compose logs -f db
```

---

## GitHub

### First push

```powershell
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/your-username/courses.git
git push -u origin main
```

### Subsequent pushes

```powershell
git add .
git commit -m "your message"
git push
```

---

## Troubleshooting

**Docker Desktop not running**
> Make sure Docker Desktop is open and fully started before running `docker compose up`.

**Port 5432 already in use**
> Another PostgreSQL instance is running on your machine. Stop it, or change the port in `docker-compose.yml` and `.env`.

**Scraper fails to connect to the database**
> The scraper waits for the database to be healthy before starting. If it still fails, run `docker compose down` and `docker compose up --build` again.

**Want to change the schedule?**
> Edit the cron expression in `src/scheduler/index.ts`. Cron format: `minute hour day month weekday`.
