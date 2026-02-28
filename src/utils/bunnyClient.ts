export const bunnyFetch = async (url: string, options: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Bunny API error: ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
};
