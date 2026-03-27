import cron from 'node-cron';
import { runScraper } from '../scraper';

// Runs at 02:00 on the 1st of April and May
const CRON_SCHEDULE = '0 2 1 4,5 *';

export function startScheduler(): void {
  console.log(`[scheduler] Registered cron: "${CRON_SCHEDULE}"`);
  console.log('[scheduler] Next runs: April 1, May 1 at 02:00');

  cron.schedule(CRON_SCHEDULE, async () => {
    console.log('[scheduler] Cron triggered — starting scraper');
    try {
      await runScraper();
    } catch (err) {
      console.error('[scheduler] Scraper run failed:', err);
    }
  });
}
