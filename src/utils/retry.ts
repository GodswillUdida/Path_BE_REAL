type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 300,
    maxDelayMs = 3000,
  } = options;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;

      const isRetryable =
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT" ||
        err?.message?.includes("fetch failed") ||
        err?.message?.includes("network");

      if (!isRetryable || attempt > retries) {
        throw err;
      }

      const delay = Math.min(
        baseDelayMs * 2 ** attempt,
        maxDelayMs,
      );

      await new Promise((res) => setTimeout(res, delay));
    }
  }
}