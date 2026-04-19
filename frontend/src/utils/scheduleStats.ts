import type { FormattedSchedule } from '../api/types';

export interface ScheduleStatsResult {
  totalWeeklyMinutes: number;
  earliestStart: string;
  latestEnd: string;
  activeDays: number;
  longestGapMinutes: number;
}

// converts a "HH:MM" string to total minutes since midnight (e.g. "10:30" → 630)
function toMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// converts total minutes back to a "HH:MM" string (e.g. 630 → "10:30")
function fromMins(m: number): string {
  // padStart(2, '0') ensures single-digit hours/minutes get a leading zero
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// computes summary statistics for a single schedule.
// used to display the stats bar and to sort schedules by preference.
export function computeStats(schedule: FormattedSchedule): ScheduleStatsResult {
  // flatMap flattens one level — turns [[m1, m2], [m3]] into [m1, m2, m3]
  const allMeetings = Object.values(schedule).flatMap(c => c.meetings);

  // return zeroed-out stats if the schedule has no meetings
  if (allMeetings.length === 0) {
    return { totalWeeklyMinutes: 0, earliestStart: '—', latestEnd: '—', activeDays: 0, longestGapMinutes: 0 };
  }

  let totalMins = 0;
  let minStart  = Infinity; // will be replaced by the first real start time
  let maxEnd    = 0;

  // group meetings by day so we can calculate gaps within each day
  const byDay = new Map<string, { start: number; end: number }[]>();

  for (const m of allMeetings) {
    const s = toMins(m.start);
    const e = toMins(m.end);
    totalMins += e - s; // add the duration of this meeting to the total
    if (s < minStart) minStart = s;
    if (e > maxEnd)   maxEnd   = e;
    if (!byDay.has(m.day)) byDay.set(m.day, []); // create the array for this day if it doesn't exist yet
    byDay.get(m.day)!.push({ start: s, end: e });
  }

  // find the longest gap between consecutive classes on the same day
  let longestGap = 0;
  for (const meetings of byDay.values()) {
    meetings.sort((a, b) => a.start - b.start); // sort by start time so we can compare adjacent meetings
    for (let i = 0; i < meetings.length - 1; i++) {
      // gap = time between the end of one class and the start of the next
      const gap = Math.max(0, meetings[i + 1].start - meetings[i].end);
      if (gap > longestGap) longestGap = gap;
    }
  }

  return {
    totalWeeklyMinutes: totalMins,
    earliestStart:      fromMins(minStart),
    latestEnd:          fromMins(maxEnd),
    activeDays:         byDay.size, // number of unique days that have at least one class
    longestGapMinutes:  longestGap,
  };
}

// formats a number of minutes into a human-readable duration string (e.g. 90 → "1h 30m")
export function formatDuration(mins: number): string {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;       // e.g. "45m"
  if (m === 0) return `${h}h`;       // e.g. "2h"
  return `${h}h ${m}m`;              // e.g. "1h 30m"
}
