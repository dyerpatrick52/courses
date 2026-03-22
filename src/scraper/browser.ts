import { Browser, BrowserContext, Page, chromium } from 'playwright';

// Bundles the three Playwright objects we need throughout a scrape run into one
// value so we only have to pass one thing around.
export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page:    Page;
}

// Starts a headless Chromium instance and opens a single page.
// headless: true is required when running inside Docker (no display server).
export async function launchBrowser(): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();
  return { browser, context, page };
}

// Gracefully shuts down the browser. Always called in the finally block of
// runScraper so the process doesn't hang on exit.
export async function closeBrowser(session: BrowserSession): Promise<void> {
  await session.context.close();
  await session.browser.close();
}
