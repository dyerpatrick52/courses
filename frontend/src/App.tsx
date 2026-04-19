import { useState, useMemo } from 'react';
import type { FormattedSchedule, GenerateRequest } from './api/types';
import { generateSchedules } from './api/client';
import { resetCourseColors } from './utils/colors';
import { useTheme } from './utils/useTheme';
import Sidebar from './components/Sidebar';
import ScheduleViewer from './components/ScheduleViewer';
import PrivacyModal from './components/PrivacyModal';

export default function App() {
  const [schedules, setSchedules] = useState<FormattedSchedule[]>([]); // all schedules returned from the API
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [generated, setGenerated] = useState(false); // true once the user has clicked Generate at least once
  const { mode, cycle } = useTheme();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // initialize from localStorage so the disclaimer doesn't re-appear after the user dismisses it
  const [rmpDisclaimerOpen, setRmpDisclaimerOpen] = useState(() => !localStorage.getItem('rmpDisclaimerSeen'));
  const [sidebarOpen, setSidebarOpen] = useState(false); // controls the mobile drawer
  const [courseNames, setCourseNames] = useState<Record<string, string>>({}); // code → title map from Sidebar

  // derive which section letters are available for each course across all generated schedules.
  // useMemo prevents this from recalculating on every render — it only runs when `schedules` changes.
  const availableSections = useMemo((): Record<string, string[]> => {
    const map: Record<string, Set<string>> = {};
    for (const schedule of schedules) {
      for (const [courseCode, courseData] of Object.entries(schedule)) {
        if (!map[courseCode]) map[courseCode] = new Set();
        for (const meeting of courseData.meetings) {
          // section_code looks like "A01" — we only want the letter prefix ("A")
          const letter = meeting.section_code.match(/^[A-Za-z]+/)?.[0];
          if (letter) map[courseCode].add(letter);
        }
      }
    }
    // convert each Set to a sorted array so the UI shows them in a consistent order
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]));
  }, [schedules]);

  // derive the overall date range for each course (earliest start, latest end across all schedules).
  // this is displayed as session dates under each course chip in the sidebar.
  const courseDateRanges = useMemo((): Record<string, { start: string; end: string }> => {
    const map: Record<string, { start: string; end: string }> = {};
    for (const schedule of schedules) {
      for (const [courseCode, courseData] of Object.entries(schedule)) {
        for (const meeting of courseData.meetings) {
          if (!map[courseCode]) {
            map[courseCode] = { start: meeting.date_start, end: meeting.date_end };
          } else {
            // string comparison works here because dates are in "YYYY-MM-DD" format (lexicographically sortable)
            if (meeting.date_start < map[courseCode].start) map[courseCode].start = meeting.date_start;
            if (meeting.date_end > map[courseCode].end) map[courseCode].end = meeting.date_end;
          }
        }
      }
    }
    return map;
  }, [schedules]);

  // called when the user clicks "Generate Schedules" in the sidebar
  async function handleGenerate(req: GenerateRequest) {
    setLoading(true);
    setError(null);
    resetCourseColors(); // clear the color assignments so new courses get fresh colors
    try {
      const res = await generateSchedules(req);
      setSchedules(res.schedules);
      setGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false); // always runs, even if the request threw
    }
  }

  return (
     <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-gray-950">
    {/* semi-transparent overlay behind the sidebar on mobile — clicking it closes the sidebar */}
    {sidebarOpen && (
      <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setSidebarOpen(false)} />
    )}

    <Sidebar onGenerate={handleGenerate} loading={loading} error={error} themeMode={mode} onThemeCycle={cycle} availableSections={availableSections}
    isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} courseDateRanges={courseDateRanges} onCourseNamesChange={setCourseNames} />

    <main className="flex-1 flex flex-col min-h-0">
      {/* hamburger button — only visible on mobile (hidden on md and up) */}
      <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <button onClick={() => setSidebarOpen(true)} className="text-gray-600 dark:text-gray-300 text-xl leading-none">☰</button>
        <span className="font-semibold text-sm text-gray-900 dark:text-white">UOScheduler</span>
      </div>

      {/* show the schedule viewer if the user has generated schedules, otherwise show the placeholder */}
      {generated ? (
        <ScheduleViewer schedules={schedules} courseNames={courseNames} />
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

      {/* one-time disclaimer shown until the user clicks "Got it" — state persists in localStorage */}
      {rmpDisclaimerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 text-sm text-gray-700 dark:text-gray-300">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">About RMP Ratings</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Professor ratings shown in this app are sourced from <span className="font-medium text-gray-700 dark:text-gray-200">Rate My Professors</span> and may be incomplete, outdated, or based on a small number of reviews. They are provided for convenience only — please do your own research before making course decisions.
            </p>
            <button
              onClick={() => {
                localStorage.setItem('rmpDisclaimerSeen', '1'); // remember that the user has seen this
                setRmpDisclaimerOpen(false);
              }}
              className="w-full py-2 rounded-lg text-white text-sm font-semibold transition-colors"
              style={{ background: 'var(--accent)' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  </div>
  );
}
