import { Page, ElementHandle } from 'playwright';

// The uOttawa course catalogue, one page per subject (e.g. /en/courses/csi/).
// Each page lists every course offered under that subject with title, units,
// description, and prerequisites.
const CATALOGUE_BASE_URL = 'https://catalogue.uottawa.ca/en/courses';

export interface ScrapedCourse {
  course_code:   string;
  course_title:  string;
  units:         string;
  description:   string;
  prerequisites: string;
}

// Intermediate structure holding raw text before we parse it into fields.
interface RawCourseBlock {
  titleText:     string;
  description:   string;
  prerequisites: string;
}

// Navigates to the catalogue page for a subject and returns all courses on it.
// subjectCode is lowercased to build the URL (e.g. "CSI" → /en/courses/csi/).
export async function scrapeCoursesForSubject(
  page: Page,
  subjectCode: string
): Promise<ScrapedCourse[]> {
  await page.goto(`${CATALOGUE_BASE_URL}/${subjectCode.toLowerCase()}/`, { waitUntil: 'networkidle' });
  return extractCourses(page);
}

// Finds all .courseblock elements on the page, extracts raw text from each,
// then parses them into ScrapedCourse objects. Invalid blocks are dropped.
async function extractCourses(page: Page): Promise<ScrapedCourse[]> {
  const rawBlocks = await extractRawBlocks(page);
  return rawBlocks.map(parseCourseBlock).filter((c): c is ScrapedCourse => c !== null);
}

// Each .courseblock on the catalogue page contains a title, a description,
// and optionally a prerequisites/notes block. We grab all three as raw text.
async function extractRawBlocks(page: Page): Promise<RawCourseBlock[]> {
  const blocks = await page.$$('.courseblock');
  return Promise.all(blocks.map(extractRawBlock));
}

async function extractRawBlock(block: ElementHandle): Promise<RawCourseBlock> {
  const titleEl  = await block.$('.courseblocktitle');
  const descEl   = await block.$('.courseblockdesc');
  const prereqEl = await block.$('.courseblockextra.highlight');
  return {
    titleText:     ((await titleEl?.textContent())  ?? '').trim(),
    description:   ((await descEl?.textContent())   ?? '').trim(),
    prerequisites: ((await prereqEl?.textContent()) ?? '').trim(),
  };
}

// Combines the parsed title fields with description and prerequisites.
// Returns null if the title line can't be parsed (malformed catalogue entry).
function parseCourseBlock(raw: RawCourseBlock): ScrapedCourse | null {
  const header = parseCourseTitle(raw.titleText);
  if (!header) return null;
  return {
    ...header,
    description:   raw.description,
    prerequisites: raw.prerequisites,
  };
}

// Parses a title line like "CSI 2110 Data Structures and Algorithms (3 units)"
// into code, title, and units. The regex requires: subject+number, then title
// text, then the units in parentheses at the end.
function parseCourseTitle(text: string): { course_code: string; course_title: string; units: string } | null {
  const match = text.match(/^([A-Z]{2,6}\s+\d{4}[A-Z]?)\s+(.+?)\s+\((.+?)\)\s*$/);
  if (!match) return null;
  return {
    course_code:  match[1].trim(),
    course_title: match[2].trim(),
    units:        match[3].trim(),
  };
}
