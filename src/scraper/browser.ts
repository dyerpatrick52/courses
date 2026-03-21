import { Browser, BrowserContext, Page, chromium } from 'playwright';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page:    Page;
}

export async function launchBrowser(): Promise<BrowserSession> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();
  return { browser, context, page };
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  await session.context.close();
  await session.browser.close();
}
