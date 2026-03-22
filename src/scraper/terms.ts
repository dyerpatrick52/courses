import { Page } from 'playwright';

export interface ScrapedTerm {
  term_code: string;
  term_name: string;
}

// Reads all available terms from the term dropdown on the search page.
// The page must already be loaded before calling this.
// Each <option> has a numeric value (e.g. "2251") and display text
// (e.g. "Winter 2025"). Both are stored so we can label runs in the DB.
export async function scrapeTerms(page: Page): Promise<ScrapedTerm[]> {
  const options = await page.$$('#CLASS_SRCH_WRK2_STRM\\$35\\$ option');

  const terms: ScrapedTerm[] = [];

  for (const option of options) {
    const value = await option.getAttribute('value');
    const text  = (await option.textContent() ?? '').trim();

    // Skip the blank placeholder option that appears at the top of the dropdown.
    if (isValidTermOption(value, text)) {
      terms.push({ term_code: value!, term_name: text });
    }
  }

  return terms;
}

// Filters out the empty default option ("Select a term") that has no value.
function isValidTermOption(value: string | null, text: string): boolean {
  return value !== null && value.trim() !== '' && text.length > 0;
}
