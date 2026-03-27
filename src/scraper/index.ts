import { launchBrowser, closeBrowser } from './browser';
import { navigateToSearchPage } from './navigation';
import { scrapeTerms } from './terms';
import { scrapeSubjects } from './subjects';
import { scrapeCoursesForSubject } from './courses';
import { scrapeSectionsForSubject } from './sections';
import { withRetry } from './retry';
import { upsertTerm } from '../db/queries/terms';
import { getAllSubjects, upsertSubject } from '../db/queries/subjects';
import { upsertCourse } from '../db/queries/courses';
import { upsertSectionMeetings } from '../db/queries/sections';
import { insertScrapeRun, completeScrapeRun, failScrapeRun, RunError, RunStats } from '../db/queries/runs';
import { ScrapedSectionResult } from './sections';

export async function runScraper(): Promise<void> {
  console.log(`[scraper] Starting run at ${new Date().toISOString()}`);

  const runId = await insertScrapeRun();
  const stats = makeEmptyStats();
  const session = await launchBrowser();

  try {
    // ── Phase 1: Subjects ────────────────────────────────────────────────────
    // Scrape all subjects from the catalogue index and store them in the DB.
    // This is term-independent — the subject list is the same across all terms.
    console.log('[scraper] Phase 1: Scraping subjects from catalogue');
    const scrapedSubjects = await withRetry(() => scrapeSubjects(session.page));
    for (const subject of scrapedSubjects) {
      await upsertSubject(subject);
    }
    console.log(`[scraper] Phase 1 complete — ${scrapedSubjects.length} subjects stored`);

    // ── Phase 2: Catalogue Courses ───────────────────────────────────────────
    // For each subject in the DB, visit its catalogue page and store course
    // metadata (title, units, description, prerequisites). Term-independent.
    console.log('[scraper] Phase 2: Scraping catalogue courses per subject');
    const subjects = await getAllSubjects();
    for (let i = 0; i < subjects.length; i++) {
      const subject = subjects[i];
      console.log(`[scraper]   Subject ${i + 1}/${subjects.length}: ${subject.subject_code}`);
      try {
        const courses = await withRetry(() => scrapeCoursesForSubject(session.page, subject.subject_code));
        for (const course of courses) {
          await upsertCourse({
            subject_id:    subject.id,
            course_code:   course.course_code,
            course_title:  course.course_title,
            units:         course.units,
            description:   course.description,
            prerequisites: course.prerequisites,
          });
          stats.courses_scraped++;
        }
        stats.subjects_scraped++;
      } catch (err) {
        recordError(stats, { subject: subject.subject_code, message: toErrorMessage(err) });
      }
    }
    console.log(`[scraper] Phase 2 complete — ${stats.courses_scraped} courses stored`);

    // ── Phase 3: Live Sections ───────────────────────────────────────────────
    await scrapeLiveSections(session.page, stats);

    await completeScrapeRun(runId, stats);
    console.log(`[scraper] Run complete — ${stats.terms_scraped} terms, ${stats.subjects_scraped} subjects, ${stats.courses_scraped} courses, ${stats.sections_scraped} sections, ${stats.errors.length} errors`);
  } catch (err) {
    const message = toErrorMessage(err);
    console.error(`[scraper] Fatal error: ${message}`);
    await failScrapeRun(runId, message);
  } finally {
    await closeBrowser(session);
  }
}

// Runs only Phase 3 — reads subjects/courses from DB and scrapes live sections.
// Use this after phases 1 & 2 have already been run.
export async function runSections(): Promise<void> {
  console.log(`[scraper] Starting sections-only run at ${new Date().toISOString()}`);

  const runId = await insertScrapeRun();
  const stats = makeEmptyStats();
  const session = await launchBrowser();

  try {
    await scrapeLiveSections(session.page, stats);
    await completeScrapeRun(runId, stats);
    console.log(`[scraper] Sections run complete — ${stats.terms_scraped} terms, ${stats.sections_scraped} sections, ${stats.errors.length} errors`);
  } catch (err) {
    const message = toErrorMessage(err);
    console.error(`[scraper] Fatal error: ${message}`);
    await failScrapeRun(runId, message);
  } finally {
    await closeBrowser(session);
  }
}

