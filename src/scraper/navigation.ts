import { Page } from 'playwright';

const BASE_URL =
  'https://uocampus.public.uottawa.ca/psc/csprpr9pub/EMPLOYEE/SA/c/UO_SR_AA_MODS.UO_PUB_CLSSRCH.GBL';

const SELECTORS = {
  termDropdown:        '#CLASS_SRCH_WRK2_STRM\\$35\\$',
  subjectInput:        '#SSR_CLSRCH_WRK_SUBJECT\\$0',
  subjectLookupButton: '#CLASS_SRCH_WRK2_SSR_PB_SUBJ_SRCH\\$0',
  searchButton:        '#CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH',
  backButton:          '#CLASS_SRCH_WRK2_SSR_PB_BACK',
};

export async function navigateToSearchPage(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
}

export async function selectTerm(page: Page, termCode: string): Promise<void> {
  await page.selectOption(SELECTORS.termDropdown, termCode);
  await page.waitForLoadState('networkidle');
}

export async function openSubjectLookup(page: Page): Promise<void> {
  await page.click(SELECTORS.subjectLookupButton);
  await page.waitForLoadState('networkidle');
}

export async function clickSubjectLookupLetter(page: Page, letter: string): Promise<void> {
  await page.click(`#SSR_CLSRCH_WRK2_SSR_ALPHANUM_${letter}`);
  await page.waitForLoadState('networkidle');
}

export async function selectSubjectFromLookup(page: Page, subjectCode: string): Promise<void> {
  await page.fill(SELECTORS.subjectInput, subjectCode);
}

export async function runSearch(page: Page): Promise<void> {
  await page.click(SELECTORS.searchButton);
  await page.waitForLoadState('networkidle');
}

export async function clickSectionDetails(page: Page, index: number): Promise<void> {
  await page.click(`#MTG_CLASS_NBR\\$${index}`);
  await page.waitForLoadState('networkidle');
}

export async function goBackToSearchResults(page: Page): Promise<void> {
  await page.click(SELECTORS.backButton);
  await page.waitForLoadState('networkidle');
}

export async function readText(page: Page, selector: string): Promise<string> {
  try {
    return (await page.textContent(selector) ?? '').trim();
  } catch {
    return '';
  }
}

export async function readAllTexts(page: Page, selector: string): Promise<string[]> {
  try {
    const elements = await page.$$(selector);
    const texts = await Promise.all(elements.map(el => el.textContent()));
    return texts.map(t => (t ?? '').trim()).filter(t => t.length > 0);
  } catch {
    return [];
  }
}
