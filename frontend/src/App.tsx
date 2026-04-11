import { useState } from 'react';
import type { FormattedSchedule, GenerateRequest } from './api/types';
import { generateSchedules } from './api/client';
import { resetCourseColors } from './utils/colors';
import { useTheme } from './utils/useTheme';
import Sidebar from './components/Sidebar';
import ScheduleViewer from './components/ScheduleViewer';

export default function App() {
  const [schedules, setSchedules] = useState<FormattedSchedule[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const { mode, cycle } = useTheme();

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
      <Sidebar onGenerate={handleGenerate} loading={loading} error={error} themeMode={mode} onThemeCycle={cycle} />
      <main className="flex-1 flex flex-col min-h-0">
        {generated ? (
          <ScheduleViewer schedules={schedules} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-600">
            <span className="text-5xl">🗓️</span>
            <p className="text-sm">Select courses and click <span className="font-semibold">Generate Schedules</span>.</p>
          </div>
        )}
      </main>
    </div>
  );
}
