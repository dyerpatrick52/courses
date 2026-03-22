import { Page } from 'playwright';
import { launchBrowser, closeBrowser } from './browser';
import { navigateToSearchPage } from './navigation';
import { scrapeTerms } from './terms';
import { scrapeSubjects, ScrapedSubject } from './subjects';
import { scrapeCoursesForSubject, ScrapedCourse } from './courses';
import { scrapeSectionsForSubject, ScrapedSectionDetail } from './sections';
import { withRetry } from './retry';
import { upsertTerm } from '../db/queries/terms';
import { upsertSubject } from '../db/queries/subjects';
import { upsertCourse } from '../db/queries/courses';
import { upsertSection, replaceMeetingsForSection } from '../db/queries/sections';
import { insertScrapeRun, completeScrapeRun, failScrapeRun, RunError, RunStats } from '../db/queries/runs';

// Main entry point, called by the cron scheduler or manually triggered.
// Orchestrates the full scrape in this order:
//   1. Scrape all subjects from the catalogue (term-independent)
//   2. Scrape course details (title, description, prereqs) per subject
//   3. Scrape available terms from the class search
//   4. For each term × subject: search for sections and store them
//
// A scrape_run record is written to the DB at the start and updated with
// stats or a failure message when the run finishes.
export async function runScraper(): Promise<void> {
  console.log(`[scraper] Starting run at ${new Date().toISOString()}`);

  const runId = await insertScrapeRun();
  const stats = makeEmptyStats();
  const session = await launchBrowser();

  try {
    // Subjects come from the catalogue index page, not the class search.
    // We scrape them once and reuse the list for every term.
    const subjects = await withRetry(() => scrapeSubjects(session.page));
    console.log(`[scraper] Found ${subjects.length} subjects in catalogue`);

    // Course metadata (title, description, prereqs) comes from the catalogue
    // too. We scrape these once and upsert them under every term's subject.
    const catalogueCourses = await scrapeAllCatalogCourses(session.page, subjects, stats);

    // Terms come from the class search page's dropdown. Navigate there first.
    await withRetry(() => navigateToSearchPage(session.page));
    const terms = await withRetry(() => scrapeTerms(session.page));
    console.log(`[scraper] Found ${terms.length} terms`);

    // Optional env var to limit scraping to a specific term by name substring.
    // e.g. TERM_FILTER=Spring only scrapes terms whose name contains "Spring".
    // If unset, all terms are scraped.
    const termFilter = process.env.TERM_FILTER?.toLowerCase();
    const filteredTerms = termFilter
      ? terms.filter(t => t.term_name.toLowerCase().includes(termFilter))
      : terms;
    console.log(`[scraper] Scraping ${filteredTerms.length} term(s)${termFilter ? ` (filter: "${termFilter}")` : ''}`);

    for (const term of filteredTerms) {
      await scrapeAndStoreTerm(session.page, term, subjects, catalogueCourses, stats);
    }

    await completeScrapeRun(runId, stats);
    console.log(`[scraper] Run complete — ${stats.terms_scraped} terms, ${stats.subjects_scraped} subjects, ${stats.courses_scraped} courses, ${stats.sections_scraped} sections, ${stats.errors.length} errors`);
  } catch (err) {
    // Any unrecovered error (e.g. DB connection lost, browser crashed) lands
    // here. The run is marked failed so we can distinguish it from a clean run.
    const message = toErrorMessage(err);
    console.error(`[scraper] Fatal error: ${message}`);
    await failScrapeRun(runId, message);
  } finally {
    await closeBrowser(session);
  }
}

// Visits the catalogue page for each subject and collects course metadata.
// Returns a Map of subjectCode → courses so the term loop can look them up
// without re-scraping the catalogue on every term.
async function scrapeAllCatalogCourses(
  page: Page,
  subjects: ScrapedSubject[],
  stats: RunStats
): Promise<Map<string, ScrapedCourse[]>> {
  const map = new Map<string, ScrapedCourse[]>();

  for (const subject of subjects) {
    try {
      const courses = await withRetry(() => scrapeCoursesForSubject(page, subject.subject_code));
      map.set(subject.subject_code, courses);
    } catch (err) {
      recordError(stats, { subject: subject.subject_code, message: toErrorMessage(err) });
    }
  }

  return map;
}

// Upserts the term row, then processes every subject under it.
async function scrapeAndStoreTerm(
  page: Page,
  term: { term_code: string; term_name: string },
  subjects: ScrapedSubject[],
  catalogueCourses: Map<string, ScrapedCourse[]>,
  stats: RunStats
): Promise<void> {
  console.log(`[scraper] Term: ${term.term_name}`);

  try {
    const termId = await upsertTerm(term);

    for (const subject of subjects) {
      await scrapeAndStoreSubject(page, termId, term, subject, catalogueCourses, stats);
    }

    stats.terms_scraped++;
  } catch (err) {
    recordError(stats, { term: term.term_name, message: toErrorMessage(err) });
  }
}

