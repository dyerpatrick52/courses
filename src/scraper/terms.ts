import { Page } from 'playwright';

export interface ScrapedTerm {
  term_code: string;
  term_name: string;
}

export async function scrapeTerms(page: Page): Promise<ScrapedTerm[]> {
  const options = await page.$$('#CLASS_SRCH_WRK2_STRM\\$35\\$ option');

  const terms: ScrapedTerm[] = [];

  for (const option of options) {
    const value = await option.getAttribute('value');
    const text  = (await option.textContent() ?? '').trim();

    if (isValidTermOption(value, text)) {
      terms.push({ term_code: value!, term_name: text });
    }
  }

  return terms;
}

function isValidTermOption(value: string | null, text: string): boolean {
  return value !== null && value.trim() !== '' && text.length > 0;
}
