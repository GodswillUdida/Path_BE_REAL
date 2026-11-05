import redis from "@/config/redis";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

const key = (email: string) => `auth:otp-attempts:${email}`;

/** Counts an attempt. Returns false once the limit is exceeded. */
export async function consumeOtpAttempt(email: string): Promise<boolean> {
  const res = await redis.multi().incr(key(email)).expire(key(email), WINDOW_SECONDS).exec();
  const count = Number(res?.[0]?.[1]);
  if (!Number.isFinite(count)) throw new Error("OTP_GUARD_UNAVAILABLE");
  return count <= MAX_ATTEMPTS;
}

export async function clearOtpAttempts(email: string): Promise<void> {
  await redis.del(key(email));
}