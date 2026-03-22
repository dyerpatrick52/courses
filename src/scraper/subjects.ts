import { Page } from 'playwright';

// The uOttawa course catalogue index page. It lists every subject as a link
// in the format "Computer Science (CSI)", from which we parse code and name.
const CATALOGUE_INDEX_URL = 'https://catalogue.uottawa.ca/en/courses/';

export interface ScrapedSubject {
  subject_code: string;
  subject_name: string;
}

// Navigates to the catalogue index and returns all subjects listed there.
// This is scraped once at the start of a run and reused for every term,
// since the subject list is the same regardless of term.
export async function scrapeSubjects(page: Page): Promise<ScrapedSubject[]> {
  await page.goto(CATALOGUE_INDEX_URL, { waitUntil: 'networkidle' });
  return extractSubjects(page);
}

// Finds all links on the catalogue index that point to a subject page
// (e.g. /en/courses/csi/) but not the index itself (/en/courses/).
// Each link's text looks like "Computer Science (CSI)".
async function extractSubjects(page: Page): Promise<ScrapedSubject[]> {
  const texts = await page.$$eval(
    'a[href^="/en/courses/"]:not([href="/en/courses/"])',
    els => els.map(el => el.textContent?.trim() ?? '')
  );
  return texts.map(parseSubjectText).filter((s): s is ScrapedSubject => s !== null);
}

// Parses a link label like "Computer Science (CSI)" into a structured object.
// Returns null if the text doesn't match the expected format.
function parseSubjectText(text: string): ScrapedSubject | null {
  const match = text.match(/^(.+?)\s+\(([A-Z]{2,6})\)$/);
  if (!match) return null;
  return { subject_name: match[1].trim(), subject_code: match[2] };
}
