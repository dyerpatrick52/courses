import { Page } from 'playwright';
import { launchBrowser, closeBrowser } from './browser';
import { navigateToSearchPage, selectTerm } from './navigation';
import { scrapeTerms } from './terms';
import { scrapeSubjectsForTerm } from './subjects';
import { scrapeSearchResultsForSubject } from './courses';
import { scrapeSectionDetails } from './sections';
import { withRetry } from './retry';
import { upsertTerm } from '../db/queries/terms';
import { upsertSubject } from '../db/queries/subjects';
import { upsertCourse } from '../db/queries/courses';
import { upsertSection, replaceMeetingsForSection } from '../db/queries/sections';
import { insertScrapeRun, completeScrapeRun, failScrapeRun, RunError, RunStats } from '../db/queries/runs';

export async function runScraper(): Promise<void> {
  console.log(`[scraper] Starting run at ${new Date().toISOString()}`);

  const runId = await insertScrapeRun();
  const stats: RunStats = {
    terms_scraped:    0,
    subjects_scraped: 0,
    courses_scraped:  0,
    sections_scraped: 0,
    errors:           [],
  };

  const session = await launchBrowser();

  try {
    await withRetry(() => navigateToSearchPage(session.page));
    const terms = await withRetry(() => scrapeTerms(session.page));
    console.log(`[scraper] Found ${terms.length} terms`);

    for (const term of terms) {
      await scrapeAndStoreTerm(session.page, term, stats);
    }

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

async function scrapeAndStoreTerm(
  page: Page,
  term: { term_code: string; term_name: string },
  stats: RunStats
): Promise<void> {
  console.log(`[scraper] Term: ${term.term_name}`);

  try {
    const termId = await upsertTerm(term);

    await withRetry(() => navigateToSearchPage(page));
    await withRetry(() => selectTerm(page, term.term_code));

    const subjects = await withRetry(() => scrapeSubjectsForTerm(page));
    console.log(`[scraper]   Found ${subjects.length} subjects`);

    for (const subject of subjects) {
      await scrapeAndStoreSubject(page, termId, term, subject, stats);
    }

    stats.terms_scraped++;
  } catch (err) {
    recordError(stats, { term: term.term_name, message: toErrorMessage(err) });
  }
}

async function scrapeAndStoreSubject(
  page: Page,
  termId: number,
  term: { term_code: string; term_name: string },
  subject: { subject_code: string; subject_name: string },
  stats: RunStats
): Promise<void> {
  console.log(`[scraper]   Subject: ${subject.subject_code}`);

  try {
    const subjectId = await upsertSubject({ term_id: termId, ...subject });

    await withRetry(() => navigateToSearchPage(page));

    const courseHeaders = await withRetry(() =>
      scrapeSearchResultsForSubject(page, term.term_code, subject.subject_code)
    );

    if (courseHeaders.length === 0) {
      console.log(`[scraper]     No courses found`);
      stats.subjects_scraped++;
      return;
    }

    console.log(`[scraper]     Found ${courseHeaders.length} courses`);

    for (const courseHeader of courseHeaders) {
      await scrapeAndStoreCourse(page, subjectId, term, subject, courseHeader, stats);
    }

    stats.subjects_scraped++;
  } catch (err) {
    recordError(stats, {
      term:    term.term_name,
      subject: subject.subject_code,
      message: toErrorMessage(err),
    });
  }
}

async function scrapeAndStoreCourse(
  page: Page,
  subjectId: number,
  term: { term_name: string },
  subject: { subject_code: string },
  courseHeader: { course_code: string; course_title: string; section_indices: number[] },
  stats: RunStats
): Promise<void> {
  try {
    const sectionDetails = await withRetry(() =>
      scrapeSectionDetails(page, courseHeader.section_indices)
    );

    const firstSection = sectionDetails[0];

    const courseId = await upsertCourse({
      subject_id:    subjectId,
      course_code:   courseHeader.course_code,
      course_title:  courseHeader.course_title,
      course_id_ext: firstSection?.course_id_ext ?? '',
      units:         firstSection?.units         ?? '',
      career:        firstSection?.career        ?? '',
      description:   firstSection?.description   ?? '',
      prerequisites: firstSection?.prerequisites ?? '',
      attributes:    firstSection?.attributes    ?? '',
    });

    for (const detail of sectionDetails) {
      await scrapeAndStoreSection(courseId, detail, stats);
    }

    stats.courses_scraped++;
  } catch (err) {
    recordError(stats, {
      term:    term.term_name,
      subject: subject.subject_code,
      course:  courseHeader.course_code,
      message: toErrorMessage(err),
    });
  }
}

async function scrapeAndStoreSection(
  courseId: number,
  detail: Awaited<ReturnType<typeof scrapeSectionDetails>>[number],
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

  const meetings = detail.meetings.map(m => ({ section_id: sectionId, ...m }));
  await replaceMeetingsForSection(meetings);

  stats.sections_scraped++;
}

function recordError(stats: RunStats, error: RunError): void {
  console.error(`[scraper] Error — ${JSON.stringify(error)}`);
  stats.errors.push(error);
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
