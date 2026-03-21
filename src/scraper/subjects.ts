import { Page } from 'playwright';
import {
  openSubjectLookup,
  clickSubjectLookupLetter,
  readAllTexts,
} from './navigation';

export interface ScrapedSubject {
  subject_code: string;
  subject_name: string;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export async function scrapeSubjectsForTerm(page: Page): Promise<ScrapedSubject[]> {
  await openSubjectLookup(page);

  const allSubjects: ScrapedSubject[] = [];

  for (const letter of LETTERS) {
    const subjects = await scrapeSubjectsForLetter(page, letter);
    allSubjects.push(...subjects);
  }

  return deduplicateSubjects(allSubjects);
}

async function scrapeSubjectsForLetter(
  page: Page,
  letter: string
): Promise<ScrapedSubject[]> {
  await clickSubjectLookupLetter(page, letter);

  const codes = await readAllTexts(page, '[id^="SSR_CLSRCH_SUBJ_SUBJECT$"]');
  const rows  = await page.$$('[id^="ACE_SSR_CLSRCH_SUBJ$"]');

  return parseSubjectRows(codes, rows);
}

async function parseSubjectRows(
  codes: string[],
  rows: Awaited<ReturnType<Page['$$']>>
): Promise<ScrapedSubject[]> {
  const subjects: ScrapedSubject[] = [];

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const name = await extractSubjectNameFromRow(rows[i], code);
    if (isValidSubject(code, name)) {
      subjects.push({ subject_code: code, subject_name: name });
    }
  }

  return subjects;
}

async function extractSubjectNameFromRow(
  row: Awaited<ReturnType<Page['$']>>,
  code: string
): Promise<string> {
  if (!row) return '';
  const fullText = (await row.textContent() ?? '').replace(/\s+/g, ' ').trim();
  const match = fullText.match(new RegExp(`^${code}\\s+(.+?)\\s+Select`));
  return match ? match[1].trim() : '';
}

function isValidSubject(code: string, name: string): boolean {
  return code.length > 0 && name.length > 0;
}

function deduplicateSubjects(subjects: ScrapedSubject[]): ScrapedSubject[] {
  const seen = new Set<string>();
  return subjects.filter(s => {
    if (seen.has(s.subject_code)) return false;
    seen.add(s.subject_code);
    return true;
  });
}
