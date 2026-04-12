import type { ScheduleStatsResult } from '../utils/scheduleStats';
import { formatDuration } from '../utils/scheduleStats';

interface Props {
  stats: ScheduleStatsResult;
}

export default function ScheduleStats({ stats }: Props) {
  return (
    <div className="schedule-stats-bar flex items-center gap-1 px-5 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 shrink-0 flex-wrap">
      <Chip label="Weekly" value={formatDuration(stats.totalWeeklyMinutes)} />
      <Divider />
      <Chip label="Earliest" value={stats.earliestStart} />
      <Divider />
      <Chip label="Latest" value={stats.latestEnd} />
      <Divider />
      <Chip label="Days" value={stats.activeDays > 0 ? String(stats.activeDays) : '—'} />
      <Divider />
      <Chip label="Longest gap" value={formatDuration(stats.longestGapMinutes)} />
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 px-2">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />;
}
