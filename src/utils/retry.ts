import logger from "./logger";

type RetryOptions = {
  /**
   * Number of additional attempts after the initial attempt.
   *
   * retries: 0 → 1 total attempt
   * retries: 1 → 2 total attempts
   * retries: 2 → 3 total attempts
   */
  retries?: number;

  baseDelayMs?: number;
  maxDelayMs?: number;

  context?: Record<string, unknown>;
};

function getStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const err = error as Record<string, any>;

  if (typeof err.status === "number") {
    return err.status;
  }

  if (typeof err.response?.status === "number") {
    return err.response.status;
  }

  if (typeof err.$metadata?.httpStatusCode === "number") {
    return err.$metadata.httpStatusCode;
  }

  return undefined;
}

function isRetryableError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof error === "object") {
    const err = error as Record<string, any>;

    /**
     * Domain-level decision always wins.
     *
     * BunnyUploadError explicitly tells us whether
     * the operation should be retried.
     */
    if (err.name === "BunnyUploadError" && typeof err.retryable === "boolean") {
      return err.retryable;
    }

    /**
     * Node / Undici networking failures.
     */
    if (
      err.code === "ECONNRESET" ||
      err.code === "ETIMEDOUT" ||
      err.code === "EAI_AGAIN" ||
      err.code === "UND_ERR_CONNECT_TIMEOUT" ||
      err.code === "UND_ERR_SOCKET" ||
      err.code === "ECONNREFUSED" ||
      err.name === "AbortError" ||
      err.name === "TimeoutError"
    ) {
      return true;
    }
  }

  const status = getStatus(error);

  if (status !== undefined) {
    /**
     * Retry rate limiting and transient upstream
     * infrastructure failures.
     */
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  return false;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}

/**
 * Executes an async operation with exponential backoff
 * and jitter.
 *
 * `retries` means ADDITIONAL attempts.
 *
 * Example:
 *
 * retries: 0 → 1 total attempt
 * retries: 1 → 2 total attempts
 * retries: 2 → 3 total attempts
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 2,
    baseDelayMs = 1_000,
    maxDelayMs = 10_000,
    context = {},
  } = options;

  if (retries < 0) {
    throw new Error("Retry count cannot be negative");
  }

  let retryCount = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      const retryable = isRetryableError(error);

      const exhausted = retryCount >= retries;

      const message = getErrorMessage(error);

      if (!retryable || exhausted) {
        logger.error("Operation failed permanently", {
          retryable,
          retriesUsed: retryCount,
          maxRetries: retries,
          totalAttempts: retryCount + 1,
          error: message,
          ...context,
        });

        throw error;
      }

      retryCount += 1;

      /**
       * Exponential backoff:
       *
       * retry 1 → baseDelay
       * retry 2 → baseDelay × 2
       * retry 3 → baseDelay × 4
       */
      const exponentialDelay = Math.min(
        baseDelayMs * 2 ** (retryCount - 1),
        maxDelayMs,
      );

      /**
       * ±10% jitter.
       */
      const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);

      const delayMs = Math.max(0, exponentialDelay + jitter);

      logger.warn("Transient operation failure; retrying", {
        retryNumber: retryCount,
        maxRetries: retries,
        totalAttempt: retryCount + 1,
        delayMs: Math.round(delayMs),
        error: message,
        ...context,
      });

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }
}
