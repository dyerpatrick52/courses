CREATE TABLE IF NOT EXISTS terms (
  id           SERIAL PRIMARY KEY,
  term_code    VARCHAR(10)  NOT NULL UNIQUE,
  term_name    VARCHAR(100) NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id             SERIAL PRIMARY KEY,
  term_id        INTEGER      NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  subject_code   VARCHAR(10)  NOT NULL,
  subject_name   VARCHAR(200) NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (term_id, subject_code)
);

CREATE TABLE IF NOT EXISTS courses (
  id             SERIAL PRIMARY KEY,
  subject_id     INTEGER      NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_code    VARCHAR(20)  NOT NULL,
  course_title   VARCHAR(300) NOT NULL,
  course_id_ext  VARCHAR(20),
  units          VARCHAR(50),
  career         VARCHAR(100),
  description    TEXT,
  prerequisites  TEXT,
  attributes     TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, course_code)
);

CREATE TABLE IF NOT EXISTS sections (
  id               SERIAL PRIMARY KEY,
  course_id        INTEGER      NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_code     VARCHAR(50)  NOT NULL,
  component        VARCHAR(50),
  status           VARCHAR(20),
  session          VARCHAR(100),
  instruction_mode VARCHAR(100),
  location         VARCHAR(200),
  campus           VARCHAR(200),
  date_start       VARCHAR(50),
  date_end         VARCHAR(50),
  grading_basis    TEXT,
  offer_number     VARCHAR(10),
  topic            TEXT,
  class_components TEXT,
  exam_days_times  VARCHAR(100),
  exam_date        VARCHAR(50),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, section_code)
);

CREATE TABLE IF NOT EXISTS section_meetings (
  id           SERIAL PRIMARY KEY,
  section_id   INTEGER      NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  days_times   VARCHAR(100),
  instructor   VARCHAR(200),
  date_range   VARCHAR(100),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subjects_term_id    ON subjects(term_id);
CREATE INDEX IF NOT EXISTS idx_courses_subject_id  ON courses(subject_id);
CREATE INDEX IF NOT EXISTS idx_sections_course_id  ON sections(course_id);
CREATE INDEX IF NOT EXISTS idx_meetings_section_id ON section_meetings(section_id);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id               SERIAL PRIMARY KEY,
  started_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  status           VARCHAR(20)  NOT NULL DEFAULT 'running',
  terms_scraped    INTEGER      NOT NULL DEFAULT 0,
  subjects_scraped INTEGER      NOT NULL DEFAULT 0,
  courses_scraped  INTEGER      NOT NULL DEFAULT 0,
  sections_scraped INTEGER      NOT NULL DEFAULT 0,
  errors           JSONB        NOT NULL DEFAULT '[]'
);
