import { Page } from 'playwright';

// The uOttawa public class search page. All scraping of terms and sections
// starts here.
const BASE_URL =
  'https://uocampus.public.uottawa.ca/psc/csprpr9pub/EMPLOYEE/SA/c/UO_SR_AA_MODS.UO_PUB_CLSSRCH.GBL';

// CSS selectors for the interactive controls on the search page.
// The backslash-escaped $ signs are part of PeopleSoft's generated element IDs.
const SELECTORS = {
  termDropdown:    '#CLASS_SRCH_WRK2_STRM\\$35\\$',
  subjectInput:    '#SSR_CLSRCH_WRK_SUBJECT\\$0',
  catalogNbrInput: '#SSR_CLSRCH_WRK_CATALOG_NBR\\$0',
  searchButton:    '#CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH',
  openOnlyCheckbox: '#SSR_CLSRCH_WRK_SSR_OPEN_ONLY\\$0',
};

// Year of study checkboxes in the Additional Search Criteria section.
// Indices 0–4 correspond to 1st, 2nd, 3rd, 4th, and Graduate.
const YEAR_OF_STUDY_SELECTORS = [
  '#UO_PUB_SRCH_WRK_SSR_RPTCK_OPT_01\\$0',
  '#UO_PUB_SRCH_WRK_SSR_RPTCK_OPT_02\\$0',
  '#UO_PUB_SRCH_WRK_SSR_RPTCK_OPT_03\\$0',
  '#UO_PUB_SRCH_WRK_SSR_RPTCK_OPT_04\\$0',
  '#UO_PUB_SRCH_WRK_GRADUATED_TBL_CD\\$0',
];

// Loads the search page fresh. Called before every subject search to reset
// any leftover state from the previous search.
export async function navigateToSearchPage(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 100000 });
}

// Picks a term from the dropdown and waits for the page to reload with that
// term's data. termCode is a numeric string like "2251" (Winter 2025).
export async function selectTerm(page: Page, termCode: string): Promise<void> {
  await page.selectOption(SELECTORS.termDropdown, termCode);
  await page.waitForLoadState('networkidle', { timeout: 100000 });
}

// Types a subject code (e.g. "CSI") directly into the subject field and tabs
// out so the page auto-validates it. The 2-second wait lets the validation
// ajax call finish.
export async function selectSubjectFromLookup(page: Page, subjectCode: string): Promise<void> {
  await page.fill(SELECTORS.subjectInput, subjectCode);
  await page.press(SELECTORS.subjectInput, 'Tab');
  await page.waitForTimeout(2000);
}

// Types a course number into the catalog number filter (e.g. "1300").
// Used when narrowing results to a single course.
export async function fillCatalogNumber(page: Page, courseNbr: string): Promise<void> {
  await page.fill(SELECTORS.catalogNbrInput, courseNbr);
}

// Unchecks the "Open Classes Only" checkbox so all sections are returned,
// not just those with open enrollment.
export async function uncheckOpenOnly(page: Page): Promise<void> {
  const checkbox = await page.$(SELECTORS.openOnlyCheckbox);
  if (checkbox && await checkbox.isChecked()) {
    await checkbox.click();
    await page.waitForTimeout(500);
  }
}

// Clicks the Search button and waits for the results table to load.
export async function runSearch(page: Page): Promise<void> {
  await page.click(SELECTORS.searchButton);
  await page.waitForLoadState('networkidle', { timeout: 100000 }).catch(() => {});
}

// Dismisses the PeopleSoft message popup (shown for "too many results") by
// clicking its OK button.
export async function dismissPopup(page: Page): Promise<void> {
  await page.click('#okbutton');
  await page.waitForLoadState('networkidle', { timeout: 100000 });
}

// Expands the "Additional Search Criteria" section if the year checkboxes are
// not yet visible. On a fresh page load they are hidden behind this toggle.
export async function expandAdditionalCriteria(page: Page): Promise<void> {
  const yearCheckbox = await page.$(YEAR_OF_STUDY_SELECTORS[0]);
  if (yearCheckbox && await yearCheckbox.isVisible()) return;
  await page.click('text=Additional Search Criteria').catch(() => {});
  await page.waitForTimeout(1000);
}

// Checks one of the Year of Study checkboxes (0 = 1st, 1 = 2nd, … 4 = Graduate).
// Assumes expandAdditionalCriteria() has already been called.
export async function checkYearOfStudy(page: Page, yearIndex: number): Promise<void> {
  const selector = YEAR_OF_STUDY_SELECTORS[yearIndex];
  if (!selector) return;
  const checkbox = await page.$(selector);
  if (checkbox && !(await checkbox.isChecked())) {
    await checkbox.click();
    await page.waitForTimeout(500);
  }
}

// Reads the visible text of a single element. Returns '' if the element
// doesn't exist (e.g. an optional field that isn't shown for this section).
export async function readText(page: Page, selector: string): Promise<string> {
  try {
    return (await page.textContent(selector) ?? '').trim();
  } catch {
    return '';
  }
}
