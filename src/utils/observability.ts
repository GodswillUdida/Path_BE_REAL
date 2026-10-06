// shared/utils/observability.ts
export async function withMetrics<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();

  try {
    const result = await fn();
    console.log(`[METRIC] ${label} success in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.error(`[METRIC] ${label} failed in ${Date.now() - start}ms`);
    throw err;
  }
}