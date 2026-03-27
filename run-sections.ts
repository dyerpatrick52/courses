import 'dotenv/config';
import { runSections } from './src/scraper';

runSections().catch(err => {
  console.error('[scraper] Fatal:', err);
  process.exit(1);
});
