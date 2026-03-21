import cron from 'node-cron';
import { runScraper } from '../scraper';

// Runs at 02:00 on the 1st of January, May, and September
const CRON_SCHEDULE = '0 2 1 1,5,9 *';

export function startScheduler(): void {
  console.log(`[scheduler] Registered cron: "${CRON_SCHEDULE}"`);
  console.log('[scheduler] Next runs: Jan 1, May 1, Sep 1 at 02:00');

  cron.schedule(CRON_SCHEDULE, async () => {
    console.log('[scheduler] Cron triggered — starting scraper');
    try {
      await runScraper();
    } catch (err) {
      console.error('[scheduler] Scraper run failed:', err);
    }
  });
}
