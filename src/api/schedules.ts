import { getSectionsForCourses, ScheduleSectionRow } from '../db/queries/sections';

export interface GenerateRequest {
  term_code: string;
  courses: string[]; // e.g. ["CSI 3140", "MAT 2141"]
  filters?: {
    allowed_sections?: Record<string, string[]>; // e.g. { "CSI 3140": ["A", "B"] }
    free_days?: string[];                         // e.g. ["Fr"]
    no_back_to_back?: boolean;
    no_three_in_row?: boolean;
    earliest_start?: string;                      // e.g. "09:00"
    latest_end?: string;                          // e.g. "17:00"
    blocked_times?: { start: string; end: string }[]; // e.g. [{ start: "12:00", end: "13:00" }]
  };
}

type Meeting = {day:string, start: number, end:number};

export interface ScheduleMeeting {
  day: string;
  start: string;
  end: string;
  component: string;
  section_code: string;
  date_start: string;
  date_end: string;
}

export interface ScheduleCourse {
  instructor: string;
  meetings: ScheduleMeeting[];
}

export type FormattedSchedule = Record<string, ScheduleCourse>;

// Splits "CSI 3140" into { subjectCode: "CSI", courseCode: "3140" }.
// The split point is the last space so codes like "GNG 1105" work correctly.
function parseCourseString(course: string): { subjectCode: string; courseCode: string } {
  const lastSpace = course.lastIndexOf(' ');
  if (lastSpace < 0) throw new Error(`Invalid course string: "${course}"`);
  return {
    subjectCode: course.slice(0, lastSpace).trim(),
    courseCode:  course.trim(),
  };
}

export async function generateSchedules(req: GenerateRequest): Promise<FormattedSchedule[]> {
  // Step 1 — Parse course strings and fetch all section rows in one query.
  const pairs = req.courses.map(parseCourseString);
  const rows = await getSectionsForCourses(req.term_code, pairs);
  const byCourse = groupByCourse(rows);
  if (byCourse.size !== req.courses.length) {
    throw new Error('One or more courses not found in the specified term');
  }
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
  const perCourseCandidates: ScheduleSectionRow[][][] = [];
  for (const [, letterMap] of byCourseThenLetter) {
    const candidates: ScheduleSectionRow[][] = [];
    for (const letterRows of letterMap.values()) {
      candidates.push(...buildSectionGroupCandidates(letterRows));
    }
    perCourseCandidates.push(candidates);
  }

  let validSchedules: ScheduleSectionRow[][]=[[]];
  for (const candidates of perCourseCandidates){
    const next: ScheduleSectionRow[][]=[];
    for (const partial of validSchedules){
      for (const candidate of candidates){
        if(!conflictsWithPartial(candidate, partial)){
          next.push([...partial, ...candidate]);
        }
      }
    }
    validSchedules = next;
  }

  if (req.filters) {
    const { free_days, no_back_to_back, no_three_in_row, earliest_start, latest_end, blocked_times } = req.filters;
    if (free_days?.length)        validSchedules = validSchedules.filter(s => !hasMeetingsOnDays(s, free_days));
    if (earliest_start)           validSchedules = validSchedules.filter(s => !hasStartBefore(s, earliest_start));
    if (latest_end)               validSchedules = validSchedules.filter(s => !hasEndAfter(s, latest_end));
    if (no_back_to_back)          validSchedules = validSchedules.filter(s => !hasBackToBack(s));
    if (no_three_in_row)          validSchedules = validSchedules.filter(s => !hasThreeInRow(s));
    if (blocked_times?.length)    validSchedules = validSchedules.filter(s => !hasBlockedTime(s, blocked_times));
  }


  return validSchedules.map(formatSchedule);

}

export function hasMeetingsOnDays(schedule: ScheduleSectionRow[], days: string[]): boolean {
    return schedule.some(row =>
      parseDayTimes(row.days_times).some(m => days.includes(m.day))
    );
  }

export function hasStartBefore(schedule: ScheduleSectionRow[], earliest_start: string): boolean{
  const earliest_start_time = timeToMinutes(earliest_start);
  return schedule.some(row => 
    parseDayTimes(row.days_times).some(meeting => (meeting.start < earliest_start_time))
  );
}

