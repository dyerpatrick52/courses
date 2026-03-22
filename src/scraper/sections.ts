import { Page } from 'playwright';
import {
  navigateToSearchPage,
  selectTerm,
  selectSubjectFromLookup,
  runSearch,
  clickSectionDetails,
  goBackToSearchResults,
  readText,
  readAllTexts,
} from './navigation';

// Top-level result grouping sections by course code. One subject search
// returns results for every course in that subject that has sections this term.
export interface ScrapedCourseSections {
  course_code: string;
  sections:    ScrapedSectionDetail[];
}

// All fields visible on a section's detail page in the class search.
export interface ScrapedSectionDetail {
  section_code:     string;   // e.g. "A00", "L01"
  component:        string;   // e.g. "Lecture", "Lab", "Tutorial"
  status:           string;   // e.g. "Open", "Closed", "Wait List"
  session:          string;   // e.g. "Regular Academic Session"
  instruction_mode: string;   // e.g. "In Person", "Online"
  location:         string;
  campus:           string;
  date_start:       string;
  date_end:         string;
  grading_basis:    string;
  offer_number:     string;
  topic:            string;
  class_components: string;
  exam_days_times:  string;   // scheduled exam time (separate from regular meetings)
  exam_date:        string;
  meetings:         ScrapedMeeting[];
}

// One row in the "Class Meeting" table on the detail page. A section can have
// multiple meeting patterns (e.g. lectures MWF + lab on Thursdays), each
// stored as a separate row.
export interface ScrapedMeeting {
  days_times: string;   // e.g. "MoWeFr 10:00AM - 10:50AM"
  instructor: string;
  date_range: string;   // e.g. "01/06/2025 - 04/12/2025" or a specific week date
}

// Entry point: searches the class search for a given term + subject and
// returns the scraped sections grouped by course code.
export async function scrapeSectionsForSubject(
  page: Page,
  termCode: string,
  subjectCode: string
): Promise<ScrapedCourseSections[]> {
  await navigateToSearchPage(page);
  await selectTerm(page, termCode);
  await selectSubjectFromLookup(page, subjectCode);
  await runSearch(page);
  await waitForSearchRender(page);

  const hasResults = await checkForResults(page);
  if (!hasResults) return [];

  return scrapeAllCourseGroups(page);
}

// Waits for either the results container or the "no results" error element to
// appear. We catch the timeout so a slow page doesn't crash the whole run.
async function waitForSearchRender(page: Page): Promise<void> {
  await page.waitForSelector(
    '[id^="win0divSSR_CLSRSLT_WRK_GROUPBOX2GP"], #DERIVED_CLSRCH_ERROR_TEXT',
    { timeout: 30000 }
  ).catch(() => {});
}

// Returns false if the "no classes found" message is shown, or true if there
// is at least one course group in the results.
async function checkForResults(page: Page): Promise<boolean> {
  const errorText = await readText(page, '#DERIVED_CLSRCH_ERROR_TEXT');
  if (errorText.length > 0) return false;

  const groupCount = await page.$$eval(
    '[id^="win0divSSR_CLSRSLT_WRK_GROUPBOX2GP"]',
    els => els.length
  );
  return groupCount > 0;
}

// The search results are split into groups, one per course (e.g. all CSI 2110
// sections together). We iterate each group, parse the course code from its
// header, then scrape the individual sections inside it.
async function scrapeAllCourseGroups(page: Page): Promise<ScrapedCourseSections[]> {
  const groups = await page.$$('[id^="win0divSSR_CLSRSLT_WRK_GROUPBOX2GP$"]');
  const results: ScrapedCourseSections[] = [];
  let sectionIndex = 0;

  for (const group of groups) {
    const headerText = (await group.textContent() ?? '').trim();
    const course_code = parseCourseCode(headerText);
    if (!course_code) continue;

    // Sections across all groups share a single flat index in the DOM
    // (MTG_CLASSNAME$0, $1, $2, ...). We track our position across groups.
    const count = await countSectionsInGroup(page, sectionIndex);
    const indices = buildSectionIndices(sectionIndex, count);
    const sections = await scrapeAllSectionDetails(page, indices);

    results.push({ course_code, sections });
    sectionIndex += count;
  }

  return results;
}

// Extracts the course code from a group header like "CSI 2110 - Data Structures".
function parseCourseCode(headerText: string): string | null {
  const match = headerText.match(/\b([A-Z]{2,6}\s+\d{4}[A-Z]?)\s+-\s+/);
  return match ? match[1].trim() : null;
}

// Counts how many sections belong to a group by probing for DOM elements.
// Sections are indexed globally, so we start from startIndex and increment
// until the element no longer exists.
async function countSectionsInGroup(page: Page, startIndex: number): Promise<number> {
  let count = 0;
  while (await page.$(`#MTG_CLASSNAME\\$${startIndex + count}`) !== null) {
    count++;
  }
  return count;
}

