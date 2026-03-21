import { Page } from 'playwright';
import { clickSectionDetails, goBackToSearchResults, readText, readAllTexts } from './navigation';

export interface ScrapedSectionDetail {
  section_code:    string;
  component:       string;
  status:          string;
  session:         string;
  instruction_mode: string;
  location:        string;
  campus:          string;
  date_start:      string;
  date_end:        string;
  grading_basis:   string;
  offer_number:    string;
  topic:           string;
  class_components: string;
  exam_days_times: string;
  exam_date:       string;
  course_id_ext:   string;
  units:           string;
  career:          string;
  description:     string;
  prerequisites:   string;
  attributes:      string;
  meetings:        ScrapedMeeting[];
}

export interface ScrapedMeeting {
  days_times: string;
  instructor: string;
  date_range: string;
}

export async function scrapeSectionDetails(
  page: Page,
  sectionIndices: number[]
): Promise<ScrapedSectionDetail[]> {
  const details: ScrapedSectionDetail[] = [];

  for (const index of sectionIndices) {
    const detail = await scrapeSingleSectionDetail(page, index);
    details.push(detail);
  }

  return details;
}

async function scrapeSingleSectionDetail(
  page: Page,
  index: number
): Promise<ScrapedSectionDetail> {
  await clickSectionDetails(page, index);
  const detail = await extractDetailFields(page);
  await goBackToSearchResults(page);
  return detail;
}

async function extractDetailFields(page: Page): Promise<ScrapedSectionDetail> {
  const header      = await readText(page, '#DERIVED_CLSRCH_DESCR200');
  const dateRange   = await readText(page, '#SSR_CLS_DTL_WRK_SSR_DATE_LONG');
  const meetings    = await extractMeetingRows(page);

  return {
    section_code:    parseSectionCodeFromHeader(header),
    component:       parseComponentFromSubheader(await readText(page, '#DERIVED_CLSRCH_SSS_PAGE_KEYDESCR')),
    status:          await readText(page, '#SSR_CLS_DTL_WRK_SSR_DESCRSHORT'),
    session:         await readText(page, '#PSXLATITEM_XLATLONGNAME\\$31\\$'),
    instruction_mode: await readText(page, '#INSTRUCT_MODE_DESCR'),
    location:        await readText(page, '#CAMPUS_LOC_VW_DESCR'),
    campus:          await readText(page, '#CAMPUS_TBL_DESCR'),
    date_start:      parseDateStart(dateRange),
    date_end:        parseDateEnd(dateRange),
    grading_basis:   await readText(page, '#GRADE_BASIS_TBL_DESCRFORMAL'),
    offer_number:    await readText(page, '#SSR_CLS_DTL_WRK_CRSE_OFFER_NBR'),
    topic:           await extractTopic(page),
    class_components: await readText(page, '#SSR_CLS_DTL_WRK_SSR_COMPONENT_LONG'),
    exam_days_times: await readText(page, '#MTG_SCHED1\\$0'),
    exam_date:       await readText(page, '#UO_EXM_INFO_WRK_UO_SSR_EXM_DT_LONG\\$0'),
    course_id_ext:   await readText(page, '#SSR_CLS_DTL_WRK_CRSE_ID'),
    units:           await readText(page, '#SSR_CLS_DTL_WRK_UNITS_RANGE'),
    career:          await readText(page, '#PSXLATITEM_XLATLONGNAME'),
    description:     await readText(page, '#DERIVED_CLSRCH_DESCRLONG'),
    prerequisites:   await readText(page, '#SSR_CLS_DTL_WRK_SSR_REQUISITE_LONG'),
    attributes:      await readText(page, '#SSR_CLS_DTL_WRK_SSR_CRSE_ATTR_LONG'),
    meetings,
  };
}

async function extractMeetingRows(page: Page): Promise<ScrapedMeeting[]> {
  const schedules   = await readAllTexts(page, '[id^="MTG_SCHED$"]');
  const instructors = await readAllTexts(page, '[id^="MTG_INSTR$"]');
  const dates       = await readAllTexts(page, '[id^="MTG_DATE$"]');

  return buildMeetingRows(schedules, instructors, dates);
}

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

async function extractTopic(page: Page): Promise<string> {
  return readText(page, '#DERIVED_CLSRCH_SSR_TOPIC_DESCR');
}

function parseSectionCodeFromHeader(header: string): string {
  const match = header.match(/\b([A-Z]\d{2}[A-Z]?)\b/);
  return match ? match[1] : header.split(/\s+/).slice(-1)[0] ?? '';
}

function parseComponentFromSubheader(subheader: string): string {
  const parts = subheader.split('|');
  return parts[parts.length - 1]?.trim() ?? '';
}

function parseDateStart(dateRange: string): string {
  return dateRange.split(' - ')[0]?.trim() ?? '';
}

function parseDateEnd(dateRange: string): string {
  return dateRange.split(' - ')[1]?.trim() ?? '';
}