export function hasEndAfter(schedule: ScheduleSectionRow[], latest_end: string): boolean{
  const latest_end_time = timeToMinutes(latest_end);
  return schedule.some(row => 
    parseDayTimes(row.days_times).some(meeting => (meeting.end > latest_end_time))
  );
}

export function hasBlockedTime(schedule: ScheduleSectionRow[], blockedTimes: { start: string; end: string }[]): boolean {
  return schedule.some(row =>
    parseDayTimes(row.days_times).some(meeting =>
      blockedTimes.some(block => {
        const bStart = timeToMinutes(block.start);
        const bEnd   = timeToMinutes(block.end);
        return meeting.start < bEnd && bStart < meeting.end;
      })
    )
  );
}

export function hasBackToBack(schedule : ScheduleSectionRow[]): boolean {
  const allMeetings = schedule.flatMap(r => parseDayTimes(r.days_times));
  const meetingByDay = new Map<string, Meeting[]>();
  for (const m of allMeetings){
    if(!meetingByDay.has(m.day)){
      meetingByDay.set(m.day, []);
    }
    meetingByDay.get(m.day)!.push(m);
  }
  for (const day of meetingByDay.values()){
    day.sort((a, b) => a.start - b.start);
    for(let i = 0; i < day.length - 1; i++){
      if(day[i].end === day[i+1].start-10){
        return true;
      }
    }
  }
  return false;
}

export function hasThreeInRow(schedule: ScheduleSectionRow[]):boolean{
  const allMeetings = schedule.flatMap(r => parseDayTimes(r.days_times));
  const meetingByDay = new Map<string, Meeting[]>();
  for (const m of allMeetings){
    if(!meetingByDay.has(m.day)){
      meetingByDay.set(m.day, []);
    }
    meetingByDay.get(m.day)!.push(m);
  }
  for (const day of meetingByDay.values()){
    day.sort((a, b) => a.start - b.start);
    let streak = 1;
    for(let i = 0; i < day.length - 1; i++){
      if(day[i].end === day[i+1].start-10){
        streak++;
      }
      else {
        streak = 1;
      }
      if (streak === 3){
        return true;
      }
    }
  }
  return false;
}

function formatSchedule(schedule: ScheduleSectionRow[]): FormattedSchedule {
  const result: FormattedSchedule = {};
  for (const row of schedule) {
    const courseKey = row.course_code;
    if (!result[courseKey]) {
      result[courseKey] = {
        instructor: row.instructor,
        meetings:   [],
      };
    }
    const parsed = parseDayTimes(row.days_times);
    for (const m of parsed) {
      result[courseKey].meetings.push({
        day:          m.day,
        start:        row.days_times.split(' ')[1],
        end:          row.days_times.split(' ')[3],
        component:    row.component,
        section_code: row.section_code,
        date_start:   row.date_start,
        date_end:     row.date_end,
      });
    }
  }
  return result;
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

export function timeToMinutes(t: string):(number){
  const time = t.split(":");
  const hour = Number(time[0]);
  const min = Number(time[1]);
  const totalMins = hour*60 + min;
  return totalMins;
}

export function parseDayTimes(s: string): Meeting[] {
  if (!s || s.trim() === 'TBA') return [];
  const splitString = s.split(" ");
  return [{ day: splitString[0], start: timeToMinutes(splitString[1]), end: timeToMinutes(splitString[3]) }];
}

export function meetingsOverlap(a: Meeting, b: Meeting):(boolean){
  if (a.day === b.day){
    if (a.start < b.end && b.start < a.end){
      return true;
    }
  }
  return false;
}

export function conflictsWithPartial(candidate: ScheduleSectionRow[], partial: ScheduleSectionRow[]): boolean {
  const candidateMeetings = candidate.flatMap(r => parseDayTimes(r.days_times));
  const partialMeetings = partial.flatMap(r => parseDayTimes(r.days_times));
  return candidateMeetings.some(cm => partialMeetings.some(pm => meetingsOverlap(cm, pm)));
}
