const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 15000;

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = DEFAULT_RETRIES,
  delayMs: number = DEFAULT_DELAY_MS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) break;

      console.warn(`[retry] Attempt ${attempt}/${retries} failed — retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
