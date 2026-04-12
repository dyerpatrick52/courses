import type { FormattedSchedule } from '../api/types';

export interface ScheduleStatsResult {
  totalWeeklyMinutes: number;
  earliestStart: string;
  latestEnd: string;
  activeDays: number;
  longestGapMinutes: number;
}

function toMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fromMins(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function computeStats(schedule: FormattedSchedule): ScheduleStatsResult {
  const allMeetings = Object.values(schedule).flatMap(c => c.meetings);

  if (allMeetings.length === 0) {
    return { totalWeeklyMinutes: 0, earliestStart: '—', latestEnd: '—', activeDays: 0, longestGapMinutes: 0 };
  }

  let totalMins = 0;
  let minStart  = Infinity;
  let maxEnd    = 0;

  const byDay = new Map<string, { start: number; end: number }[]>();

  for (const m of allMeetings) {
    const s = toMins(m.start);
    const e = toMins(m.end);
    totalMins += e - s;
    if (s < minStart) minStart = s;
    if (e > maxEnd)   maxEnd   = e;
    if (!byDay.has(m.day)) byDay.set(m.day, []);
    byDay.get(m.day)!.push({ start: s, end: e });
  }

  let longestGap = 0;
  for (const meetings of byDay.values()) {
    meetings.sort((a, b) => a.start - b.start);
    for (let i = 0; i < meetings.length - 1; i++) {
      const gap = Math.max(0, meetings[i + 1].start - meetings[i].end);
      if (gap > longestGap) longestGap = gap;
    }
  }

  return {
    totalWeeklyMinutes: totalMins,
    earliestStart:      fromMins(minStart),
    latestEnd:          fromMins(maxEnd),
    activeDays:         byDay.size,
    longestGapMinutes:  longestGap,
  };
}

export function formatDuration(mins: number): string {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
