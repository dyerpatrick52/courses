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

export interface ScheduleSectionRow {
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

// Fetches all section rows for a set of courses in a given term.
// courses is an array of { subjectCode, courseCode } pairs (already split).
// Returns every meeting row ordered for deterministic grouping.
export async function getSectionsForCourses(
  termCode: string,
  courses: { subjectCode: string; courseCode: string }[]
): Promise<ScheduleSectionRow[]> {
  if (courses.length === 0) return [];

  const params: string[] = [termCode];
  const pairs = courses.map(({ subjectCode, courseCode }, i) => {
    params.push(subjectCode, courseCode);
    const a = params.length - 1;
    const b = params.length;
    return `($${a},$${b})`;
  });

  const result = await pool.query<ScheduleSectionRow>(
    `SELECT s.subject_code, s.course_code, s.section_code, s.meeting_index,
            s.component, s.session, s.days_times, s.instructor,
            s.date_start, s.date_end
     FROM sections s
     JOIN terms t ON t.id = s.term_id
     WHERE t.term_code = $1
       AND (s.subject_code, s.course_code) IN (${pairs.join(', ')})
     ORDER BY s.subject_code, s.course_code, s.section_code, s.meeting_index`,
    params
  );
  return result.rows;
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
