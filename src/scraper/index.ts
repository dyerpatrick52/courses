import { Page } from 'playwright';
import { launchBrowser, closeBrowser } from './browser';
import { navigateToSearchPage, selectTerm } from './navigation';
import { scrapeTerms } from './terms';
import { scrapeSubjectsForTerm } from './subjects';
import { scrapeSearchResultsForSubject } from './courses';
import { scrapeSectionDetails } from './sections';
import { upsertTerm } from '../db/queries/terms';
import { upsertSubject } from '../db/queries/subjects';
import { upsertCourse } from '../db/queries/courses';
import { upsertSection, replaceMeetingsForSection } from '../db/queries/sections';

export async function runScraper(): Promise<void> {
  console.log(`[scraper] Starting run at ${new Date().toISOString()}`);

  const session = await launchBrowser();

  try {
    await navigateToSearchPage(session.page);
    const terms = await scrapeTerms(session.page);
    console.log(`[scraper] Found ${terms.length} terms`);

    for (const term of terms) {
      await scrapeAndStoreTerm(session.page, term);
    }
  } finally {
    await closeBrowser(session);
  }

  console.log(`[scraper] Run complete at ${new Date().toISOString()}`);
}

async function scrapeAndStoreTerm(
  page: Page,
  term: { term_code: string; term_name: string }
): Promise<void> {
  console.log(`[scraper] Term: ${term.term_name}`);

  const termId = await upsertTerm(term);

  await navigateToSearchPage(page);
  await selectTerm(page, term.term_code);

  const subjects = await scrapeSubjectsForTerm(page);
  console.log(`[scraper]   Found ${subjects.length} subjects`);

  for (const subject of subjects) {
    await scrapeAndStoreSubject(page, termId, term.term_code, subject);
  }
}

async function scrapeAndStoreSubject(
  page: Page,
  termId: number,
  termCode: string,
  subject: { subject_code: string; subject_name: string }
): Promise<void> {
  console.log(`[scraper]   Subject: ${subject.subject_code}`);

  const subjectId = await upsertSubject({ term_id: termId, ...subject });

  await navigateToSearchPage(page);

  const courseHeaders = await scrapeSearchResultsForSubject(
    page,
    termCode,
    subject.subject_code
  );

  if (courseHeaders.length === 0) {
    console.log(`[scraper]     No courses found`);
    return;
  }

  console.log(`[scraper]     Found ${courseHeaders.length} courses`);

  for (const courseHeader of courseHeaders) {
    await scrapeAndStoreCourse(page, subjectId, courseHeader);
  }
}

async function scrapeAndStoreCourse(
  page: Page,
  subjectId: number,
  courseHeader: {
    course_code: string;
    course_title: string;
    section_indices: number[];
  }
): Promise<void> {
  const sectionDetails = await scrapeSectionDetails(page, courseHeader.section_indices);

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
    await scrapeAndStoreSection(courseId, detail);
  }
}

async function scrapeAndStoreSection(
  courseId: number,
  detail: Awaited<ReturnType<typeof scrapeSectionDetails>>[number]
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
}
