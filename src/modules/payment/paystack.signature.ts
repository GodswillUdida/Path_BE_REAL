import { createHmac, timingSafeEqual } from "crypto";

/**
 * Paystack signs the EXACT raw request bytes with HMAC-SHA512 using the
 * secret key. Verify against the Buffer, never a re-serialized object, and
 * compare in constant time.
 */
export function verifyPaystackSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;

  const expected = createHmac("sha512", secret).update(rawBody).digest();

  let received: Buffer;
  try {
    received = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}