function buildSectionIndices(startIndex: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => startIndex + i);
}

// For each section index, clicks into the detail page, scrapes all fields,
// then navigates back to the results list before moving to the next section.
async function scrapeAllSectionDetails(
  page: Page,
  indices: number[]
): Promise<ScrapedSectionDetail[]> {
  const details: ScrapedSectionDetail[] = [];
  for (const index of indices) {
    details.push(await scrapeSingleSectionDetail(page, index));
  }
  return details;
}

async function scrapeSingleSectionDetail(page: Page, index: number): Promise<ScrapedSectionDetail> {
  await clickSectionDetails(page, index);
  const detail = await extractSectionFields(page);
  await goBackToSearchResults(page);
  return detail;
}

// Reads all fields from a section detail page. The IDs are PeopleSoft
// auto-generated names — the escaped $0 suffix means "first row".
async function extractSectionFields(page: Page): Promise<ScrapedSectionDetail> {
  const header    = await readText(page, '#DERIVED_CLSRCH_DESCR200');
  const dateRange = await readText(page, '#SSR_CLS_DTL_WRK_SSR_DATE_LONG');
  const meetings  = await extractMeetingRows(page);

  return {
    section_code:     parseSectionCode(header),
    component:        parseComponent(await readText(page, '#DERIVED_CLSRCH_SSS_PAGE_KEYDESCR')),
    status:           await readText(page, '#SSR_CLS_DTL_WRK_SSR_DESCRSHORT'),
    session:          await readText(page, '#PSXLATITEM_XLATLONGNAME\\$31\\$'),
    instruction_mode: await readText(page, '#INSTRUCT_MODE_DESCR'),
    location:         await readText(page, '#CAMPUS_LOC_VW_DESCR'),
    campus:           await readText(page, '#CAMPUS_TBL_DESCR'),
    date_start:       parseDateStart(dateRange),
    date_end:         parseDateEnd(dateRange),
    grading_basis:    await readText(page, '#GRADE_BASIS_TBL_DESCRFORMAL'),
    offer_number:     await readText(page, '#SSR_CLS_DTL_WRK_CRSE_OFFER_NBR'),
    topic:            await readText(page, '#DERIVED_CLSRCH_SSR_TOPIC_DESCR'),
    class_components: await readText(page, '#SSR_CLS_DTL_WRK_SSR_COMPONENT_LONG'),
    // MTG_SCHED1$0 / UO_EXM_INFO_WRK... are the exam-specific schedule fields,
    // separate from the regular weekly meeting rows below.
    exam_days_times:  await readText(page, '#MTG_SCHED1\\$0'),
    exam_date:        await readText(page, '#UO_EXM_INFO_WRK_UO_SSR_EXM_DT_LONG\\$0'),
    meetings,
  };
}

// Reads the repeating meeting table. Each row has a schedule, an instructor,
// and a date range. There can be 1–N rows depending on the section (e.g. a
// course with separate lecture + lab patterns, or a course meeting only on
// specific individual dates throughout the semester).
async function extractMeetingRows(page: Page): Promise<ScrapedMeeting[]> {
  const schedules   = await readAllTexts(page, '[id^="MTG_SCHED$"]');
  const instructors = await readAllTexts(page, '[id^="MTG_INSTR$"]');
  const dates       = await readAllTexts(page, '[id^="MTG_DATE$"]');
  return buildMeetingRows(schedules, instructors, dates);
}

// Zips the three parallel arrays together by index. If instructors or dates
// are shorter than schedules (missing data), defaults to empty string.
function buildMeetingRows(
  schedules: string[],
  instructors: string[],
  dates: string[]
): ScrapedMeeting[] {
  return schedules.map((days_times, i) => ({
    days_times,
    instructor: instructors[i] ?? '',
    date_range: dates[i] ?? '',
  }));
}

// Parses the section code out of the page header, e.g.
// "CSI 2110 - Data Structures (A00)" → "A00"
function parseSectionCode(header: string): string {
  const match = header.match(/\b([A-Z]\d{2}[A-Z]?)\b/);
  return match ? match[1] : header.split(/\s+/).slice(-1)[0] ?? '';
}

// The component is the last pipe-delimited segment of the subheader,
// e.g. "CSI 2110 | 12345 | Lecture" → "Lecture"
function parseComponent(subheader: string): string {
  const parts = subheader.split('|');
  return parts[parts.length - 1]?.trim() ?? '';
}

// The overall section date range is displayed as "Jan 6, 2025 - Apr 12, 2025".
// We split on " - " to get the start and end separately.
function parseDateStart(dateRange: string): string {
  return dateRange.split(' - ')[0]?.trim() ?? '';
}

function parseDateEnd(dateRange: string): string {
  return dateRange.split(' - ')[1]?.trim() ?? '';
}