async function scrapeLiveSections(page: import('playwright').Page, stats: RunStats): Promise<void> {
  console.log('[scraper] Phase 3: Scraping live sections from class search');
  await withRetry(() => navigateToSearchPage(page));
  const terms = await withRetry(() => scrapeTerms(page));

  const termFilter = process.env.TERM_FILTER?.toLowerCase();
  const filteredTerms = termFilter
    ? terms.filter(t => t.term_name.toLowerCase().includes(termFilter))
    : terms;
  console.log(`[scraper] Found ${filteredTerms.length} term(s)${termFilter ? ` (filter: "${termFilter}")` : ''}`);

  const subjectLimit = process.env.SUBJECT_LIMIT ? parseInt(process.env.SUBJECT_LIMIT) : undefined;
  if (subjectLimit) console.log(`[scraper] Subject limit: ${subjectLimit}`);

  const allSubjects = await getAllSubjects();
  const limitedSubjects = subjectLimit ? allSubjects.slice(0, subjectLimit) : allSubjects;

  for (const term of filteredTerms) {
    console.log(`[scraper] Term: ${term.term_name}`);
    try {
      const termId = await upsertTerm(term);

      for (let i = 0; i < limitedSubjects.length; i++) {
        const subject = limitedSubjects[i];
        console.log(`[scraper]   Subject ${i + 1}/${limitedSubjects.length}: ${subject.subject_code}`);
        try {
          const courseSections = await withRetry(() =>
            scrapeSectionsForSubject(page, term.term_code, subject.subject_code)
          );

          for (const { course_code, sections } of courseSections) {
            for (const section of sections) {
              await storeSection(subject.subject_code, termId, course_code, section, stats);
            }
          }
        } catch (err) {
          recordError(stats, { term: term.term_name, subject: subject.subject_code, message: toErrorMessage(err) });
        }
      }

      stats.terms_scraped++;
    } catch (err) {
      recordError(stats, { term: term.term_name, message: toErrorMessage(err) });
    }
  }
}

async function storeSection(
  subjectCode: string,
  termId: number,
  courseCode: string,
  detail: ScrapedSectionResult,
  stats: RunStats
): Promise<void> {
  const daysTimes   = detail.days_times.split(' | ');
  const instructors = detail.instructor.split(' | ');
  const dateStarts  = detail.date_start.split(' | ');
  const dateEnds    = detail.date_end.split(' | ');
  const count = Math.max(daysTimes.length, dateStarts.length, 1);

  // For each field, use the value at position i if present and non-empty,
  // otherwise fall back to the first non-empty value in the list.
  // This handles both "index out of range" (undefined) and PeopleSoft
  // suppressed-repeat cells that arrive as empty strings.
  const pick = (arr: string[], i: number) => arr[i] || arr.find(s => s) || '';

  const meetings = [];
  for (let i = 0; i < count; i++) {
    meetings.push({
      term_id:       termId,
      subject_code:  subjectCode,
      course_code:   courseCode,
      section_code:  detail.section_code,
      meeting_index: i,
      component:     detail.component,
      session:       detail.session,
      days_times:    pick(daysTimes, i),
      instructor:    pick(instructors, i),
      date_start:    pick(dateStarts, i),
      date_end:      pick(dateEnds, i),
    });
  }

  await upsertSectionMeetings(meetings);
  stats.sections_scraped += meetings.length;
}

function makeEmptyStats(): RunStats {
  return { terms_scraped: 0, subjects_scraped: 0, courses_scraped: 0, sections_scraped: 0, errors: [] };
}

function recordError(stats: RunStats, error: RunError): void {
  console.error(`[scraper] Error — ${JSON.stringify(error)}`);
  stats.errors.push(error);
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
