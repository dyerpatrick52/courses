import pool from '../client';

export interface SubjectRow {
  term_id: number;
  subject_code: string;
  subject_name: string;
}

export async function upsertSubject(subject: SubjectRow): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO subjects (term_id, subject_code, subject_name, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (term_id, subject_code)
     DO UPDATE SET subject_name = EXCLUDED.subject_name, updated_at = NOW()
     RETURNING id`,
    [subject.term_id, subject.subject_code, subject.subject_name]
  );
  return result.rows[0].id;
}
