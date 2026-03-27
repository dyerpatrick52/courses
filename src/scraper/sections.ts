import { Page } from 'playwright';
import {
  navigateToSearchPage,
  selectTerm,
  selectSubjectFromLookup,
  fillCatalogNumber,
  uncheckOpenOnly,
  runSearch,
  dismissPopup,
  readText,
} from './navigation';

// Top-level result grouping sections by course code. One subject search
// returns results for every course in that subject that has sections this term.
export interface ScrapedCourseSections {
  course_code: string;
  sections:    ScrapedSectionResult[];
}

// Fields read directly from each row in the search results table.
export interface ScrapedSectionResult {
  section_code: string;   // e.g. "X00"
  component:    string;   // e.g. "LEC", "DGD", "LAB"
  session:      string;   // e.g. "Session A"
  days_times:   string;   // e.g. "We 19:00 - 21:50"
  instructor:   string;   // e.g. "Staff"
  date_start:   string;   // e.g. "2026-05-04"
  date_end:     string;   // e.g. "2026-07-24"
}

// Entry point: searches the class search for a given term + subject and
// returns the scraped sections grouped by course code.
export async function scrapeSectionsForSubject(
  page: Page,
  termCode: string,
  subjectCode: string,
  courseCodes: string[] = []
): Promise<ScrapedCourseSections[]> {
  await navigateToSearchPage(page);
  await selectTerm(page, termCode);
  await selectSubjectFromLookup(page, subjectCode);
  await uncheckOpenOnly(page);
  await runSearch(page);
  await waitForSearchRender(page);

  const popup = await checkForPopup(page);
  if (popup === 'no_results') {
    return [];
  }
  if (popup === 'too_many') {
    console.log(`[scraper]     ${subjectCode} has >300 sections — falling back to course-by-course`);
    await dismissPopup(page);
    return scrapeSectionsByCourse(page, termCode, subjectCode, courseCodes);
  }

  const hasResults = await checkForResults(page);
  if (!hasResults) return [];

  return scrapeAllCourseGroups(page);
}

// Waits for results, the inline "no results" error, or the popup message box.
// We catch the timeout so a slow page doesn't crash the whole run.
async function waitForSearchRender(page: Page): Promise<void> {
  await page.waitForSelector(
    '[id^="win0divSSR_CLSRSLT_WRK_GROUPBOX2GP"], #DERIVED_CLSRCH_ERROR_TEXT, #win0divDERIVED_CLSMSG_ERROR_TEXT',
    { timeout: 60000 }
  ).catch(() => {});
}

type PopupKind = 'no_results' | 'too_many';

// Checks whether the PeopleSoft message popup is visible and classifies it.
// Returns null if no popup is present.
async function checkForPopup(page: Page): Promise<PopupKind | null> {
  const el = await page.$('#win0divDERIVED_CLSMSG_ERROR_TEXT');
  if (!el || !(await el.isVisible())) return null;
  const text = ((await el.textContent()) ?? '').toLowerCase();
  if (text.includes('no classes')) return 'no_results';
  return 'too_many';
}

