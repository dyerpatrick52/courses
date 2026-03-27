import 'dotenv/config';
import { runScraper } from './src/scraper';

runScraper().catch(err => {
  console.error('[scraper] Fatal:', err);
  process.exit(1);
});
