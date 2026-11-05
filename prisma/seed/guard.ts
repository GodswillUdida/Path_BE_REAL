const DEFAULT_LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal", "db", "postgres"];

function databaseHost(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("[seed] DATABASE_URL is not set");
  try {
    return new URL(raw).hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  } catch {
    throw new Error("[seed] DATABASE_URL is not a parseable URL");
  }
}

function localHosts(): Set<string> {
  const extra = (process.env.SEED_LOCAL_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return new Set([...DEFAULT_LOCAL_HOSTS, ...extra]);
}

function assertSafe(action: "seed" | "reset"): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`[seed] Refusing to ${action}: NODE_ENV=production. Run staging with NODE_ENV=staging.`);
  }
  const host = databaseHost();
  if (localHosts().has(host)) return;

  if (process.env.SEED_ALLOW_REMOTE !== "true") {
    throw new Error(`[seed] Refusing to ${action} against non-local host "${host}". Set SEED_ALLOW_REMOTE=true to override.`);
  }
  // Wiping a remote database additionally requires typing its host.
  if (action === "reset" && process.env.SEED_CONFIRM_HOST !== host) {
    throw new Error(`[seed] Remote reset requires SEED_CONFIRM_HOST=${host}`);
  }
}

export const assertSafeToSeed = (): void => assertSafe("seed");
export const assertSafeToReset = (): void => assertSafe("reset");