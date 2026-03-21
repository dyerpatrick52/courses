import pool from '../client';

export interface RunError {
  term?:    string;
  subject?: string;
  course?:  string;
  message:  string;
}

export interface RunStats {
  terms_scraped:    number;
  subjects_scraped: number;
  courses_scraped:  number;
  sections_scraped: number;
  errors:           RunError[];
}

export async function insertScrapeRun(): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO scrape_runs (started_at, status)
     VALUES (NOW(), 'running')
     RETURNING id`
  );
  return result.rows[0].id;
}

export async function completeScrapeRun(runId: number, stats: RunStats): Promise<void> {
  const status = deriveRunStatus(stats);

  await pool.query(
    `UPDATE scrape_runs
     SET
       finished_at      = NOW(),
       status           = $1,
       terms_scraped    = $2,
       subjects_scraped = $3,
       courses_scraped  = $4,
       sections_scraped = $5,
       errors           = $6
     WHERE id = $7`,
    [
      status,
      stats.terms_scraped,
      stats.subjects_scraped,
      stats.courses_scraped,
      stats.sections_scraped,
      JSON.stringify(stats.errors),
      runId,
    ]
  );
}

export async function failScrapeRun(runId: number, message: string): Promise<void> {
  await pool.query(
    `UPDATE scrape_runs
     SET finished_at = NOW(), status = 'failed', errors = $1
     WHERE id = $2`,
    [JSON.stringify([{ message }]), runId]
  );
}

function deriveRunStatus(stats: RunStats): string {
  if (stats.errors.length === 0) return 'success';
  if (stats.terms_scraped === 0) return 'failed';
  return 'partial';
}
