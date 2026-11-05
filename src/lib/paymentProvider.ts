// src/lib/paymentProvider.ts
import logger from "../utils/logger";
import { unauthorized } from "../utils/errors";
import { createHmac, timingSafeEqual } from "crypto";

export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signature?: string,
): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret || !signature) return false;

  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");

  if (expected !== signature) {
    logger.warn("⚠️ Invalid Paystack signature");
    throw unauthorized("Unauthorized webhook");
  }

  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }

  // return expected === signature;
  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected.length === received.length ? Buffer.from(expected, "hex") : Buffer.alloc(0))
  );
}
