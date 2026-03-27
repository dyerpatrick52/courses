CREATE TABLE IF NOT EXISTS terms (
  id           SERIAL PRIMARY KEY,
  term_code    VARCHAR(10)  NOT NULL UNIQUE,
  term_name    VARCHAR(100) NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id             SERIAL PRIMARY KEY,
  subject_code   VARCHAR(10)  NOT NULL UNIQUE,
  subject_name   VARCHAR(200) NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id             SERIAL PRIMARY KEY,
  subject_id     INTEGER      NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  course_code    VARCHAR(20)  NOT NULL,
  course_title   VARCHAR(300) NOT NULL,
  units          VARCHAR(200),
  description    TEXT,
  prerequisites  TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (subject_id, course_code)
);

CREATE TABLE IF NOT EXISTS sections (
  id            SERIAL PRIMARY KEY,
  term_id       INTEGER      NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  subject_code  VARCHAR(10)  NOT NULL,
  course_code   VARCHAR(20)  NOT NULL,
  section_code  VARCHAR(200) NOT NULL,
  meeting_index INTEGER      NOT NULL DEFAULT 0,
  component     VARCHAR(50),
  session       VARCHAR(200),
  days_times    VARCHAR(600),
  instructor    VARCHAR(600),
  date_start    VARCHAR(400),
  date_end      VARCHAR(400),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (term_id, subject_code, course_code, section_code, meeting_index)
);

CREATE INDEX IF NOT EXISTS idx_courses_subject_id ON courses(subject_id);
CREATE INDEX IF NOT EXISTS idx_sections_term_id   ON sections(term_id);
CREATE INDEX IF NOT EXISTS idx_sections_course    ON sections(subject_code, course_code);

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
