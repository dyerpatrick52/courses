import pool from '../client';

export interface SectionRow {
  course_id:       number;
  section_code:    string;
  component:       string;
  status:          string;
  session:         string;
  instruction_mode: string;
  location:        string;
  campus:          string;
  date_start:      string;
  date_end:        string;
  grading_basis:   string;
  offer_number:    string;
  topic:           string;
  class_components: string;
  exam_days_times: string;
  exam_date:       string;
}

export interface MeetingRow {
  section_id: number;
  days_times: string;
  instructor: string;
  date_range: string;
}

export async function upsertSection(section: SectionRow): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO sections (
       course_id, section_code, component, status, session,
       instruction_mode, location, campus, date_start, date_end,
       grading_basis, offer_number, topic, class_components,
       exam_days_times, exam_date, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
     ON CONFLICT (course_id, section_code)
     DO UPDATE SET
       component        = EXCLUDED.component,
       status           = EXCLUDED.status,
       session          = EXCLUDED.session,
       instruction_mode = EXCLUDED.instruction_mode,
       location         = EXCLUDED.location,
       campus           = EXCLUDED.campus,
       date_start       = EXCLUDED.date_start,
       date_end         = EXCLUDED.date_end,
       grading_basis    = EXCLUDED.grading_basis,
       offer_number     = EXCLUDED.offer_number,
       topic            = EXCLUDED.topic,
       class_components = EXCLUDED.class_components,
       exam_days_times  = EXCLUDED.exam_days_times,
       exam_date        = EXCLUDED.exam_date,
       updated_at       = NOW()
     RETURNING id`,
    [
      section.course_id,
      section.section_code,
      section.component,
      section.status,
      section.session,
      section.instruction_mode,
      section.location,
      section.campus,
      section.date_start,
      section.date_end,
      section.grading_basis,
      section.offer_number,
      section.topic,
      section.class_components,
      section.exam_days_times,
      section.exam_date,
    ]
  );
  return result.rows[0].id;
}

export async function replaceMeetingsForSection(meetings: MeetingRow[]): Promise<void> {
  if (meetings.length === 0) return;

  const sectionId = meetings[0].section_id;

  await pool.query(`DELETE FROM section_meetings WHERE section_id = $1`, [sectionId]);

  for (const meeting of meetings) {
    await pool.query(
      `INSERT INTO section_meetings (section_id, days_times, instructor, date_range)
       VALUES ($1, $2, $3, $4)`,
      [meeting.section_id, meeting.days_times, meeting.instructor, meeting.date_range]
    );
  }
}
