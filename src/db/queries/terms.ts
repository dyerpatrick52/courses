import pool from '../client';

export interface TermResult {
  id: number;
  term_code: string;
  term_name: string;
}

export async function getTerms(): Promise<TermResult[]> {
  const result = await pool.query<TermResult>(
    `SELECT id, term_code, term_name FROM terms ORDER BY term_code DESC`
  );
  return result.rows;
}

export interface TermRow {
  term_code: string;
  term_name: string;
}

export async function upsertTerm(term: TermRow): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO terms (term_code, term_name, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (term_code)
     DO UPDATE SET term_name = EXCLUDED.term_name, updated_at = NOW()
     RETURNING id`,
    [term.term_code, term.term_name]
  );
  return result.rows[0].id;
}