// Upserts the subject row, upserts all catalogue courses under it, then
// scrapes and stores the live section data for this term + subject combination.
async function scrapeAndStoreSubject(
  page: Page,
  termId: number,
  term: { term_code: string; term_name: string },
  subject: ScrapedSubject,
  catalogueCourses: Map<string, ScrapedCourse[]>,
  stats: RunStats
): Promise<void> {
  console.log(`[scraper]   Subject: ${subject.subject_code}`);

  try {
    const subjectId = await upsertSubject({ term_id: termId, ...subject });

    // Write catalogue courses into the DB first so that when we scrape
    // sections we can look up the DB course ID by course code.
    const courses = catalogueCourses.get(subject.subject_code) ?? [];
    const courseIdMap = await upsertAllCatalogCourses(subjectId, courses);

    await scrapeAndStoreSections(page, term, subject, courseIdMap, stats);

    stats.subjects_scraped++;
  } catch (err) {
    recordError(stats, { term: term.term_name, subject: subject.subject_code, message: toErrorMessage(err) });
  }
}

// Upserts every course in the catalogue for this subject and returns a map
// of course_code → DB id so section upserts can reference the correct row.
async function upsertAllCatalogCourses(
  subjectId: number,
  courses: ScrapedCourse[]
): Promise<Map<string, number>> {
  const courseIdMap = new Map<string, number>();

  for (const course of courses) {
    const courseId = await upsertCourse({
      subject_id:    subjectId,
      course_code:   course.course_code,
      course_title:  course.course_title,
      course_id_ext: '',
      units:         course.units,
      career:        '',
      description:   course.description,
      prerequisites: course.prerequisites,
      attributes:    '',
    });
    courseIdMap.set(course.course_code, courseId);
  }

  return courseIdMap;
}

// Performs the actual class search for this term + subject, then stores each
// section and its meeting rows. Sections whose course code isn't in the
// catalogue are skipped with a warning (shouldn't normally happen).
async function scrapeAndStoreSections(
  page: Page,
  term: { term_code: string; term_name: string },
  subject: ScrapedSubject,
  courseIdMap: Map<string, number>,
  stats: RunStats
): Promise<void> {
  const courseSections = await withRetry(() =>
    scrapeSectionsForSubject(page, term.term_code, subject.subject_code)
  );

  for (const { course_code, sections } of courseSections) {
    try {
      const courseId = courseIdMap.get(course_code);
      if (!courseId) {
        console.warn(`[scraper]     ${course_code} not in catalogue — skipping sections`);
        continue;
      }
      await storeAllSections(courseId, sections, stats);
      stats.courses_scraped++;
    } catch (err) {
      recordError(stats, {
        term:    term.term_name,
        subject: subject.subject_code,
        course:  course_code,
        message: toErrorMessage(err),
      });
    }
  }
}

async function storeAllSections(
  courseId: number,
  sections: ScrapedSectionDetail[],
  stats: RunStats
): Promise<void> {
  for (const section of sections) {
    await storeSection(courseId, section, stats);
  }
}

// Upserts the section row, then replaces all its meeting rows atomically
// (delete old rows, insert new ones) so stale meetings don't accumulate.
async function storeSection(
  courseId: number,
  detail: ScrapedSectionDetail,
  stats: RunStats
): Promise<void> {
  const sectionId = await upsertSection({
    course_id:        courseId,
    section_code:     detail.section_code,
    component:        detail.component,
    status:           detail.status,
    session:          detail.session,
    instruction_mode: detail.instruction_mode,
    location:         detail.location,
    campus:           detail.campus,
    date_start:       detail.date_start,
    date_end:         detail.date_end,
    grading_basis:    detail.grading_basis,
    offer_number:     detail.offer_number,
    topic:            detail.topic,
    class_components: detail.class_components,
    exam_days_times:  detail.exam_days_times,
    exam_date:        detail.exam_date,
  });

  await replaceMeetingsForSection(detail.meetings.map(m => ({ section_id: sectionId, ...m })));

  stats.sections_scraped++;
}

function makeEmptyStats(): RunStats {
  return {
    terms_scraped:    0,
    subjects_scraped: 0,
    courses_scraped:  0,
    sections_scraped: 0,
    errors:           [],
  };
}

function recordError(stats: RunStats, error: RunError): void {
  console.error(`[scraper] Error — ${JSON.stringify(error)}`);
  stats.errors.push(error);
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