// Searches the class search once per course number for subjects that return
// a >300 sections popup when searched by subject alone.
async function scrapeSectionsByCourse(
  page: Page,
  termCode: string,
  subjectCode: string,
  courseCodes: string[]
): Promise<ScrapedCourseSections[]> {
  const allResults: ScrapedCourseSections[] = [];

  for (const courseCode of courseCodes) {
    const catalogNbr = courseCode.replace(/\D/g, '');
    await navigateToSearchPage(page);
    await selectTerm(page, termCode);
    await selectSubjectFromLookup(page, subjectCode);
    await fillCatalogNumber(page, catalogNbr);
    await uncheckOpenOnly(page);
    await runSearch(page);
    await waitForSearchRender(page);

    const popup = await checkForPopup(page);
    if (popup === 'no_results') { continue; }
    if (popup === 'too_many') { await dismissPopup(page); continue; }

    const hasResults = await checkForResults(page);
    if (!hasResults) continue;

    const results = await scrapeAllCourseGroups(page);
    allResults.push(...results);
  }

  return allResults;
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

// The search results are split into groups, one per course (e.g. all ADM 1100
// sections together). Each #win0divSSR_CLSRSLT_WRK_GROUPBOX2GP$N element is
// the course header only — sections are not its children. We use
// compareDocumentPosition to assign each globally-indexed section row to the
// header that immediately precedes it in the DOM.
async function scrapeAllCourseGroups(page: Page): Promise<ScrapedCourseSections[]> {
  const groups = await page.evaluate(() => {
    const headers  = Array.from(document.querySelectorAll('[id^="win0divSSR_CLSRSLT_WRK_GROUPBOX2GP$"]'));
    const sections = Array.from(document.querySelectorAll('[id^="MTG_CLASSNAME$"]'));

    return headers.map((header, hi) => {
      const nextHeader = headers[hi + 1];
      const indices = sections
        .filter(sec => {
          const afterThis  = !!(header.compareDocumentPosition(sec) & 4);  // sec follows header
          const beforeNext = !nextHeader || !!(nextHeader.compareDocumentPosition(sec) & 2); // sec precedes next header
          return afterThis && beforeNext;
        })
        .map(sec => parseInt(sec.id.split('$')[1], 10))
        .filter(i => !isNaN(i));
      return { headerText: header.textContent?.trim() ?? '', indices };
    });
  });

  const results: ScrapedCourseSections[] = [];
  for (const { headerText, indices } of groups) {
    const course_code = parseCourseCode(headerText);
    if (!course_code) continue;

    // Read all rows for this course first, then post-process.
    const raw: ScrapedSectionResult[] = [];
    for (const i of indices) {
      raw.push(await readSectionRow(page, i));
    }

    // Within each section_code group: carry forward days_times, and pick the
    // best instructor (real name preferred over "Staff").
    // PeopleSoft suppresses repeated field values in sub-rows of the same section,
    // so rows after the first may have blank days_times / instructor even though
    // the values haven't changed.
    let gi = 0;
    while (gi < raw.length) {
      const code = raw[gi].section_code;
      const groupEnd = raw.findIndex((s, j) => j > gi && s.section_code !== code);
      const group = raw.slice(gi, groupEnd === -1 ? undefined : groupEnd);

      const bestInstructor =
        group.map(s => s.instructor).find(ins => ins && ins !== 'Staff') ??
        group.map(s => s.instructor).find(ins => !!ins) ??
        '';

      let lastDaysTimes = '';
      for (const s of group) {
        if (!s.days_times && lastDaysTimes) {
          s.days_times = lastDaysTimes;
        } else if (s.days_times) {
          lastDaysTimes = s.days_times;
        }
        if ((!s.instructor || s.instructor === 'Staff') && bestInstructor) {
          s.instructor = bestInstructor;
        }
      }

      gi = groupEnd === -1 ? raw.length : groupEnd;
    }

    // For non-LEC sections still showing "Staff", use the LEC instructor from
    // this course if one is available — "Staff" is a placeholder for unassigned.
    const lecInstructor =
      raw
        .filter(s => s.component === 'LEC' && s.instructor && s.instructor !== 'Staff')
        .map(s => s.instructor)[0] ?? '';

    if (lecInstructor) {
      for (const s of raw) {
        if (s.component !== 'LEC' && (!s.instructor || s.instructor === 'Staff')) {
          s.instructor = lecInstructor;
        }
      }
    }

    results.push({ course_code, sections: raw });
  }
  return results;
}

// Reads a multi-line cell (PeopleSoft separates lines with <br>). innerText
// respects those breaks; we split, deduplicate, and join with " | ".
async function readLines(page: Page, selector: string): Promise<string> {
  try {
    const raw: string = await page.$eval(selector, el => (el as HTMLElement).innerText);
    const parts = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const unique = [...new Set(parts)];
    return unique.join(' | ');
  } catch {
    return '';
  }
}

// Reads the instructor cell for a section row. If the cell contains both
// "Staff" and real names (e.g. two meeting rows merged into one cell),
// the real names are preferred and "Staff" is dropped.
async function readInstructor(page: Page, index: number): Promise<string> {
  try {
    const raw: string = await page.$eval(`#MTG_INSTR\\$${index}`, el => (el as HTMLElement).innerText);
    const parts = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const unique = [...new Set(parts)];
    const realNames = unique.filter(n => n !== 'Staff');
    return (realNames.length > 0 ? realNames : unique).join(' | ');
  } catch {
    return '';
  }
}

// Reads one section row from the results table by its global index.
async function readSectionRow(page: Page, index: number): Promise<ScrapedSectionResult> {
  const classname  = await readText(page, `#MTG_CLASSNAME\\$${index}`);
  const days_times = await readLines(page, `#MTG_DAYTIME\\$${index}`);
  const instructor = await readInstructor(page, index);
  const { date_start, date_end } = await readDateRange(page, index);

  const { section_code, component, session } = parseClassName(classname);

  return { section_code, component, session, days_times, instructor, date_start, date_end };
}

// Reads the date range cell. Each line is "YYYY-MM-DD - YYYY-MM-DD" (one per
// meeting). Returns date_start and date_end as pipe-joined lists preserving
// position — e.g. "2026-06-22 | 2026-06-22" and "2026-07-31 | 2026-07-31".
async function readDateRange(page: Page, index: number): Promise<{ date_start: string; date_end: string }> {
  try {
    const raw: string = await page.$eval(`#MTG_TOPIC\\$${index}`, el => (el as HTMLElement).innerText);
    const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const starts: string[] = [];
    const ends: string[] = [];
    for (const line of lines) {
      const [s, e] = line.split(' - ').map(p => p.trim());
      starts.push(s ?? '');
      ends.push(e ?? '');
    }
    return { date_start: starts.join(' | '), date_end: ends.join(' | ') };
  } catch {
    return { date_start: '', date_end: '' };
  }
}

// Parses "X00-DGDSession A" or "SLC2-SEMTerm" into its three parts.
// Section code is everything before the first "-". Component is all-caps
// letters after it; session starts where we first see uppercase+lowercase.
function parseClassName(raw: string): { section_code: string; component: string; session: string } {
  const dashIdx = raw.indexOf('-');
  if (dashIdx < 0) return { section_code: raw.trim(), component: '', session: '' };

  const section_code = raw.slice(0, dashIdx);
  const rest         = raw.slice(dashIdx + 1);

  const sessionIdx = rest.search(/[A-Z][a-z]/);
  const component  = (sessionIdx >= 0 ? rest.slice(0, sessionIdx) : rest).trim();
  const session    = (sessionIdx >= 0 ? rest.slice(sessionIdx) : '').trim();

  return { section_code, component, session };
}

// Extracts the course code from a group header like "ADM 1100 - Introduction to Business".
function parseCourseCode(headerText: string): string | null {
  const match = headerText.match(/\b([A-Z]{2,6}\s+\d{4}[A-Z]?)\s+-\s+/);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

