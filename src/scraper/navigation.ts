import { Page } from 'playwright';

// The uOttawa public class search page. All scraping of terms and sections
// starts here.
const BASE_URL =
  'https://uocampus.public.uottawa.ca/psc/csprpr9pub/EMPLOYEE/SA/c/UO_SR_AA_MODS.UO_PUB_CLSSRCH.GBL';

// CSS selectors for the interactive controls on the search page.
// The backslash-escaped $ signs are part of PeopleSoft's generated element IDs.
const SELECTORS = {
  termDropdown:        '#CLASS_SRCH_WRK2_STRM\\$35\\$',
  subjectInput:        '#SSR_CLSRCH_WRK_SUBJECT\\$0',
  catalogNbrInput:     '#SSR_CLSRCH_WRK_CATALOG_NBR\\$0',
  subjectLookupButton: '#CLASS_SRCH_WRK2_SSR_PB_SUBJ_SRCH\\$0',
  searchButton:        '#CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH',
  backButton:          '#CLASS_SRCH_WRK2_SSR_PB_BACK',
};

// Loads the search page fresh. Called before every subject search to reset
// any leftover state from the previous search.
export async function navigateToSearchPage(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
}

// Picks a term from the dropdown and waits for the page to reload with that
// term's data. termCode is a numeric string like "2251" (Winter 2025).
export async function selectTerm(page: Page, termCode: string): Promise<void> {
  await page.selectOption(SELECTORS.termDropdown, termCode);
  await page.waitForLoadState('networkidle');
}

// Clicks the magnifying-glass lookup button next to the subject field, which
// opens a popup listing all available subjects.
export async function openSubjectLookup(page: Page): Promise<void> {
  await page.click(SELECTORS.subjectLookupButton);
  await page.waitForLoadState('networkidle');
}

// In the subject lookup popup, each letter of the alphabet is a clickable
// filter. This clicks the button for the given letter to show subjects
// starting with that letter.
export async function clickSubjectLookupLetter(page: Page, letter: string): Promise<void> {
  await page.click(`#SSR_CLSRCH_WRK2_SSR_ALPHANUM_${letter}`);
  await page.waitForLoadState('networkidle');
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

// Clicks the Search button and waits for the results table to load.
export async function runSearch(page: Page): Promise<void> {
  await page.click(SELECTORS.searchButton);
  await page.waitForLoadState('networkidle');
}

// From the search results list, clicks the class number link for a specific
// row (identified by its 0-based index) to open that section's detail page.
export async function clickSectionDetails(page: Page, index: number): Promise<void> {
  await page.click(`#MTG_CLASS_NBR\\$${index}`);
  await page.waitForLoadState('networkidle');
}

// Clicks the Back button on a section detail page to return to the search
// results list so we can click the next section.
export async function goBackToSearchResults(page: Page): Promise<void> {
  await page.click(SELECTORS.backButton);
  await page.waitForLoadState('networkidle');
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

// Reads the text of every element matching selector and returns them as an
// array, filtering out any empty strings. Used for repeating rows like
// meeting schedules where there can be 1–N entries.
export async function readAllTexts(page: Page, selector: string): Promise<string[]> {
  try {
    const elements = await page.$$(selector);
    const texts = await Promise.all(elements.map(el => el.textContent()));
    return texts.map(t => (t ?? '').trim()).filter(t => t.length > 0);
  } catch {
    return [];
  }
}
