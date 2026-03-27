import pool from '../client';

export interface SubjectResult {
  id: number;
  subject_code: string;
  subject_name: string;
}

export async function getAllSubjects(): Promise<SubjectResult[]> {
  const result = await pool.query<SubjectResult>(
    `SELECT id, subject_code, subject_name
     FROM subjects
     ORDER BY subject_code`
  );
  return result.rows;
}

export interface SubjectRow {
  subject_code: string;
  subject_name: string;
}

export async function upsertSubject(subject: SubjectRow): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO subjects (subject_code, subject_name, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (subject_code)
     DO UPDATE SET subject_name = EXCLUDED.subject_name, updated_at = NOW()
     RETURNING id`,
    [subject.subject_code, subject.subject_name]
  );
  return result.rows[0].id;
}
