import pool from '../client';

export interface CourseResult {
  id: number;
  course_code: string;
  course_title: string;
  units: string;
  description: string;
  prerequisites: string;
}

export async function getCoursesBySubjectCode(subjectCode: string): Promise<CourseResult[]> {
  const result = await pool.query<CourseResult>(
    `SELECT c.id, c.course_code, c.course_title, c.units, c.description, c.prerequisites
     FROM courses c
     JOIN subjects s ON s.id = c.subject_id
     WHERE s.subject_code = $1
     ORDER BY c.course_code`,
    [subjectCode]
  );
  return result.rows;
}

export async function getCoursesBySubjectId(subjectId: number): Promise<CourseResult[]> {
  const result = await pool.query<CourseResult>(
    `SELECT id, course_code, course_title, units, description, prerequisites
     FROM courses
     WHERE subject_id = $1
     ORDER BY course_code`,
    [subjectId]
  );
  return result.rows;
}

export interface CourseRow {
  subject_id:    number;
  course_code:   string;
  course_title:  string;
  units:         string;
  description:   string;
  prerequisites: string;
}


export async function upsertCourse(course: CourseRow): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO courses (subject_id, course_code, course_title, units, description, prerequisites, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (subject_id, course_code)
     DO UPDATE SET
       course_title  = EXCLUDED.course_title,
       units         = EXCLUDED.units,
       description   = EXCLUDED.description,
       prerequisites = EXCLUDED.prerequisites,
       updated_at    = NOW()
     RETURNING id`,
    [
      course.subject_id,
      course.course_code,
      course.course_title,
      course.units,
      course.description,
      course.prerequisites,
    ]
  );
  return result.rows[0].id;
}
