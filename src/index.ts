import { startScheduler } from './scheduler';

async function main(): Promise<void> {
  console.log('[app] Starting courses scraper service');
  startScheduler();
  console.log('[app] Scheduler active — waiting for next scheduled run');
}

main().catch(err => {
  console.error('[app] Fatal error:', err);
  process.exit(1);
});
