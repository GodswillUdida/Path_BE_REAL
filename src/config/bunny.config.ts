import { z } from "zod";

const bunnyConfigSchema = z.object({
  libraryId: z.string().min(1, "Bunny library ID is required"),
  apiKey: z.string().min(1, "Bunny API key is required"),
});

export type BunnyConfig = z.infer<typeof bunnyConfigSchema>;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Loads and validates Bunny Stream configuration.
 *
 * Keep Bunny credentials server-side only.
 * Never expose this config through NEXT_PUBLIC_* variables.
 */
export function getBunnyConfig(): BunnyConfig {
  return bunnyConfigSchema.parse({
    libraryId: requireEnv("BUNNY_STREAM_LIBRARY_ID"),
    apiKey: requireEnv("BUNNY_STREAM_API_KEY"),
  });
}