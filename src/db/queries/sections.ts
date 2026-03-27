import pool from '../client';

export interface SectionResult {
  id:            number;
  section_code:  string;
  meeting_index: number;
  component:     string;
  session:       string;
  days_times:    string;
  instructor:    string;
  date_start:    string;
  date_end:      string;
}

export async function getSectionsByCourseCode(
  termCode: string,
  subjectCode: string,
  courseCode: string
): Promise<SectionResult[]> {
  const result = await pool.query<SectionResult>(
    `SELECT s.id, s.section_code, s.meeting_index, s.component, s.session,
            s.days_times, s.instructor, s.date_start, s.date_end
     FROM sections s
     JOIN terms t ON t.id = s.term_id
     WHERE t.term_code = $1 AND s.subject_code = $2 AND s.course_code = $3
     ORDER BY s.section_code, s.meeting_index`,
    [termCode, subjectCode, courseCode]
  );
  return result.rows;
}

export interface SectionRow {
  term_id:       number;
  subject_code:  string;
  course_code:   string;
  section_code:  string;
  meeting_index: number;
  component:     string;
  session:       string;
  days_times:    string;
  instructor:    string;
  date_start:    string;
  date_end:      string;
}

// Replaces all meeting rows for a section with the provided list.
// Deletes existing meetings first so stale rows (e.g. count changed) don't linger.
export async function upsertSectionMeetings(meetings: SectionRow[]): Promise<void> {
  if (meetings.length === 0) return;
  const { term_id, subject_code, course_code, section_code } = meetings[0];
  await pool.query(
    `DELETE FROM sections WHERE term_id=$1 AND subject_code=$2 AND course_code=$3 AND section_code=$4`,
    [term_id, subject_code, course_code, section_code]
  );
  for (const m of meetings) {
    await pool.query(
      `INSERT INTO sections (
         term_id, subject_code, course_code, section_code, meeting_index,
         component, session, days_times, instructor, date_start, date_end
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        m.term_id, m.subject_code, m.course_code, m.section_code, m.meeting_index,
        m.component, m.session, m.days_times, m.instructor, m.date_start, m.date_end,
      ]
    );
  }
}
