import { Page } from 'playwright';
import { selectTerm, selectSubjectFromLookup, runSearch, readText } from './navigation';

export interface ScrapedCourseHeader {
  course_code:  string;
  course_title: string;
  section_indices: number[];
}

export async function scrapeSearchResultsForSubject(
  page: Page,
  termCode: string,
  subjectCode: string
): Promise<ScrapedCourseHeader[]> {
  await selectTerm(page, termCode);
  await selectSubjectFromLookup(page, subjectCode);
  await runSearch(page);

  const hasResults = await checkForResults(page);
  if (!hasResults) return [];

  return parseCourseGroupsFromResults(page);
}

async function checkForResults(page: Page): Promise<boolean> {
  const noResultsText = await readText(page, '#DERIVED_CLSRCH_ERROR_TEXT');
  if (noResultsText.length > 0) return false;

  const groupCount = await page.$$eval(
    '[id^="win0divSSR_CLSRSLT_WRK_GROUPBOX2GP"]',
    els => els.length
  );
  return groupCount > 0;
}

async function parseCourseGroupsFromResults(page: Page): Promise<ScrapedCourseHeader[]> {
  const groups = await page.$$('[id^="SSR_CLSRSLT_WRK_GROUPBOX2$"]');
  const courses: ScrapedCourseHeader[] = [];

  let sectionIndex = 0;

  for (const group of groups) {
    const headerText = (await group.textContent() ?? '').trim();
    const parsed = parseCourseHeaderText(headerText);
    if (!parsed) continue;

    const sectionCount = await countSectionsInGroup(page, sectionIndex);
    const indices = buildSectionIndices(sectionIndex, sectionCount);

    courses.push({ ...parsed, section_indices: indices });
    sectionIndex += sectionCount;
  }

  return courses;
}

function parseCourseHeaderText(text: string): { course_code: string; course_title: string } | null {
  const match = text.match(/^([A-Z]{2,4}\s+\d{4}[A-Z]?)\s+-\s+(.+)/);
  if (!match) return null;
  return { course_code: match[1].trim(), course_title: match[2].trim() };
}

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
