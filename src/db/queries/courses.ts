import pool from '../client';

export interface CourseRow {
  subject_id:   number;
  course_code:  string;
  course_title: string;
  course_id_ext: string;
  units:        string;
  career:       string;
  description:  string;
  prerequisites: string;
  attributes:   string;
}

export async function upsertCourse(course: CourseRow): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO courses (
       subject_id, course_code, course_title, course_id_ext,
       units, career, description, prerequisites, attributes, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (subject_id, course_code)
     DO UPDATE SET
       course_title  = EXCLUDED.course_title,
       course_id_ext = EXCLUDED.course_id_ext,
       units         = EXCLUDED.units,
       career        = EXCLUDED.career,
       description   = EXCLUDED.description,
       prerequisites = EXCLUDED.prerequisites,
       attributes    = EXCLUDED.attributes,
       updated_at    = NOW()
     RETURNING id`,
    [
      course.subject_id,
      course.course_code,
      course.course_title,
      course.course_id_ext,
      course.units,
      course.career,
      course.description,
      course.prerequisites,
      course.attributes,
    ]
  );
  return result.rows[0].id;
}
