import { SecureClientSessionOptions } from 'http2';
import { getSectionsForCourses, ScheduleSectionRow } from '../db/queries/sections';
import { compileFunction } from 'vm';

export interface GenerateRequest {
  term_code: string;
  courses: string[]; // e.g. ["CSI 3140", "MAT 2141"]
  filters?: {
    allowed_sections?: Record<string, string[]>; // e.g. { "CSI 3140": ["A", "B"] }
    free_days?: string[];                         // e.g. ["Fr"]
    no_back_to_back?: boolean;
    no_three_in_row?: boolean;
    latest_start?: string;                        // e.g. "09:00"
    earliest_end?: string;                        // e.g. "17:00"
  };
}

// Splits "CSI 3140" into { subjectCode: "CSI", courseCode: "3140" }.
// The split point is the last space so codes like "GNG 1105" work correctly.
function parseCourseString(course: string): { subjectCode: string; courseCode: string } {
  const lastSpace = course.lastIndexOf(' ');
  if (lastSpace < 0) throw new Error(`Invalid course string: "${course}"`);
  return {
    subjectCode: course.slice(0, lastSpace).trim(),
    courseCode:  course.slice(lastSpace + 1).trim(),
  };
}

export async function generateSchedules(req: GenerateRequest): Promise<void> {
  // Step 1 — Parse course strings and fetch all section rows in one query.
  const pairs = req.courses.map(parseCourseString);
  const rows = await getSectionsForCourses(req.term_code, pairs);
  const byCourse = groupByCourse(rows);
  const byCourseThenLetter = new Map<string, Map<string, ScheduleSectionRow[]>>();
  for (const [courseKey, courseRows] of byCourse) {
    let letterMap = groupBySectionLetter(courseRows);

    const allowed = req.filters?.allowed_sections?.[courseKey];
    if (allowed) {
      for (const letter of letterMap.keys()) {
        if (!allowed.includes(letter)) letterMap.delete(letter);
      }
    }

    byCourseThenLetter.set(courseKey, letterMap);
  }
}

export function groupByCourse(rows: ScheduleSectionRow[]):(Map<string, ScheduleSectionRow[]>){
    const map = new Map<string, ScheduleSectionRow[]>();
    for (const row of rows){
        const key = `${row.subject_code} ${row.course_code}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
    }
    return map;
}

export function groupBySectionLetter(rows: ScheduleSectionRow[]):(Map<string, ScheduleSectionRow[]>){
    const map = new Map<string, ScheduleSectionRow[]>();
    for (const row of rows){
        const section_code = row.section_code;
        const key = section_code.match(/^[A-Za-z]+/)?.[0] ?? section_code;
        if(!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
    }
    return map;
}

export function buildSectionGroupCandidates(rows:ScheduleSectionRow[]):(ScheduleSectionRow[][]){
    const map = new Map<string, ScheduleSectionRow[]>();
    for (const row of rows){
        const key = row.section_code
        if(!map.has(key)) map.set(key, []);
        map.get(key)!.push(row);
    }
    const lecRows: ScheduleSectionRow[] = [];
    const byComponent = new Map<string, ScheduleSectionRow[][]>();
    for (const [, sectionRows] of map){
        const component = sectionRows[0].component;
        if (component === 'LEC'){ 
            lecRows.push(...sectionRows);
        }
        else { 
            if(!byComponent.has(component)) byComponent.set(component, []);
            byComponent.get(component)!.push(sectionRows);
        }
    }
    const optionGroups: ScheduleSectionRow[][][] = [];
    if(lecRows.length > 0) optionGroups.push([lecRows]);
    for (const options of byComponent.values()) optionGroups.push(options);

    return cartesian(optionGroups);

}

function cartesian(optionGroups: ScheduleSectionRow[][][]): ScheduleSectionRow[][] {
    return optionGroups.reduce<ScheduleSectionRow[][]>(
      (acc, options) => acc.flatMap(combo => options.map(opt => [...combo, ...opt])),
      [[]]
    );
  }