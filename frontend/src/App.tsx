import { useState, useMemo } from 'react';
import type { FormattedSchedule, GenerateRequest } from './api/types';
import { generateSchedules } from './api/client';
import { resetCourseColors } from './utils/colors';
import { useTheme } from './utils/useTheme';
import Sidebar from './components/Sidebar';
import ScheduleViewer from './components/ScheduleViewer';
import PrivacyModal from './components/PrivacyModal';

export default function App() {
  const [schedules, setSchedules] = useState<FormattedSchedule[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const { mode, cycle } = useTheme();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const availableSections = useMemo((): Record<string, string[]> => {
    const map: Record<string, Set<string>> = {};
    for (const schedule of schedules) {
      for (const [courseCode, courseData] of Object.entries(schedule)) {
        if (!map[courseCode]) map[courseCode] = new Set();
        for (const meeting of courseData.meetings) {
          const letter = meeting.section_code.match(/^[A-Za-z]+/)?.[0];
          if (letter) map[courseCode].add(letter);
        }
      }
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]));
  }, [schedules]);

  const courseDateRanges = useMemo((): Record<string, { start: string; end: string }> => {
    const map: Record<string, { start: string; end: string }> = {};
    for (const schedule of schedules) {
      for (const [courseCode, courseData] of Object.entries(schedule)) {
        for (const meeting of courseData.meetings) {
          if (!map[courseCode]) {
            map[courseCode] = { start: meeting.date_start, end: meeting.date_end };
          } else {
            if (meeting.date_start < map[courseCode].start) map[courseCode].start = meeting.date_start;
            if (meeting.date_end > map[courseCode].end) map[courseCode].end = meeting.date_end;
          }
        }
      }
    }
    return map;
  }, [schedules]);

  async function handleGenerate(req: GenerateRequest) {
    setLoading(true);
    setError(null);
    resetCourseColors();
    try {
      const res = await generateSchedules(req);
      setSchedules(res.schedules);
      setGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
     <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-950">
    {/* Mobile overlay backdrop */}
    {sidebarOpen && (
      <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setSidebarOpen(false)} />
    )}

    <Sidebar onGenerate={handleGenerate} loading={loading} error={error} themeMode={mode} onThemeCycle={cycle} availableSections={availableSections}
    isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} courseDateRanges={courseDateRanges} />

    <main className="flex-1 flex flex-col min-h-0">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <button onClick={() => setSidebarOpen(true)} className="text-gray-600 dark:text-gray-300 text-xl leading-none">☰</button>
        <span className="font-semibold text-sm text-gray-900 dark:text-white">UOScheduler</span>
      </div>

      {generated ? (
        <ScheduleViewer schedules={schedules} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-600">
          <span className="text-5xl">🗓️</span>
          <p className="text-sm">Select courses and click <span className="font-semibold">Generate Schedules</span>.</p>
        </div>
      )}
      <footer className="shrink-0 px-5 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-400
  dark:text-gray-600">
        <button onClick={() => setPrivacyOpen(true)} className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">Privacy</button>
        <span className="flex items-center gap-3">
          <a href="https://github.com/dyerpatrick52" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 dark:hover:text-gray-400
  transition-colors">GitHub</a>
          <a href="https://linkedin.com/in/patrick-rk-dyer" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600
  dark:hover:text-gray-400 transition-colors">LinkedIn</a>
        </span>
      </footer>
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </main>
  </div>
  );
}
