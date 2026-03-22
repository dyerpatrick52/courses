import 'dotenv/config';
import { Page } from 'playwright';
import { launchBrowser, closeBrowser } from './src/scraper/browser';
import {
  navigateToSearchPage, selectTerm, selectSubjectFromLookup,
  fillCatalogNumber, runSearch,
} from './src/scraper/navigation';
import { scrapeTerms } from './src/scraper/terms';
import { scrapeCoursesForSubject } from './src/scraper/courses';
import { scrapeSubjects } from './src/scraper/subjects';
import { upsertTerm } from './src/db/queries/terms';
import { upsertSubject } from './src/db/queries/subjects';
import { upsertCourse } from './src/db/queries/courses';
import { upsertSection, replaceMeetingsForSection } from './src/db/queries/sections';

const TEST_SUBJECT = '';
const TARGET_TERM  = 'Spring';

async function runTestScrape(): Promise<void> {
  console.log(`[test] Starting test scrape — subject: ${TEST_SUBJECT}, term: ${TARGET_TERM}`);

  const session = await launchBrowser();

  try {
    // Phase 1: catalogue
    const subjects = await scrapeSubjects(session.page);
    const subject  = subjects.find(s => s.subject_code === TEST_SUBJECT);
    if (!subject) throw new Error(`Subject ${TEST_SUBJECT} not found in catalogue`);
    console.log(`[test] Catalogue subject: ${subject.subject_code} — ${subject.subject_name}`);

    const allCourses  = await scrapeCoursesForSubject(session.page, TEST_SUBJECT);
    const firstCourse = allCourses[0];
    if (!firstCourse) throw new Error('No courses found in catalogue for CSI');
    const catalogNbr  = firstCourse.course_code.replace(/\D/g, '');
    console.log(`[test] First catalogue course: ${firstCourse.course_code} — ${firstCourse.course_title}`);

    // Phase 2: get Spring term code
    await navigateToSearchPage(session.page);
    const terms = await scrapeTerms(session.page);
    const term  = terms.find(t => t.term_name.includes(TARGET_TERM));
    if (!term) throw new Error(`No term matching "${TARGET_TERM}" — available: ${terms.map(t => t.term_name).join(', ')}`);
    console.log(`[test] Using term: ${term.term_name} (${term.term_code})`);

    // Upsert term + subject + course
    const termId    = await upsertTerm(term);
    const subjectId = await upsertSubject({ term_id: termId, ...subject });
    const courseId  = await upsertCourse({
      subject_id:    subjectId,
      course_code:   firstCourse.course_code,
      course_title:  firstCourse.course_title,
      course_id_ext: '',
      units:         firstCourse.units,
      career:        '',
      description:   firstCourse.description,
      prerequisites: firstCourse.prerequisites,
      attributes:    '',
    });
    console.log(`[test] Upserted course: ${firstCourse.course_code} (id=${courseId})`);

    // Phase 3: class search — results page only, no Details clicks
    await navigateToSearchPage(session.page);
    await selectTerm(session.page, term.term_code);
    await selectSubjectFromLookup(session.page, TEST_SUBJECT);
    await fillCatalogNumber(session.page, catalogNbr);
    await runSearch(session.page);
    await waitForSearchRender(session.page);

    // Read sections: non-span MTG_CLASSNAME cells give one entry per section,
    // with rowspan telling us how many meeting-pattern rows belong to it.
    const rawSections = await session.page.$$eval(
      '[id^="MTG_CLASSNAME$"]:not([id*="span"])',
      els => els.map(el => ({
        text:    (el.textContent ?? '').trim(),
        rowspan: parseInt(el.getAttribute('rowspan') ?? '1'),
      }))
    );

    // Flat list of all meeting-pattern rows (one per MTG_DAYTIME element)
    const allSchedules   = await batchRead(session.page, '[id^="MTG_DAYTIME$"]');
    const allInstructors = await batchRead(session.page, '[id^="MTG_INSTR$"]');

    console.log(`[test] Found ${rawSections.length} sections`);

    let meetingIdx = 0;
    for (const raw of rawSections) {
      const sectionCode = parseSectionCode(raw.text);

      // Collect meeting rows that belong to this section
      const meetings: Array<{ schedule: string; instructor: string }> = [];
      for (let i = 0; i < raw.rowspan; i++) {
        const rawSchedule = allSchedules[meetingIdx]   ?? '';
        const instructor  = cleanInstructor(allInstructors[meetingIdx] ?? '');
        // A single schedule cell can contain multiple day/time entries concatenated;
        // split on day abbreviations to get one entry per meeting time.
        const times = splitSchedule(rawSchedule);
        for (const schedule of times) {
          meetings.push({ schedule, instructor });
        }
        meetingIdx++;
      }

      console.log(`[test]   ${sectionCode} — ${meetings.length} meeting(s):`);
      for (const m of meetings) {
        console.log(`[test]     ${m.schedule}${m.instructor ? ' | ' + m.instructor : ''}`);
      }

      const sectionId = await upsertSection({
        course_id:        courseId,
        section_code:     sectionCode,
        component:        '',
        status:           '',
        session:          '',
        instruction_mode: '',
        location:         '',
        campus:           '',
        date_start:       '',
        date_end:         '',
        grading_basis:    '',
        offer_number:     '',
        topic:            '',
        class_components: '',
        exam_days_times:  '',
        exam_date:        '',
      });

      await replaceMeetingsForSection(
        meetings.map(m => ({ section_id: sectionId, days_times: m.schedule, instructor: m.instructor, date_range: '' }))
      );
    }

    console.log(`\n[test] Done! Stored ${rawSections.length} sections for ${firstCourse.course_code}`);

  } finally {
    await closeBrowser(session);
    process.exit(0);
  }
}

async function waitForSearchRender(page: Page): Promise<void> {
  await page.waitForSelector(
    '[id^="win0divSSR_CLSRSLT_WRK_GROUPBOX2GP"], #DERIVED_CLSRCH_ERROR_TEXT',
    { timeout: 30000 }
  ).catch(() => {});
}

async function batchRead(page: Page, selector: string): Promise<string[]> {
  return page.$$eval(selector, els => els.map(e => (e.textContent ?? '').trim()));
}

function parseSectionCode(raw: string): string {
  const match = raw.match(/^([A-Z]\d{2}[A-Z]?-[A-Z]{3})/);
  return match ? match[1] : raw.split('\n')[0]?.trim() ?? raw;
}

// Split a schedule string like "Mo 13:00 - 14:20Th 11:30 - 12:50" on day abbreviations.
function splitSchedule(schedule: string): string[] {
  const parts = schedule.split(/(?=(?:Mo|Tu|We|Th|Fr|Sa|Su) \d)/).map(s => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : (schedule ? [schedule] : []);
}

// Split concatenated names at camelCase boundaries and drop "Staff" when a real name exists.
// e.g. "Mohamed Ali IbrahimStaff" → "Mohamed Ali Ibrahim"
function cleanInstructor(raw: string): string {
  const names = raw.split(/(?<=[a-z])(?=[A-Z][a-z])/).map(s => s.trim()).filter(Boolean);
  const real  = names.filter(n => n !== 'Staff');
  return (real.length > 0 ? real : names).join(', ');
}

runTestScrape().catch(err => {
  console.error('[test] Fatal:', err);
  process.exit(1);
});
